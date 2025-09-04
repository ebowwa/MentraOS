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
import {SETTINGS_KEYS} from "@/utils/SettingsHelper"
import {loadSetting, saveSetting} from "@/utils/SettingsHelper"
import BackendServerComms from "@/bridge/BackendServerComms"
import {useCoreStatus} from "@/contexts/CoreStatusProvider"
import {useAppStatus} from "@/contexts/AppletStatusProvider"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import showAlert from "@/utils/AlertUtils"

interface OnboardingSpotlightProps {
  targetRef: React.RefObject<any>
  onboardingTarget: "glasses" | "livecaptions"
  setOnboardingTarget: (target: "glasses" | "livecaptions") => void
  message?: string
  showArrow?: boolean
}

export const OnboardingSpotlight: React.FC<OnboardingSpotlightProps> = ({
  targetRef,
  onboardingTarget,
  setOnboardingTarget,
  message = translate("home:tapToStartLiveCaptions"),
  showArrow = true,
}) => {
  const [visible, setVisible] = useState(false)
  const {theme, themed} = useAppTheme()
  const fadeAnim = useRef(new Animated.Value(0)).current
  const [targetMeasurements, setTargetMeasurements] = useState<{
    x: number
    y: number
    width: number
    height: number
  } | null>(null)

  const [liveCaptionsPackageName, setLiveCaptionsPackageName] = useState<string | null>(null)
  const {status} = useCoreStatus()
  const {appStatus} = useAppStatus()
  const {push} = useNavigationHistory()

  // Check onboarding status
  useEffect(() => {
    const checkOnboarding = async () => {
      const onboardingCompleted = await loadSetting(SETTINGS_KEYS.ONBOARDING_COMPLETED, true)
      if (!onboardingCompleted) {
        // Check if glasses are connected
        const glassesConnected = status.glasses_info?.model_name != null

        if (!glassesConnected) {
          setOnboardingTarget("glasses")
          setVisible(true)
        } else {
          // // Check if Live Captions app exists and is not running
          // const liveCaptionsApp = appStatus.find(
          //   app =>
          //     app.packageName === "com.augmentos.livecaptions" ||
          //     app.packageName === "cloud.augmentos.live-captions" ||
          //     app.packageName === "com.mentra.livecaptions",
          // )

          // if (liveCaptionsApp && !liveCaptionsApp.is_running) {
          //   setOnboardingTarget("livecaptions")
          //   setLiveCaptionsPackageName(liveCaptionsApp.packageName)
          //   setShowOnboardingSpotlight(true)
          // }
          // Skip Live Captions spotlight - mark onboarding as complete once glasses are connected                                  │ │
          setVisible(false)
          await saveSetting(SETTINGS_KEYS.ONBOARDING_COMPLETED, true)
        }
      }
    }

    checkOnboarding().catch(error => {
      console.error("Error checking onboarding:", error)
    })
  }, [status.glasses_info?.model_name, appStatus])

  // Handle spotlight dismiss
  const handleDismiss = () => {
    setVisible(false)
    // Mark onboarding as completed if user skips
    saveSetting(SETTINGS_KEYS.ONBOARDING_COMPLETED, true)
  }

  // Handle spotlight target press
  const handleTargetPress = async () => {
    if (onboardingTarget === "glasses") {
      push("/pairing/select-glasses-model")
    } else if (onboardingTarget === "livecaptions" && liveCaptionsPackageName) {
      // Dismiss spotlight first
      setVisible(false)

      // Start the Live Captions app directly
      try {
        const backendComms = BackendServerComms.getInstance()
        await backendComms.startApp(liveCaptionsPackageName)

        // Mark onboarding as completed
        await saveSetting(SETTINGS_KEYS.ONBOARDING_COMPLETED, true)

        // Show the success message after a short delay
        setTimeout(() => {
          showAlert(
            translate("home:tryLiveCaptionsTitle"),
            translate("home:tryLiveCaptionsMessage"),
            [{text: translate("common:ok")}],
            {
              iconName: "microphone",
            },
          )
        }, 500)
      } catch (error) {
        console.error("Error starting Live Captions:", error)
      }
    }
  }

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
  const spotlightX = Math.floor(targetMeasurements.x - padding)
  const spotlightY = Math.floor(targetMeasurements.y - padding)
  const spotlightWidth = Math.ceil(targetMeasurements.width + padding * 2)
  const spotlightHeight = Math.ceil(targetMeasurements.height + padding * 2)

  // Determine if message should be above or below target
  const showMessageBelow = spotlightY < screenHeight / 3

  return (
    <Modal transparent visible={visible} animationType="none">
      <Animated.View style={[styles.container, {opacity: fadeAnim}]} pointerEvents="auto">
        {/* Create overlay with four absolutely positioned rectangles around the spotlight */}

        {/* Top overlay */}
        <TouchableOpacity
          style={[
            styles.overlay,
            {
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: spotlightY,
            },
          ]}
          onPress={handleDismiss}
          activeOpacity={1}
        />

        {/* Left overlay */}
        <TouchableOpacity
          style={[
            styles.overlay,
            {
              position: "absolute",
              top: spotlightY,
              left: 0,
              width: spotlightX,
              height: spotlightHeight,
            },
          ]}
          onPress={handleDismiss}
          activeOpacity={1}
        />

        {/* Right overlay */}
        <TouchableOpacity
          style={[
            styles.overlay,
            {
              position: "absolute",
              top: spotlightY,
              left: spotlightX + spotlightWidth,
              right: 0,
              height: spotlightHeight,
            },
          ]}
          onPress={handleDismiss}
          activeOpacity={1}
        />

        {/* Bottom overlay */}
        <TouchableOpacity
          style={[
            styles.overlay,
            {
              position: "absolute",
              top: spotlightY + spotlightHeight,
              left: 0,
              right: 0,
              bottom: 0,
            },
          ]}
          onPress={handleDismiss}
          activeOpacity={1}
        />

        {/* Spotlight area - touchable */}
        <TouchableOpacity
          style={{
            position: "absolute",
            top: spotlightY,
            left: spotlightX,
            width: spotlightWidth,
            height: spotlightHeight,
            borderWidth: 2,
            borderColor: "rgba(255, 255, 255, 0.5)",
            backgroundColor: "rgba(255, 255, 255, 0.05)",
          }}
          onPress={handleTargetPress}
          activeOpacity={0.8}
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
          ]}>
          <View style={[styles.messageBubble, {backgroundColor: theme.colors.background}]}>
            <Text style={[themed($messageText), {color: theme.colors.text}]}>{message}</Text>
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
            ]}>
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
