//
//  AudioManager.swift
//  MentraOS_Manager
//
//  Created by Assistant on date
//

import AVFoundation
import Combine
import Foundation

class AudioManager {
    private static var instance: AudioManager?

    private var players: [String: AVPlayer] = [:] // requestId -> player

    private var streamingPlayers: [String: AVAudioPlayer] = [:] // requestId -> streaming player
    private var cancellables = Set<AnyCancellable>()

    static func getInstance() -> AudioManager {
        if instance == nil {
            instance = AudioManager()
        }
        return instance!
    }

    private init() {
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

        if stopOtherAudio {
            stopAllAudio()
        }

        playAudioFromUrl(requestId: requestId, url: audioUrl, volume: volume)
    }

    private func playAudioFromUrl(requestId: String, url: String, volume: Float) {
        guard let audioUrl = URL(string: url) else {
            CoreCommsService.log("AudioManager: Invalid URL: \(url)")
            ServerComms.getInstance().sendAudioPlayResponse(requestId: requestId, success: false, error: "Invalid URL")
            return
        }

        CoreCommsService.log("AudioManager: Playing audio from URL: \(url)")

        let player = AVPlayer(url: audioUrl)
        player.volume = volume
        players[requestId] = player

        // Add observer for when playback ends
        NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: player.currentItem,
            queue: .main
        ) { [weak self] _ in
            self?.players.removeValue(forKey: requestId)
            ServerComms.getInstance().sendAudioPlayResponse(requestId: requestId, success: true, duration: nil)
        }

        player.play()
        CoreCommsService.log("AudioManager: Started playing audio from URL for requestId: \(requestId)")
    }

    func stopAudio(requestId: String) {
        if let player = players[requestId] {
            player.pause()
            players.removeValue(forKey: requestId)
        }

        if let streamingPlayer = streamingPlayers[requestId] {
            streamingPlayer.stop()
            streamingPlayers.removeValue(forKey: requestId)
        }

        CoreCommsService.log("AudioManager: Stopped audio for requestId: \(requestId)")
    }

    func stopAllAudio() {
        for (_, player) in players {
            player.pause()
        }
        players.removeAll()

        for (_, streamingPlayer) in streamingPlayers {
            streamingPlayer.stop()
        }
        streamingPlayers.removeAll()

        CoreCommsService.log("AudioManager: Stopped all audio")
    }
}
