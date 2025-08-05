//
//  AudioManager.swift
//  MentraOS_Manager
//
//  Created by Assistant on date
//

import AVFoundation
import Combine
import Foundation

class AudioManager: NSObject {
    private static var instance: AudioManager?

    private var players: [String: AVPlayer] = [:] // requestId -> player
    private var playerObservers: [String: [NSObjectProtocol]] = [:] // requestId -> observer tokens
    private var streamingPlayers: [String: AVAudioPlayer] = [:] // requestId -> streaming player
    private var audioEngines: [String: AVAudioEngine] = [:] // requestId -> audio engine for PCM playback
    private var audioPlayerNodes: [String: AVAudioPlayerNode] = [:] // requestId -> player node

    // Buffering properties
    private var pcmBuffers: [String: [Data]] = [:] // requestId -> array of PCM data chunks
    private var bufferSampleRates: [String: Double] = [:] // requestId -> sample rate
    private var bufferChannels: [String: AVAudioChannelCount] = [:] // requestId -> channels
    private var bufferBitDepths: [String: Int] = [:] // requestId -> bit depth
    private var bufferVolumes: [String: Float] = [:] // requestId -> volume

    private var cancellables = Set<AnyCancellable>()

    static func getInstance() -> AudioManager {
        if instance == nil {
            instance = AudioManager()
        }
        return instance!
    }

    override private init() {
        super.init()
        setupAudioSession()
    }

    private func setupAudioSession() {
        do {
            let audioSession = AVAudioSession.sharedInstance()
            try audioSession.setCategory(.playback, mode: .default, options: [.allowBluetooth, .allowBluetoothA2DP])
            try audioSession.setActive(true)
            CoreCommsService.log("AudioManager: Audio session configured successfully")
        } catch {
            CoreCommsService.log("AudioManager: Failed to setup audio session: \(error)")
        }
    }

    func playAudio(
        requestId: String,
        audioUrl: String,
        volume: Float = 1.0,
        stopOtherAudio: Bool = true
    ) {
        CoreCommsService.log("AudioManager: playAudio called with requestId: \(requestId)")

        // Clean up any existing player with the same requestId first
        cleanupPlayer(requestId: requestId)

        if stopOtherAudio {
            stopAllAudio()
        }

        playAudioFromUrl(requestId: requestId, url: audioUrl, volume: volume)
    }

    // New buffering function that accumulates PCM data chunks
    func addPCMDataToBuffer(
        requestId: String,
        pcmData: Data,
        sampleRate: Double = 16000,
        channels: AVAudioChannelCount = 1,
        bitDepth: Int = 16,
        volume: Float = 1.0,
        chunksBeforePlay: Int = 20, // Number of chunks to accumulate before playing
        stopOtherAudioOnPlay: Bool = true
    ) {
        CoreCommsService.log("AudioManager: addPCMDataToBuffer called for requestId: \(requestId), chunk size: \(pcmData.count) bytes")

        // Initialize buffer array if it doesn't exist
        if pcmBuffers[requestId] == nil {
            pcmBuffers[requestId] = []
            bufferSampleRates[requestId] = sampleRate
            bufferChannels[requestId] = channels
            bufferBitDepths[requestId] = bitDepth
            bufferVolumes[requestId] = volume
            CoreCommsService.log("AudioManager: Created new buffer for requestId: \(requestId)")
        }

        // Add PCM data to buffer
        pcmBuffers[requestId]?.append(pcmData)

        let currentChunks = pcmBuffers[requestId]?.count ?? 0
        CoreCommsService.log("AudioManager: Buffer for \(requestId) now has \(currentChunks) chunks")

        // Check if we've reached the threshold to play
        if currentChunks >= chunksBeforePlay {
            CoreCommsService.log("AudioManager: Buffer threshold reached for \(requestId), combining and playing \(currentChunks) chunks")
            playBufferedPCMData(requestId: requestId, stopOtherAudio: stopOtherAudioOnPlay)
        }
    }

