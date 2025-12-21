import { useEffect, useState } from "react"
import { View, ViewStyle, Image, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native"
import CoreModule from "core"

import { Text, Icon } from "@/components/ignite"
import { useVideoFrameStore } from "@/stores/videoFrame"
import { useGlassesStore } from "@/stores/glasses"
import { ThemedStyle } from "@/theme"
import { useAppTheme } from "@/utils/useAppTheme"

interface MetaGlassesMirrorProps {
    style?: ViewStyle
}

/**
 * Displays live video frames from Meta glasses camera.
 * Uses the videoFrame store which receives frames from native via MantleBridge.
 */
const MetaGlassesMirror: React.FC<MetaGlassesMirrorProps> = ({ style }) => {
    const { themed, theme } = useAppTheme()
    const currentFrame = useVideoFrameStore((state) => state.currentFrame)
    // Note: isStreaming from store is intentionally unused - currentFrame presence
    // already indicates streaming state, making explicit isStreaming check redundant
    const frameCount = useVideoFrameStore((state) => state.frameCount)
    const glassesConnected = useGlassesStore((state) => state.connected)

    const [isStartingStream, setIsStartingStream] = useState(false)
    const [hasEverReceivedFrame, setHasEverReceivedFrame] = useState(false)

    useEffect(() => {
        if (currentFrame) {
            setHasEverReceivedFrame(true)
            setIsStartingStream(false)
        }
    }, [currentFrame])

    const handleStartStreaming = async () => {
        setIsStartingStream(true)
        try {
            // startRtmpStream triggers MetaRayBan.startVideoStream() which opens Meta AI for camera permission if needed
            await CoreModule.startRtmpStream({})
            // Stream will start and frames will come via video_frame events
        } catch (error) {
            console.error("Failed to start streaming:", error)
            setIsStartingStream(false)
        }
    }

    const handleStopStreaming = async () => {
        try {
            await CoreModule.stopRtmpStream()
            useVideoFrameStore.getState().setStreaming(false)
        } catch (error) {
            console.error("Failed to stop streaming:", error)
        }
    }

    // If no frame data and not streaming, show placeholder with start button
    if (!currentFrame && !isStartingStream) {
        return (
            <View style={[themed($container), style]}>
                <View style={themed($placeholderContainer)}>
                    {glassesConnected ? (
                        <>
                            <Text style={themed($placeholderText)}>
                                {hasEverReceivedFrame ? "Stream paused" : "Meta Glasses Camera"}
                            </Text>
                            <TouchableOpacity
                                style={themed($startButton)}
                                onPress={handleStartStreaming}
                                activeOpacity={0.7}
                            >
                                <Icon name="play-arrow" size={24} color={theme.colors.text} />
                                <Text style={themed($buttonText)}>Start Streaming</Text>
                            </TouchableOpacity>
                        </>
                    ) : (
                        <>
                            <Text style={themed($placeholderText)}>Meta glasses not connected</Text>
                            <Text style={themed($hintText)}>Connect your glasses to view camera</Text>
                        </>
                    )}
                </View>
            </View>
        )
    }

    // Show loading state while starting stream
    if (isStartingStream && !currentFrame) {
        return (
            <View style={[themed($container), style]}>
                <View style={themed($placeholderContainer)}>
                    <ActivityIndicator size="large" color={theme.colors.text} />
                    <Text style={themed($placeholderText)}>Starting stream...</Text>
                    <Text style={themed($hintText)}>Approve camera access in Meta AI if prompted</Text>
                </View>
            </View>
        )
    }

    // Show the video frame
    const imageUri = `data:image/jpeg;base64,${currentFrame}`

    return (
        <View style={[themed($container), style]}>
            <Image
                source={{ uri: imageUri }}
                style={styles.image}
                resizeMode="contain"
            />
            {/* Stop streaming button overlay */}
            <TouchableOpacity
                style={styles.stopButton}
                onPress={handleStopStreaming}
                activeOpacity={0.7}
            >
                <Icon name="stop-circle" size={32} color="#ff4444" />
            </TouchableOpacity>
            {__DEV__ && (
                <View style={styles.debugOverlay}>
                    <Text style={styles.debugText}>Frame #{frameCount}</Text>
                </View>
            )}
        </View>
    )
}

const $container: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: colors.primary_foreground,
    borderRadius: spacing.s4,
    overflow: "hidden",
})

const $placeholderContainer: ThemedStyle<ViewStyle> = () => ({
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
    gap: 12,
})

const $placeholderText: ThemedStyle<any> = ({ colors }) => ({
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
})

const $hintText: ThemedStyle<any> = ({ colors }) => ({
    color: colors.textDim,
    fontSize: 14,
    textAlign: "center",
})

const $startButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.s2,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
    borderRadius: spacing.s3,
    marginTop: spacing.s2,
})

const $buttonText: ThemedStyle<any> = ({ colors }) => ({
    color: colors.text,
    fontSize: 14,
    fontWeight: "500",
})

const styles = StyleSheet.create({
    image: {
        width: "100%",
        height: "100%",
    },
    stopButton: {
        position: "absolute",
        top: 8,
        right: 8,
        backgroundColor: "rgba(0,0,0,0.5)",
        padding: 4,
        borderRadius: 20,
    },
    debugOverlay: {
        position: "absolute",
        top: 8,
        left: 8,
        backgroundColor: "rgba(0,0,0,0.5)",
        padding: 4,
        borderRadius: 4,
    },
    debugText: {
        color: "white",
        fontSize: 10,
    },
})

export default MetaGlassesMirror
