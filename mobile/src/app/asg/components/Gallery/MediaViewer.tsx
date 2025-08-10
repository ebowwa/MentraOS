/**
 * Media viewer component that handles both images and videos
 */

import React, {useState, useRef} from "react"
import {View, TouchableOpacity, Text, Modal, StyleSheet, Dimensions, StatusBar} from "react-native"
import Video from "react-native-video"
import {PhotoInfo} from "../../types"
import {useAppTheme} from "@/utils/useAppTheme"
import {ThemedStyle, spacing} from "@/theme"
import {ViewStyle, TextStyle} from "react-native"
import {useSafeAreaInsets} from "react-native-safe-area-context"
import {ImageViewer} from "./ImageViewer"

interface MediaViewerProps {
  visible: boolean
  photo: PhotoInfo | null
  onClose: () => void
  onShare?: () => void
  onDelete?: () => void
}

export function MediaViewer({visible, photo, onClose, onShare, onDelete}: MediaViewerProps) {
  const {themed} = useAppTheme()
  const insets = useSafeAreaInsets()
  const videoRef = useRef<Video>(null)
  const [isPlaying, setIsPlaying] = useState(true)
  const [showControls, setShowControls] = useState(true)

  if (!photo) return null

  // Determine if this is a video
  const isVideo =
    photo.is_video || photo.mime_type?.startsWith("video/") || photo.name.match(/\.(mp4|mov|avi|webm|mkv)$/i)

  // For images, use our custom image viewer
  if (!isVideo) {
    return <ImageViewer visible={visible} photo={photo} onClose={onClose} onShare={onShare} />
  }

  // For videos, use a custom modal with video player
  return (
    <Modal visible={visible} transparent={false} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.videoContainer}>
        <StatusBar hidden />

        {/* Header */}
        <View style={[styles.header, {paddingTop: insets.top}]}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeText}>‹</Text>
          </TouchableOpacity>
          <View style={{flex: 1}} />
          {onShare && (
            <TouchableOpacity onPress={onShare} style={styles.actionButton}>
              <Text style={styles.actionText}>Share</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Video Player */}
        <TouchableOpacity activeOpacity={1} style={styles.videoWrapper} onPress={() => setShowControls(!showControls)}>
          <Video
            ref={videoRef}
            source={{uri: photo.url}}
            style={styles.video}
            resizeMode="contain"
            paused={!isPlaying}
            controls={showControls}
            onError={error => {
              console.error("Video error:", error)
            }}
            onEnd={() => setIsPlaying(false)}
          />
        </TouchableOpacity>

        {/* Play/Pause overlay for videos without native controls */}
        {!showControls && (
          <TouchableOpacity style={styles.playPauseOverlay} onPress={() => setIsPlaying(!isPlaying)}>
            <Text style={styles.playPauseText}>{isPlaying ? "⏸" : "▶"}</Text>
          </TouchableOpacity>
        )}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: "rgba(0,0,0,0.5)",
    zIndex: 1000,
  },
  closeButton: {
    padding: spacing.sm,
  },
  closeText: {
    color: "white",
    fontSize: 28,
    fontWeight: "300",
  },
  actionButton: {
    padding: spacing.sm,
  },
  actionText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  videoContainer: {
    flex: 1,
    backgroundColor: "black",
  },
  videoWrapper: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  video: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
  },
  playPauseOverlay: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: [{translateX: -30}, {translateY: -30}],
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  playPauseText: {
    color: "white",
    fontSize: 24,
  },
})