    // Force play whatever is in the buffer (useful for playing remaining chunks)
    func playBufferedPCMData(requestId: String, stopOtherAudio: Bool = true) {
        guard let chunks = pcmBuffers[requestId], !chunks.isEmpty else {
            CoreCommsService.log("AudioManager: No buffered data to play for requestId: \(requestId)")
            return
        }

        // Combine all chunks into single Data object
        var combinedData = Data()
        for chunk in chunks {
            combinedData.append(chunk)
        }

        CoreCommsService.log("AudioManager: Playing combined PCM data for \(requestId), total size: \(combinedData.count) bytes from \(chunks.count) chunks")

        // Get stored parameters
        let sampleRate = bufferSampleRates[requestId] ?? 16000
        let channels = bufferChannels[requestId] ?? 1
        let bitDepth = bufferBitDepths[requestId] ?? 16
        let volume = bufferVolumes[requestId] ?? 1.0

        // Clear the buffer
        clearBuffer(requestId: requestId)

        // Play the combined data
        playPCMData(
            requestId: requestId,
            pcmData: combinedData,
            sampleRate: sampleRate,
            channels: channels,
            bitDepth: bitDepth,
            volume: volume,
            stopOtherAudio: stopOtherAudio
        )
    }

    // Clear buffer for a specific requestId
    func clearBuffer(requestId: String) {
        pcmBuffers.removeValue(forKey: requestId)
        bufferSampleRates.removeValue(forKey: requestId)
        bufferChannels.removeValue(forKey: requestId)
        bufferBitDepths.removeValue(forKey: requestId)
        bufferVolumes.removeValue(forKey: requestId)
        CoreCommsService.log("AudioManager: Cleared buffer for requestId: \(requestId)")
    }

    // Get current buffer status
    func getBufferStatus(requestId: String) -> (chunks: Int, totalBytes: Int) {
        guard let chunks = pcmBuffers[requestId] else {
            return (0, 0)
        }
        let totalBytes = chunks.reduce(0) { $0 + $1.count }
        return (chunks.count, totalBytes)
    }

