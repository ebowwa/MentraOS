//
// MediaManager.swift
// MentraOS_Manager
//
// Created by Matthew Fosse on 5/13/25.
//

import Foundation
import MediaPlayer

class MediaManager: NSObject {
    private let nowPlayingInfoCenter = MPNowPlayingInfoCenter.default()
    private var mediaChangedCallback: (() -> Void)?
    private var currentMedia: [String: Any]?

    override init() {
        super.init()
        // delay setup until after login:
        // setup()
    }

    func setup() {
        // Register for notifications about now playing item changes
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleNowPlayingItemChanged),
            name: .MPMusicPlayerControllerNowPlayingItemDidChange,
            object: nil
        )

        // Begin receiving remote control events
        UIApplication.shared.beginReceivingRemoteControlEvents()

        // Initialize the music player
        let musicPlayer = MPMusicPlayerController.systemMusicPlayer
        musicPlayer.beginGeneratingPlaybackNotifications()

        print("MediaManager: Setup complete")
    }

    func setMediaChangedCallback(_ callback: @escaping () -> Void) {
        mediaChangedCallback = callback
    }

    // MARK: - Notification Handlers

    @objc private func handleNowPlayingItemChanged(notification _: Notification) {
        updateCurrentMediaInfo()
    }

    private func updateCurrentMediaInfo() {
        let newMediaInfo = nowPlayingInfoCenter.nowPlayingInfo

        // Only process if media info has changed
        if !NSDictionary(dictionary: newMediaInfo ?? [:]).isEqual(to: currentMedia ?? [:]) {
            currentMedia = newMediaInfo

            if let media = currentMedia, !media.isEmpty {
                if let title = media[MPMediaItemPropertyTitle] as? String,
                   let artist = media[MPMediaItemPropertyArtist] as? String
                {
                    print("MediaManager: Now playing \"\(title)\" by \(artist)")
                }
            } else {
                print("MediaManager: No media currently playing")
            }

            // Notify via callback
            mediaChangedCallback?()
        }
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
        UIApplication.shared.endReceivingRemoteControlEvents()
        MPMusicPlayerController.systemMusicPlayer.endGeneratingPlaybackNotifications()
    }
}
