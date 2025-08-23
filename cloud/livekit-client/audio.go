package main

import (
	"encoding/binary"
	"math"
)

// AudioResampler handles conversion between 16kHz and 48kHz
type AudioResampler struct {
	// Simple linear interpolation for upsampling
	// and decimation for downsampling
}

// Resample16to48 converts 16kHz PCM to 48kHz PCM
// Ratio is 3:1, so we need to interpolate 2 samples between each original sample
func Resample16to48(input []byte) []byte {
	// Input is 16-bit PCM, so 2 bytes per sample
	inputSamples := len(input) / 2
	outputSamples := inputSamples * 3
	output := make([]byte, outputSamples*2)

	for i := 0; i < inputSamples; i++ {
		// Read 16-bit sample
		sample := int16(binary.LittleEndian.Uint16(input[i*2 : i*2+2]))

		// Get next sample for interpolation (or use current if at end)
		var nextSample int16
		if i < inputSamples-1 {
			nextSample = int16(binary.LittleEndian.Uint16(input[i*2+2 : i*2+4]))
		} else {
			nextSample = sample
		}

		// Write original sample
		binary.LittleEndian.PutUint16(output[i*6:i*6+2], uint16(sample))

		// Interpolate two samples between current and next
		interp1 := sample + (nextSample-sample)/3
		interp2 := sample + (nextSample-sample)*2/3

		binary.LittleEndian.PutUint16(output[i*6+2:i*6+4], uint16(interp1))
		binary.LittleEndian.PutUint16(output[i*6+4:i*6+6], uint16(interp2))
	}

	return output
}

// Resample48to16 converts 48kHz PCM to 16kHz PCM
// Ratio is 3:1, so we take every 3rd sample
func Resample48to16(input []byte) []byte {
	// Input is 16-bit PCM, so 2 bytes per sample
	inputSamples := len(input) / 2
	outputSamples := inputSamples / 3
	output := make([]byte, outputSamples*2)

	for i := 0; i < outputSamples; i++ {
		// Take every 3rd sample
		sample := binary.LittleEndian.Uint16(input[i*6 : i*6+2])
		binary.LittleEndian.PutUint16(output[i*2:i*2+2], sample)
	}

	return output
}

// ConvertPCMToOpus placeholder - in production would use opus encoder
func ConvertPCMToOpus(pcm []byte, sampleRate int) []byte {
	// TODO: Implement actual Opus encoding
	// For now return PCM (won't work with LiveKit)
	return pcm
}

// ConvertOpusToPCM placeholder - in production would use opus decoder
func ConvertOpusToPCM(opus []byte, sampleRate int) []byte {
	// TODO: Implement actual Opus decoding
	// For now return opus data (won't work correctly)
	return opus
}

// NormalizePCM16 ensures audio levels are within safe range
func NormalizePCM16(input []byte) []byte {
	samples := len(input) / 2
	output := make([]byte, len(input))

	// Find peak amplitude
	var peak int16
	for i := 0; i < samples; i++ {
		sample := int16(binary.LittleEndian.Uint16(input[i*2 : i*2+2]))
		if sample < 0 {
			sample = -sample
		}
		if sample > peak {
			peak = sample
		}
	}

	// If peak is too low or at max, don't normalize
	if peak < 1000 || peak >= 32767 {
		copy(output, input)
		return output
	}

	// Calculate scaling factor to reach 90% of max
	scale := float64(29490) / float64(peak) // 90% of 32767

	// Apply scaling
	for i := 0; i < samples; i++ {
		sample := int16(binary.LittleEndian.Uint16(input[i*2 : i*2+2]))
		normalized := int16(math.Min(math.Max(float64(sample)*scale, -32768), 32767))
		binary.LittleEndian.PutUint16(output[i*2:i*2+2], uint16(normalized))
	}

	return output
}