    // Original function to play PCM data immediately
    func playPCMData(
        requestId: String,
        pcmData: Data,
        sampleRate: Double = 16000,
        channels: AVAudioChannelCount = 1,
        bitDepth: Int = 16,
        volume: Float = 1.0,
        stopOtherAudio: Bool = true
    ) {
        CoreCommsService.log("AudioManager: playPCMData called with requestId: \(requestId), data size: \(pcmData.count) bytes")

        // Clean up any existing audio for this requestId
        cleanupPlayer(requestId: requestId)
        cleanupPCMPlayer(requestId: requestId)

        if stopOtherAudio {
            stopAllAudio()
        }

        // Create audio format based on parameters
        guard let audioFormat = AVAudioFormat(
            commonFormat: bitDepth == 16 ? .pcmFormatInt16 : .pcmFormatFloat32,
            sampleRate: sampleRate,
            channels: channels,
            interleaved: channels > 1
        ) else {
            CoreCommsService.log("AudioManager: Failed to create audio format")
            sendAudioPlayResponse(requestId: requestId, success: false, error: "Failed to create audio format")
            return
        }

        // Calculate frame capacity based on PCM data size and format
        let bytesPerFrame = bitDepth / 8 * Int(channels)
        let frameCapacity = AVAudioFrameCount(pcmData.count / bytesPerFrame)

        // Create PCM buffer
        guard let pcmBuffer = AVAudioPCMBuffer(pcmFormat: audioFormat, frameCapacity: frameCapacity) else {
            CoreCommsService.log("AudioManager: Failed to create PCM buffer")
            sendAudioPlayResponse(requestId: requestId, success: false, error: "Failed to create PCM buffer")
            return
        }

        pcmBuffer.frameLength = frameCapacity

        // Copy PCM data to buffer
        if bitDepth == 16 {
            // For 16-bit samples
            pcmData.withUnsafeBytes { bytes in
                if let int16Pointer = pcmBuffer.int16ChannelData?[0] {
                    bytes.copyBytes(to: UnsafeMutableBufferPointer(start: int16Pointer, count: Int(frameCapacity)))
                }
            }
        } else {
            // For 32-bit float samples
            pcmData.withUnsafeBytes { bytes in
                if let floatPointer = pcmBuffer.floatChannelData?[0] {
                    bytes.copyBytes(to: UnsafeMutableBufferPointer(start: floatPointer, count: Int(frameCapacity)))
                }
            }
        }

        // Create audio engine and player node
        let audioEngine = AVAudioEngine()
        let playerNode = AVAudioPlayerNode()

        audioEngine.attach(playerNode)

        // Connect player node to main mixer with volume
        let mainMixer = audioEngine.mainMixerNode
        audioEngine.connect(playerNode, to: mainMixer, format: audioFormat)
        mainMixer.outputVolume = volume

        // Store references
        audioEngines[requestId] = audioEngine
        audioPlayerNodes[requestId] = playerNode

        do {
            // Start the engine
            try audioEngine.start()

            // Calculate duration
            let durationSeconds = Double(frameCapacity) / sampleRate
            let durationMs = durationSeconds * 1000

            // Schedule buffer and play
            playerNode.scheduleBuffer(pcmBuffer, at: nil, options: []) { [weak self] in
                DispatchQueue.main.async {
                    self?.cleanupPCMPlayer(requestId: requestId)
                    self?.sendAudioPlayResponse(requestId: requestId, success: true, duration: durationMs)
                    CoreCommsService.log("AudioManager: PCM playback completed for requestId: \(requestId), duration: \(durationSeconds)s")
                }
            }

            playerNode.play()
            CoreCommsService.log("AudioManager: Started playing PCM data for requestId: \(requestId)")

        } catch {
            CoreCommsService.log("AudioManager: Failed to start audio engine: \(error)")
            cleanupPCMPlayer(requestId: requestId)
            sendAudioPlayResponse(requestId: requestId, success: false, error: "Failed to start audio engine: \(error.localizedDescription)")
        }
    }

    // Alternative convenience method that accepts byte array
    func playPCMBytes(
        requestId: String,
        pcmBytes: [UInt8],
        sampleRate: Double = 16000,
        channels: AVAudioChannelCount = 1,
        bitDepth: Int = 16,
        volume: Float = 1.0,
        stopOtherAudio: Bool = true
    ) {
        let pcmData = Data(pcmBytes)
        playPCMData(
            requestId: requestId,
            pcmData: pcmData,
            sampleRate: sampleRate,
            channels: channels,
            bitDepth: bitDepth,
            volume: volume,
            stopOtherAudio: stopOtherAudio
        )
    }

    private func playAudioFromUrl(requestId: String, url: String, volume: Float) {
        guard let audioUrl = URL(string: url) else {
            CoreCommsService.log("AudioManager: Invalid URL: \(url)")
            sendAudioPlayResponse(requestId: requestId, success: false, error: "Invalid URL")
            return
        }

        CoreCommsService.log("AudioManager: Playing audio from URL: \(url)")

        let player = AVPlayer(url: audioUrl)
        player.volume = volume
        players[requestId] = player

        var observers: [NSObjectProtocol] = []

        // Add observer for when playback ends
        let endObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: player.currentItem,
            queue: .main
        ) { [weak self] _ in
            // Get the actual duration from the player
            let durationSeconds = player.currentItem?.asset.duration.seconds
            let durationMs = durationSeconds.flatMap { $0.isFinite ? $0 * 1000 : nil }

            self?.cleanupPlayer(requestId: requestId)
            self?.sendAudioPlayResponse(requestId: requestId, success: true, duration: durationMs)
            CoreCommsService.log("AudioManager: Audio playback completed successfully for requestId: \(requestId), duration: \(durationSeconds ?? 0)s")
        }
        observers.append(endObserver)

