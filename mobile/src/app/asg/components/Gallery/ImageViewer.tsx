/**
 * Custom image viewer with proper zoom and pan
 */

import React, {useState} from "react"
import {View, TouchableOpacity, Text, Modal, StyleSheet, Dimensions, StatusBar} from "react-native"
import {Image} from "expo-image"
import {GestureDetector, Gesture, GestureHandlerRootView} from "react-native-gesture-handler"
import Animated, {useAnimatedStyle, useSharedValue, withSpring, runOnJS} from "react-native-reanimated"
import {PhotoInfo} from "../../types"
import {useSafeAreaInsets} from "react-native-safe-area-context"
import {spacing} from "@/theme"
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons"

const AnimatedImage = Animated.createAnimatedComponent(Image)

interface ImageViewerProps {
  visible: boolean
  photo: PhotoInfo | null
  onClose: () => void
  onShare?: () => void
}

const {width: screenWidth, height: screenHeight} = Dimensions.get("window")

export function ImageViewer({visible, photo, onClose, onShare}: ImageViewerProps) {
  const insets = useSafeAreaInsets()
  const [showHeader, setShowHeader] = useState(true)

  // Gesture values
  const scale = useSharedValue(1)
  const savedScale = useSharedValue(1)
  const translationX = useSharedValue(0)
  const translationY = useSharedValue(0)
  const savedTranslationX = useSharedValue(0)
  const savedTranslationY = useSharedValue(0)

  if (!photo) return null

  const resetZoom = () => {
    "worklet"
    scale.value = withSpring(1)
    savedScale.value = 1
    translationX.value = withSpring(0)
    translationY.value = withSpring(0)
    savedTranslationX.value = 0
    savedTranslationY.value = 0
  }

  const toggleHeader = () => {
    setShowHeader(prev => !prev)
  }

  // Pinch gesture
  const pinchGesture = Gesture.Pinch()
    .onUpdate(e => {
      scale.value = savedScale.value * e.scale
    })
    .onEnd(() => {
      if (scale.value < 1) {
        scale.value = withSpring(1)
        savedScale.value = 1
      } else if (scale.value > 5) {
        scale.value = withSpring(5)
        savedScale.value = 5
      } else {
        savedScale.value = scale.value
      }
    })

  // Pan gesture
  const panGesture = Gesture.Pan()
    .onUpdate(e => {
      translationX.value = savedTranslationX.value + e.translationX
      translationY.value = savedTranslationY.value + e.translationY
    })
    .onEnd(() => {
      savedTranslationX.value = translationX.value
      savedTranslationY.value = translationY.value
    })

  // Double tap gesture
  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        resetZoom()
      } else {
        scale.value = withSpring(2)
        savedScale.value = 2
      }
    })

  // Single tap gesture
  const singleTapGesture = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd(() => {
      runOnJS(toggleHeader)()
    })

  const composed = Gesture.Simultaneous(Gesture.Exclusive(doubleTapGesture, singleTapGesture), pinchGesture, panGesture)

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{translateX: translationX.value}, {translateY: translationY.value}, {scale: scale.value}],
  }))

  return (
    <Modal visible={visible} transparent={false} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={styles.container}>
        <StatusBar hidden={!showHeader} />

        {/* Background */}
        <View style={styles.background} />

        {/* Image */}
        <GestureDetector gesture={composed}>
          <AnimatedImage
            source={{uri: photo.url}}
            style={[styles.image, animatedStyle]}
            contentFit="contain"
            transition={200}
          />
        </GestureDetector>

        {/* Header */}
        {showHeader && (
          <View style={[styles.header, {paddingTop: insets.top}]}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <MaterialCommunityIcons name="chevron-left" size={32} color="white" />
            </TouchableOpacity>
            <View style={{flex: 1}} />
            {onShare && (
              <TouchableOpacity onPress={onShare} style={styles.actionButton}>
                <Text style={styles.actionText}>Share</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </GestureHandlerRootView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "black",
  },
  background: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "black",
  },
  image: {
    width: screenWidth,
    height: screenHeight,
  },
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
    backgroundColor: "rgba(0,0,0,0.7)",
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
})
