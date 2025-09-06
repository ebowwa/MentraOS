package main

import (
	"context"
	"encoding/binary"
	"flag"
	"io"
	"log"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	media "github.com/livekit/media-sdk"
	lkpacer "github.com/livekit/mediatransportutil/pkg/pacer"
	lksdk "github.com/livekit/server-sdk-go/v2"
	lkmedia "github.com/livekit/server-sdk-go/v2/pkg/media"
	webrtc "github.com/pion/webrtc/v4"

	"github.com/hajimehoshi/oto/v2"
)

func int16ToBytes(samples []int16) []byte {
	out := make([]byte, len(samples)*2)
	for i := range samples {
		binary.LittleEndian.PutUint16(out[i*2:i*2+2], uint16(samples[i]))
	}
	return out
}

func main() {
	var url string
	var token string
	var target string
	flag.StringVar(&url, "url", os.Getenv("LIVEKIT_URL"), "LiveKit URL (wss://...) or env LIVEKIT_URL")
	flag.StringVar(&token, "token", os.Getenv("LIVEKIT_TOKEN"), "Access token or env LIVEKIT_TOKEN")
	flag.StringVar(&target, "target", os.Getenv("TARGET_IDENTITY"), "Subscribe only to this participant identity (optional)")
	flag.Parse()

	if url == "" || token == "" {
		log.Fatalf("url and token are required (flags or env LIVEKIT_URL, LIVEKIT_TOKEN)")
	}

	const outSampleRate = 48000
	const outChannels = 1
	ctx, ready, err := oto.NewContext(outSampleRate, outChannels, 2)
	if err != nil {
		log.Fatalf("oto.NewContext: %v", err)
	}
	<-ready
	pr, pw := io.Pipe()
	player := ctx.NewPlayer(pr)
	player.Play()
	defer player.Close()

	var cancelFns []context.CancelFunc
	pcw := &pcmWriter{w: pw, levelEvery: 50}
	trackCb := lksdk.ParticipantCallback{
		OnTrackSubscribed: func(track *webrtc.TrackRemote, publication *lksdk.RemoteTrackPublication, rp *lksdk.RemoteParticipant) {
			if track.Kind() != webrtc.RTPCodecTypeAudio {
				return
			}
			if target != "" && string(rp.Identity()) != target {
				log.Printf("skip non-target track from %s", rp.Identity())
				return
			}
			owner := string(rp.Identity())
			sid := string(publication.SID())
			log.Printf("subscribed: owner=%s sid=%s", owner, sid)

			writer := &pcm16ToOtoWriter{pw: pcw}
			pcmTrack, err := lkmedia.NewPCMRemoteTrack(track, writer,
				lkmedia.WithTargetSampleRate(outSampleRate),
				lkmedia.WithTargetChannels(outChannels),
				lkmedia.WithHandleJitter(true),
			)
			if err != nil {
				log.Printf("PCMRemoteTrack err: %v", err)
				return
			}
			cctx, cancel := context.WithCancel(context.Background())
			cancelFns = append(cancelFns, cancel)
			go func() { <-cctx.Done(); pcmTrack.Close() }()
		},
	}

	pf := lkpacer.NewPacerFactory(
		lkpacer.LeakyBucketPacer,
		lkpacer.WithBitrate(512_000),
		lkpacer.WithMaxLatency(100*time.Millisecond),
	)
	roomCallback := &lksdk.RoomCallback{ParticipantCallback: trackCb}
	room, err := lksdk.ConnectToRoomWithToken(url, token, roomCallback, lksdk.WithPacer(pf))
	if err != nil {
		log.Fatalf("connect: %v", err)
	}
	defer room.Disconnect()
	log.Printf("connected: local=%s remotes=%d", room.LocalParticipant.Identity(), len(room.GetRemoteParticipants()))

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig
	for _, c := range cancelFns {
		c()
	}
	_ = pw.Close()
}

type pcmWriter struct {
	w          io.Writer
	frames     int
	levelEvery int
}

func (p *pcmWriter) Write(b []byte) (int, error) {
	n, err := p.w.Write(b)
	if err == nil {
		p.frames++
		if p.levelEvery > 0 && p.frames%p.levelEvery == 0 {
			var sum int64
			for i := 0; i+1 < len(b); i += 2 {
				v := int16(binary.LittleEndian.Uint16(b[i : i+2]))
				if v < 0 {
					v = -v
				}
				sum += int64(v)
			}
			avg := float64(sum) / float64(len(b)/2)
			log.Printf("level avgAbs=%.0f", avg)
		}
	}
	return n, err
}

type pcm16ToOtoWriter struct{ pw *pcmWriter }

func (w *pcm16ToOtoWriter) WriteSample(sample media.PCM16Sample) error {
	data := []int16(sample)
	if len(data) == 0 {
		return nil
	}
	return writeAll(w.pw, int16ToBytes(data))
}
func (w *pcm16ToOtoWriter) Close() error { return nil }

func writeAll(w interface{ Write([]byte) (int, error) }, b []byte) error {
	for len(b) > 0 {
		n, err := w.Write(b)
		if err != nil {
			if strings.Contains(err.Error(), "interrupted") {
				continue
			}
			return err
		}
		b = b[n:]
	}
	return nil
}
