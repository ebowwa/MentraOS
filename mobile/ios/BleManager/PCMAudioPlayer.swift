//
//  PCMAudioPlayer.swift
//  AOS
//
//  Created by Matthew Fosse on 8/8/25.
//

import AVFoundation
import Foundation

class PCMAudioPlayer {
    private var audioEngine: AVAudioEngine
    private var playerNode: AVAudioPlayerNode
    private var mixer: AVAudioMixerNode
    private var format: AVAudioFormat
    private var isPlaying = false
    private let bufferSize: AVAudioFrameCount = 1024

    init?() {
        audioEngine = AVAudioEngine()
        playerNode = AVAudioPlayerNode()
        mixer = audioEngine.mainMixerNode

        // Create audio format for 16kHz, mono, 16-bit PCM
        guard let audioFormat = AVAudioFormat(
            commonFormat: .pcmFormatInt16,
            sampleRate: 16000,
            channels: 1,
            interleaved: false
        ) else {
            CoreCommsService.log("Failed to create audio format for PCM playback")
            return nil
        }

        format = audioFormat

        // Attach and connect nodes
        audioEngine.attach(playerNode)
        audioEngine.connect(playerNode, to: mixer, format: format)

        // Configure audio session for playback
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetooth])
            try session.setActive(true)
        } catch {
            CoreCommsService.log("Failed to configure audio session for PCM playback: \(error)")
            return nil
        }
    }

    func start() {
        guard !isPlaying else { return }

        do {
            try audioEngine.start()
            playerNode.play()
            isPlaying = true
            CoreCommsService.log("PCM audio playback started")
        } catch {
            CoreCommsService.log("Failed to start audio engine: \(error)")
        }
    }

    func stop() {
        guard isPlaying else { return }

        playerNode.stop()
        audioEngine.stop()
        isPlaying = false
        CoreCommsService.log("PCM audio playback stopped")
    }

    func playPCMData(_ pcmData: Data) {
        if !isPlaying {
            start()
        }

        // Convert Data to PCM buffer
        guard let pcmBuffer = dataToPCMBuffer(pcmData) else {
            CoreCommsService.log("Failed to convert PCM data to buffer")
            return
        }

        // Schedule buffer for playback
        playerNode.scheduleBuffer(pcmBuffer, completionHandler: nil)
    }

    private func dataToPCMBuffer(_ data: Data) -> AVAudioPCMBuffer? {
        let frameCount = UInt32(data.count) / format.streamDescription.pointee.mBytesPerFrame

        guard let pcmBuffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount) else {
            return nil
        }

        pcmBuffer.frameLength = frameCount

        // Copy data to buffer
        data.withUnsafeBytes { bytes in
            if let int16Pointer = pcmBuffer.int16ChannelData?[0] {
                let sourcePointer = bytes.bindMemory(to: Int16.self)
                int16Pointer.update(from: sourcePointer.baseAddress!, count: Int(frameCount))
            }
        }

        return pcmBuffer
    }

    deinit {
        stop()
    }
}
