package main

import (
	"bufio"
	"context"
	"encoding/binary"
	"errors"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	mp3 "github.com/hajimehoshi/go-mp3"
)

// Publisher manages URL playback into a LiveKit PCM track
type Publisher struct {
	client *BridgeClient
	cancel context.CancelFunc
	active string // requestId
}

func NewPublisher(c *BridgeClient) *Publisher { return &Publisher{client: c} }

func (p *Publisher) Stop(reason string) {
	if p.cancel != nil {
		p.cancel()
	}
}

type PlayURLCmd struct {
	RequestID  string  `json:"requestId"`
	Url        string  `json:"url"`
	Volume     float64 `json:"volume,omitempty"`
	SampleRate int     `json:"sampleRate,omitempty"`
}

func (p *Publisher) HandlePlayURL(cmd PlayURLCmd) {
	ctx, cancel := context.WithCancel(context.Background())
	p.cancel = cancel
	p.active = cmd.RequestID

	if err := p.client.ensurePublishTrack(); err != nil {
		p.client.sendPlayComplete(cmd.RequestID, false, 0, "ensure_track_failed")
		return
	}

	// Fetch URL
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, cmd.Url, nil)
	if err != nil {
		p.client.sendPlayComplete(cmd.RequestID, false, 0, "bad_url")
		return
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		p.client.sendPlayComplete(cmd.RequestID, false, 0, "fetch_failed")
		return
	}
	defer resp.Body.Close()

	// Basic diagnostics
	status := resp.StatusCode
	ctype := strings.ToLower(resp.Header.Get("content-type"))
	log.Printf("play_url start: reqId=%s url=%s status=%d ctype=%s", cmd.RequestID, cmd.Url, status, ctype)

	// Non-200 responses are treated as failures
	if status < 200 || status >= 300 {
		p.client.sendPlayComplete(cmd.RequestID, false, 0, "http_status_"+http.StatusText(status))
		return
	}
	// Notify start; if this fails to send, abort early to avoid wasted work
	if !p.client.trySendJSON(map[string]interface{}{
		"type":      "play_started",
		"requestId": cmd.RequestID,
		"url":       cmd.Url,
	}) {
		log.Printf("play_url early abort: cannot notify start (reqId=%s)", cmd.RequestID)
		return
	}

	// Support MP3 (audio/mpeg) and WAV (audio/wav, audio/x-wav, audio/wave)
	if strings.Contains(ctype, "audio/mpeg") || strings.HasSuffix(strings.ToLower(cmd.Url), ".mp3") {
		log.Printf("play_url decoder: mp3")
		p.streamMP3(ctx, resp.Body, cmd)
		return
	}
	if strings.Contains(ctype, "audio/wav") || strings.Contains(ctype, "audio/x-wav") || strings.Contains(ctype, "audio/wave") || strings.HasSuffix(strings.ToLower(cmd.Url), ".wav") {
		log.Printf("play_url decoder: wav")
		p.streamWAV(ctx, resp.Body, cmd)
		return
	}
	log.Printf("play_url unsupported content-type: %s (url=%s)", ctype, cmd.Url)
	p.client.sendPlayComplete(cmd.RequestID, false, 0, "unsupported_content_type")
}

func bytesToI16(pcm []byte) []int16 {
	if len(pcm)%2 == 1 {
		pcm = pcm[:len(pcm)-1]
	}
	out := make([]int16, len(pcm)/2)
	for i := 0; i < len(out); i++ {
		out[i] = int16(binary.LittleEndian.Uint16(pcm[i*2:]))
	}
	return out
}

func applyGain(samples []int16, gain float64) {
	if gain == 1.0 {
		return
	}
	for i := range samples {
		v := float64(samples[i]) * gain
		if v > 32767 {
			v = 32767
		} else if v < -32768 {
			v = -32768
		}
		samples[i] = int16(v)
	}
}

// --- MP3 decode and resample to 16kHz mono ---

type resampleState struct {
	buf  []int16
	pos  float64 // fractional read head within buf
	step float64 // srcSR / dstSR
}

// push returns as many dst samples as possible after appending in to the buffer
func (s *resampleState) push(in []int16) []int16 {
	// Append new samples
	s.buf = append(s.buf, in...)
	if len(s.buf) < 2 { // need at least 2 for linear interpolation
		return nil
	}
	out := make([]int16, 0, len(s.buf))
	for {
		i := int(s.pos)
		if i+1 >= len(s.buf) {
			break
		}
		frac := s.pos - float64(i)
		s0 := float64(s.buf[i])
		s1 := float64(s.buf[i+1])
		v := s0 + (s1-s0)*frac
		if v > 32767 {
			v = 32767
		} else if v < -32768 {
			v = -32768
		}
		out = append(out, int16(v))
		s.pos += s.step
	}
	// Drop fully consumed input but keep one sample of lookahead
	drop := int(s.pos)
	if drop > 0 {
		if drop >= len(s.buf) {
			s.buf = s.buf[:0]
			s.pos = 0
		} else {
			s.buf = s.buf[drop:]
			s.pos -= float64(drop)
		}
	}
	return out
}

