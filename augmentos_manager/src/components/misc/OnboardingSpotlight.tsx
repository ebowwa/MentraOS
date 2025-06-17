import React, {useEffect, useRef, useState} from "react"
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Modal,
  Dimensions,
  ViewStyle,
  TextStyle,
  Platform,
} from "react-native"
import {FontAwesome} from "@expo/vector-icons"
import {useAppTheme} from "@/utils/useAppTheme"
import {ThemedStyle, spacing} from "@/theme"
import {translate} from "@/i18n"
import {Spacer} from "./Spacer"

interface OnboardingSpotlightProps {
  visible: boolean
  targetRef: React.RefObject<any>
  onDismiss?: () => void
  onTargetPress?: () => void
  message?: string
  showArrow?: boolean
}

export const OnboardingSpotlight: React.FC<OnboardingSpotlightProps> = ({
  visible,
  targetRef,
  onDismiss,
  onTargetPress,
  message = translate("home:tapToStartLiveCaptions"),
  showArrow = true,
}) => {
  const {theme, themed} = useAppTheme()
  const fadeAnim = useRef(new Animated.Value(0)).current
  const [targetMeasurements, setTargetMeasurements] = useState<{
    x: number
    y: number
    width: number
    height: number
  } | null>(null)

  useEffect(() => {
    if (visible && targetRef.current) {
      // Measure the target element
      targetRef.current.measureInWindow((x: number, y: number, width: number, height: number) => {
        setTargetMeasurements({x, y, width, height})
      })

      // Fade in animation
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start()

      // No pulse animation - keep it static
    } else {
      // Fade out
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start()
    }
  }, [visible, targetRef])

  if (!visible || !targetMeasurements) return null

  const screenHeight = Dimensions.get("window").height
  const screenWidth = Dimensions.get("window").width

  // Calculate spotlight hole position with padding
  const padding = 8
  const spotlightX = targetMeasurements.x - padding
  const spotlightY = targetMeasurements.y - padding
  const spotlightWidth = targetMeasurements.width + padding * 2
  const spotlightHeight = targetMeasurements.height + padding * 2

  // Determine if message should be above or below target
  const showMessageBelow = spotlightY < screenHeight / 3

  return (
    <Modal transparent visible={visible} animationType="none">
      <Animated.View style={[styles.container, {opacity: fadeAnim}]} pointerEvents="auto">
        {/* Create overlay with four rectangles around the spotlight */}
        {/* Top overlay */}
        <TouchableOpacity 
          style={[styles.overlay, {height: spotlightY}]} 
          onPress={onDismiss}
          activeOpacity={1}
        />
        
        {/* Middle section with left and right overlays */}
        <View style={{flexDirection: 'row', height: spotlightHeight}}>
          {/* Left overlay */}
          <TouchableOpacity 
            style={[styles.overlay, {width: spotlightX}]} 
            onPress={onDismiss}
            activeOpacity={1}
          />
          
          {/* Spotlight area - touchable */}
          <TouchableOpacity
            style={{
              width: spotlightWidth,
              height: spotlightHeight,
              borderWidth: 2,
              borderColor: 'rgba(255, 255, 255, 0.5)',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
            }}
            onPress={onTargetPress}
            activeOpacity={0.8}
          />
          
          {/* Right overlay */}
          <TouchableOpacity 
            style={[styles.overlay, {flex: 1}]} 
            onPress={onDismiss}
            activeOpacity={1}
          />
        </View>
        
        {/* Bottom overlay */}
        <TouchableOpacity 
          style={[styles.overlay, {flex: 1}]} 
          onPress={onDismiss}
          activeOpacity={1}
        />

        {/* Message bubble */}
        <View
          style={[
            styles.messageContainer,
            showMessageBelow
              ? {
                  top: spotlightY + spotlightHeight + 60,
                  left: 20,
                  right: 20,
                }
              : {
                  bottom: screenHeight - spotlightY + 60,
                  left: 20,
                  right: 20,
                },
          ]}
        >
          <View style={[styles.messageBubble, {backgroundColor: theme.colors.background}]}>
            <Text style={[themed($messageText), {color: theme.colors.text}]}>
              {message}
            </Text>
          </View>
        </View>
        
        {/* Arrow positioned midway between message and spotlight */}
        {showArrow && (
          <View
            style={[
              styles.arrowContainer,
              {
                position: "absolute",
                left: 0,
                right: 0,
                alignItems: "center",
              },
              showMessageBelow
                ? {
                    top: spotlightY + spotlightHeight + 30,
                  }
                : {
                    bottom: screenHeight - spotlightY + 30,
                  },
            ]}
          >
            <FontAwesome
              name={showMessageBelow ? "arrow-up" : "arrow-down"}
              size={24}
              color={theme.colors.background}
            />
          </View>
        )}

        {/* Skip button removed - looks cleaner without it */}
      </Animated.View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
  },
  overlay: {
    backgroundColor: "rgba(0, 0, 0, 0.8)",
  },
  spotlight: {
    flex: 1,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.5)",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  messageContainer: {
    position: "absolute",
    alignItems: "center",
  },
  messageBubble: {
    padding: 16,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  arrowContainer: {
    alignItems: "center",
  },
  arrow: {
    // Arrow styles will be set inline
  },
  skipButton: {
    position: "absolute",
    top: Platform.OS === "ios" ? 60 : 40,
    right: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
})

const $messageText: ThemedStyle<TextStyle> = ({typography, spacing}) => ({
  fontSize: 16,
  fontFamily: typography.primary.medium,
  textAlign: "center",
  lineHeight: 24,
})

const $skipText: ThemedStyle<TextStyle> = ({typography}) => ({
  fontSize: 14,
  fontFamily: typography.primary.medium,
})

export default OnboardingSpotlight