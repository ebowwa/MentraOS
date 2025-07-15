//
//  AudioManager.swift
//  AugmentOS_Manager
//
//  Created by Assistant on date
//

import Foundation
import AVFoundation
import Combine

class AudioManager: NSObject {
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

  private override init() {
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

    // Add observer for when playback ends
    NotificationCenter.default.addObserver(
      forName: .AVPlayerItemDidPlayToEndTime,
      object: player.currentItem,
      queue: .main
    ) { [weak self] _ in
      // Get the actual duration from the player
      let durationSeconds = player.currentItem?.asset.duration.seconds
      let durationMs = durationSeconds.isFinite ? durationSeconds * 1000 : nil

      self?.cleanupPlayer(requestId: requestId)
      self?.sendAudioPlayResponse(requestId: requestId, success: true, duration: durationMs)
      CoreCommsService.log("AudioManager: Audio playback completed successfully for requestId: \(requestId), duration: \(durationMs ?? 0)ms")
    }

    // Add observer for playback failures
    NotificationCenter.default.addObserver(
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

    // Check for loading errors after a short delay
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
      if let currentItem = player.currentItem, currentItem.status == .failed {
        let errorMessage = currentItem.error?.localizedDescription ?? "Failed to load audio"
        self?.cleanupPlayer(requestId: requestId)
        self?.sendAudioPlayResponse(requestId: requestId, success: false, error: errorMessage)
        CoreCommsService.log("AudioManager: Audio loading failed for requestId: \(requestId), error: \(errorMessage)")
      }
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
    for (requestId, _) in players {
      cleanupPlayer(requestId: requestId)
    }

    for (_, streamingPlayer) in streamingPlayers {
      streamingPlayer.stop()
    }
    streamingPlayers.removeAll()


    CoreCommsService.log("AudioManager: Stopped all audio")
  }

  private func sendAudioPlayResponse(requestId: String, success: Bool, error: String? = nil, duration: Double? = nil) {
    CoreCommsService.log("AudioManager: Sending audio play response - requestId: \(requestId), success: \(success), error: \(error ?? "none")")

    // Send response back through AOSManager which will forward to React Native
    let aosManager = AOSManager.getInstance()
    aosManager.sendAudioPlayResponse(requestId: requestId, success: success, error: error, duration: duration)
  }

  // Clean up method to remove observers when stopping audio
  private func cleanupPlayer(requestId: String) {
    if let player = players[requestId] {
      // Remove notification observers
      NotificationCenter.default.removeObserver(self, name: .AVPlayerItemDidPlayToEndTime, object: player.currentItem)
      NotificationCenter.default.removeObserver(self, name: .AVPlayerItemFailedToPlayToEndTime, object: player.currentItem)

      player.pause()
      players.removeValue(forKey: requestId)
    }
  }
}