func (p *Publisher) streamMP3(ctx context.Context, r io.Reader, cmd PlayURLCmd) {
	dec, err := mp3.NewDecoder(r)
	if err != nil {
		p.client.sendPlayComplete(cmd.RequestID, false, 0, "mp3_decode_error")
		return
	}
	srcSR := dec.SampleRate()
	if srcSR <= 0 {
		p.client.sendPlayComplete(cmd.RequestID, false, 0, "mp3_sr_invalid")
		return
	}
	const dstSR = 16000
	st := &resampleState{step: float64(srcSR) / float64(dstSR)}
	bytesPerRead := 4096
	buf := make([]byte, bytesPerRead)
	var totalOut int64
	start := time.Now()

	// We assume mp3 decoder yields 16-bit LE PCM mono or stereo interleaved.
	// go-mp3 outputs stereo as interleaved 2-channel? Its decoder is typically stereo. We'll downmix.
	// We'll treat every pair of bytes as one sample per channel; if stereo, average L/R.

	for {
		n, err := dec.Read(buf)
		if n > 0 {
			// Convert bytes to int16 samples
			samples := bytesToI16(buf[:n])
			// Downmix stereo if odd count suggests stereo? We can't know channels from decoder; assume stereo if len%2==0 and srcSR typical 44100.
			// Simple heuristic: if we have even number of samples and length is large, attempt downmix by averaging pairs.
			if len(samples) >= 2 {
				// naive downmix L/R to mono if stereo
				mono := make([]int16, len(samples)/2)
				for i := 0; i+1 < len(samples); i += 2 {
					v := int32(samples[i]) + int32(samples[i+1])
					mono[i/2] = int16(v / 2)
				}
				samples = mono
			}

			// Resample to 16k
			out := st.push(samples)
			if len(out) > 0 {
				if cmd.Volume > 0 && cmd.Volume != 1.0 {
					applyGain(out, cmd.Volume)
				}
				// write in 10ms frames (160 samples)
				const frameSamp = dstSR / 100
				for i := 0; i < len(out); i += frameSamp {
					end := i + frameSamp
					if end > len(out) {
						end = len(out)
					}
					if err := p.client.writeSamples(out[i:end]); err != nil {
						log.Printf("writeSamples error: %v", err)
						// continue
					}
				}
				totalOut += int64(len(out))
			}
		}
		if err != nil {
			if !errors.Is(err, io.EOF) {
				log.Printf("mp3 read error: %v", err)
			}
			break
		}
		select {
		case <-ctx.Done():
			// cancelled
			p.client.sendPlayComplete(cmd.RequestID, false, int(time.Since(start).Milliseconds()), "cancelled")
			return
		default:
		}
	}

	durMs := int(time.Since(start).Milliseconds())
	p.client.sendPlayComplete(cmd.RequestID, totalOut > 0, durMs, "")
}

// --- WAV (PCM16) streaming ---

