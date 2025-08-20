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
            try audioSession.setCategory(.playback, mode: .voiceChat, options: [.allowBluetooth, .allowBluetoothA2DP, .mixWithOthers])
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
}