        // Add observer for playback failures
        let failObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemFailedToPlayToEndTime,
            object: player.currentItem,
            queue: .main
        ) { [weak self] notification in
            var errorMessage = "Playback failed"
            if let error = notification.userInfo?[AVPlayerItemFailedToPlayToEndTimeErrorKey] as? NSError {
                errorMessage = "Playback failed: \(error.localizedDescription)"
            }

            self?.cleanupPlayer(requestId: requestId)
            self?.sendAudioPlayResponse(requestId: requestId, success: false, error: errorMessage)
            CoreCommsService.log("AudioManager: Audio playback failed for requestId: \(requestId), error: \(errorMessage)")
        }
        observers.append(failObserver)

        playerObservers[requestId] = observers

        // Check for loading errors after a short delay
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
            // Only check if the player still exists (hasn't been cleaned up)
            guard let currentPlayer = self?.players[requestId],
                  let currentItem = currentPlayer.currentItem,
                  currentItem.status == .failed
            else {
                return
            }

            let errorMessage = currentItem.error?.localizedDescription ?? "Failed to load audio"
            self?.cleanupPlayer(requestId: requestId)
            self?.sendAudioPlayResponse(requestId: requestId, success: false, error: errorMessage)
            CoreCommsService.log("AudioManager: Audio loading failed for requestId: \(requestId), error: \(errorMessage)")
        }

        player.play()
        CoreCommsService.log("AudioManager: Started playing audio from URL for requestId: \(requestId)")
    }

    func stopAudio(requestId: String) {
        cleanupPlayer(requestId: requestId)
        cleanupPCMPlayer(requestId: requestId)
        clearBuffer(requestId: requestId)

        if let streamingPlayer = streamingPlayers[requestId] {
            streamingPlayer.stop()
            streamingPlayers.removeValue(forKey: requestId)
        }

        CoreCommsService.log("AudioManager: Stopped audio for requestId: \(requestId)")
    }

    func stopAllAudio() {
        // Clean up all players
        let allRequestIds = Array(players.keys)
        for requestId in allRequestIds {
            cleanupPlayer(requestId: requestId)
        }

        // Clean up all PCM players
        let allPCMRequestIds = Array(audioEngines.keys)
        for requestId in allPCMRequestIds {
            cleanupPCMPlayer(requestId: requestId)
        }

        // Clear all buffers
        let allBufferRequestIds = Array(pcmBuffers.keys)
        for requestId in allBufferRequestIds {
            clearBuffer(requestId: requestId)
        }

        // Clean up streaming players
        for (_, streamingPlayer) in streamingPlayers {
            streamingPlayer.stop()
        }
        streamingPlayers.removeAll()

        CoreCommsService.log("AudioManager: Stopped all audio")
    }

    private func sendAudioPlayResponse(requestId: String, success: Bool, error: String? = nil, duration: Double? = nil) {
        CoreCommsService.log("AudioManager: Sending audio play response - requestId: \(requestId), success: \(success), error: \(error ?? "none")")

        // Send response back through ServerComms which will forward to React Native
        let serverComms = ServerComms.getInstance()
        serverComms.sendAudioPlayResponse(requestId: requestId, success: success, error: error, duration: duration)
    }

    // Clean up method to remove observers when stopping audio
    private func cleanupPlayer(requestId: String) {
        // Remove and clean up notification observers
        if let observers = playerObservers[requestId] {
            for observer in observers {
                NotificationCenter.default.removeObserver(observer)
            }
            playerObservers.removeValue(forKey: requestId)
        }

        // Clean up player
        if let player = players[requestId] {
            player.pause()
            players.removeValue(forKey: requestId)
        }
    }

    // Clean up PCM player resources
    private func cleanupPCMPlayer(requestId: String) {
        // Stop and remove player node
        if let playerNode = audioPlayerNodes[requestId] {
            playerNode.stop()
            audioPlayerNodes.removeValue(forKey: requestId)
        }

        // Stop and remove audio engine
        if let audioEngine = audioEngines[requestId] {
            audioEngine.stop()
            audioEngines.removeValue(forKey: requestId)
        }
    }
}