func (p *Publisher) streamWAV(ctx context.Context, r io.Reader, cmd PlayURLCmd) {
	br := bufio.NewReader(r)

	// Parse RIFF header
	header := make([]byte, 12)
	if _, err := io.ReadFull(br, header); err != nil {
		p.client.sendPlayComplete(cmd.RequestID, false, 0, "wav_header_read")
		return
	}
	if string(header[0:4]) != "RIFF" || string(header[8:12]) != "WAVE" {
		p.client.sendPlayComplete(cmd.RequestID, false, 0, "wav_not_riff_wave")
		return
	}

	var (
		numChans      uint16
		sampleRate    uint32
		bitsPerSample uint16
		dataBytes     uint32
	)

	// Read chunks until we find fmt and data
	haveFmt := false
	haveData := false

	for {
		// Each chunk: 4-byte id + 4-byte size
		hdr := make([]byte, 8)
		if _, err := io.ReadFull(br, hdr); err != nil {
			p.client.sendPlayComplete(cmd.RequestID, false, 0, "wav_chunk_header")
			return
		}
		cid := string(hdr[0:4])
		size := binary.LittleEndian.Uint32(hdr[4:8])
		if cid == "fmt " {
			// We expect at least 16 bytes for PCM
			buf := make([]byte, size)
			if _, err := io.ReadFull(br, buf); err != nil {
				p.client.sendPlayComplete(cmd.RequestID, false, 0, "wav_fmt_read")
				return
			}
			// Chunks are padded to even sizes; consume pad byte if present
			if size%2 == 1 {
				if _, err := br.ReadByte(); err != nil {
					p.client.sendPlayComplete(cmd.RequestID, false, 0, "wav_fmt_pad")
					return
				}
			}
			// AudioFormat (2), NumChannels (2), SampleRate (4), ByteRate (4), BlockAlign (2), BitsPerSample (2)
			if size < 16 {
				p.client.sendPlayComplete(cmd.RequestID, false, 0, "wav_fmt_short")
				return
			}
			audioFormat := binary.LittleEndian.Uint16(buf[0:2])
			numChans = binary.LittleEndian.Uint16(buf[2:4])
			sampleRate = binary.LittleEndian.Uint32(buf[4:8])
			// byteRate := binary.LittleEndian.Uint32(buf[8:12])
			// blockAlign := binary.LittleEndian.Uint16(buf[12:14])
			bitsPerSample = binary.LittleEndian.Uint16(buf[14:16])
			if audioFormat != 1 { // PCM only
				p.client.sendPlayComplete(cmd.RequestID, false, 0, "wav_fmt_not_pcm")
				return
			}
			if bitsPerSample != 16 {
				p.client.sendPlayComplete(cmd.RequestID, false, 0, "wav_bits_not_16")
				return
			}
			if numChans != 1 && numChans != 2 {
				p.client.sendPlayComplete(cmd.RequestID, false, 0, "wav_channels_unsupported")
				return
			}
			haveFmt = true
		} else if cid == "data" {
			dataBytes = size
			haveData = true
			break // data follows immediately
		} else {
			// Skip unknown chunk
			if _, err := io.CopyN(io.Discard, br, int64(size)); err != nil {
				p.client.sendPlayComplete(cmd.RequestID, false, 0, "wav_skip_chunk")
				return
			}
			if size%2 == 1 { // consume pad byte
				if _, err := br.ReadByte(); err != nil {
					p.client.sendPlayComplete(cmd.RequestID, false, 0, "wav_skip_pad")
					return
				}
			}
		}
	}

	if !haveFmt || !haveData {
		p.client.sendPlayComplete(cmd.RequestID, false, 0, "wav_missing_fmt_or_data")
		return
	}

	// Stream dataBytes from br
	dstSR := 16000
	st := &resampleState{step: float64(sampleRate) / float64(dstSR)}
	bytesPerFrame := int(bitsPerSample/8) * int(numChans)
	if bytesPerFrame <= 0 {
		p.client.sendPlayComplete(cmd.RequestID, false, 0, "wav_frame_size")
		return
	}

	// Read in chunks
	readLeft := int64(dataBytes)
	buf := make([]byte, 4096-(4096%bytesPerFrame))
	if len(buf) == 0 {
		buf = make([]byte, bytesPerFrame)
	}
	var totalOut int64
	start := time.Now()

	for readLeft > 0 {
		toRead := int64(len(buf))
		if toRead > readLeft {
			toRead = readLeft
		}
		n, err := io.ReadFull(br, buf[:toRead])
		if err != nil {
			if err == io.ErrUnexpectedEOF || err == io.EOF {
				// partial at end; proceed with n
			} else {
				p.client.sendPlayComplete(cmd.RequestID, false, 0, "wav_data_read")
				return
			}
		}
		if n <= 0 {
			break
		}
		readLeft -= int64(n)
		data := buf[:n]

		// Convert to mono int16 samples
		if numChans == 1 {
			samples := bytesToI16(data)
			// resample if needed
			out := samples
			if int(sampleRate) != dstSR {
				out = st.push(samples)
			}
			if len(out) > 0 {
				if cmd.Volume > 0 && cmd.Volume != 1.0 {
					applyGain(out, cmd.Volume)
				}
				// write 10ms frames (160 samples)
				frameSamp := dstSR / 100
				for i := 0; i < len(out); i += frameSamp {
					end := i + frameSamp
					if end > len(out) {
						end = len(out)
					}
					if err := p.client.writeSamples(out[i:end]); err != nil {
						log.Printf("writeSamples error: %v", err)
					}
				}
				totalOut += int64(len(out))
			}
		} else {
			// Downmix stereo to mono first
			s := bytesToI16(data)
			mono := make([]int16, len(s)/2)
			for i := 0; i+1 < len(s); i += 2 {
				v := int32(s[i]) + int32(s[i+1])
				mono[i/2] = int16(v / 2)
			}
			out := mono
			if int(sampleRate) != dstSR {
				out = st.push(mono)
			}
			if len(out) > 0 {
				if cmd.Volume > 0 && cmd.Volume != 1.0 {
					applyGain(out, cmd.Volume)
				}
				frameSamp := dstSR / 100
				for i := 0; i < len(out); i += frameSamp {
					end := i + frameSamp
					if end > len(out) {
						end = len(out)
					}
					if err := p.client.writeSamples(out[i:end]); err != nil {
						log.Printf("writeSamples error: %v", err)
					}
				}
				totalOut += int64(len(out))
			}
		}

		select {
		case <-ctx.Done():
			p.client.sendPlayComplete(cmd.RequestID, false, int(time.Since(start).Milliseconds()), "cancelled")
			return
		default:
		}
	}

	durMs := int(time.Since(start).Milliseconds())
	p.client.sendPlayComplete(cmd.RequestID, totalOut > 0, durMs, "")
}
