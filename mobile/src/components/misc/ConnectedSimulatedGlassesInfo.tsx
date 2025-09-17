import React, {useEffect, useRef} from "react"
import {View, Text, StyleSheet, TouchableOpacity, Animated, Linking} from "react-native"
import GlassesDisplayMirror from "./GlassesDisplayMirror"
import {useAppTheme} from "@/utils/useAppTheme"
import {translate} from "@/i18n/translate"
import {useCameraPermissions} from "expo-camera"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import showAlert from "@/utils/AlertUtils"
import Icon from "react-native-vector-icons/MaterialCommunityIcons"
import {ViewStyle, TextStyle} from "react-native"
import {ThemedStyle} from "@/theme"

export default function ConnectedSimulatedGlassesInfo() {
  const fadeAnim = useRef(new Animated.Value(0)).current
  const scaleAnim = useRef(new Animated.Value(0.8)).current
  const {themed, theme} = useAppTheme()
  const [permission, requestPermission] = useCameraPermissions()
  const {push} = useNavigationHistory()

  useEffect(() => {
    // Start animations
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 60,
        useNativeDriver: true,
      }),
    ]).start()

    // Cleanup function
    return () => {
      fadeAnim.stopAnimation()
      scaleAnim.stopAnimation()
    }
  }, [])

  // Function to navigate to fullscreen mode
  const navigateToFullScreen = async () => {
    // Check if camera permission is already granted
    if (permission?.granted) {
      push("/mirror/fullscreen")
      return
    }

    // Show alert asking for camera permission
    showAlert(
      translate("mirror:cameraPermissionRequired"),
      translate("mirror:cameraPermissionRequiredMessage"),
      [
        {
          text: translate("common:continue"),
          onPress: async () => {
            const permissionResult = await requestPermission()
            if (permissionResult.granted) {
              // Permission granted, navigate to fullscreen
              push("/mirror/fullscreen")
            } else if (!permissionResult.canAskAgain) {
              // Permission permanently denied, show settings alert
              showAlert(
                translate("mirror:cameraPermissionRequired"),
                translate("mirror:cameraPermissionRequiredMessage"),
                [
                  {
                    text: translate("common:cancel"),
                    style: "cancel",
                  },
                  {
                    text: translate("mirror:openSettings"),
                    onPress: () => Linking.openSettings(),
                  },
                ],
              )
            }
            // If permission denied but can ask again, do nothing (user can try again)
          },
        },
      ],
      {
        iconName: "camera",
      },
    )
  }

  return (
    <View style={themed($connectedContent)}>
      <Animated.View
        style={[
          themed($mirrorWrapper),
          {
            opacity: fadeAnim,
            transform: [{scale: scaleAnim}],
          },
        ]}>
        <GlassesDisplayMirror fallbackMessage="Glasses Mirror" />
        <TouchableOpacity style={{position: "absolute", bottom: 10, right: 10}} onPress={navigateToFullScreen}>
          <Icon name="fullscreen" size={24} color={theme.colors.text} />
        </TouchableOpacity>
      </Animated.View>
    </View>
  )
}

export const $bottomBar: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  alignItems: "center",
  backgroundColor: "#6750A414",
  borderBottomLeftRadius: 10,
  borderBottomRightRadius: 10,
  flexDirection: "row",
  justifyContent: "space-between",
  padding: 10,
  width: "100%",
})

export const $connectedContent: ThemedStyle<ViewStyle> = ({spacing}) => ({
  alignItems: "center",
  justifyContent: "center",
  marginBottom: 10,
})

export const $deviceInfoContainer: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  borderRadius: 10,
  display: "flex",
  flexDirection: "column",
  height: 230,
  justifyContent: "space-between",
  marginTop: 16,
  paddingBottom: 0,
  paddingHorizontal: 10,
  paddingTop: 10,
  width: "100%", // Increased space above component to match ConnectedDeviceInfo
})

export const $mirrorContainer: ThemedStyle<ViewStyle> = () => ({
  height: "100%",
  padding: 0,
  width: "100%",
})

export const $mirrorWrapper: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  justifyContent: "center",
  marginBottom: 0,
  width: "100%",
})

export const $simulatedGlassesText: ThemedStyle<TextStyle> = () => ({
  fontFamily: "Montserrat-Bold",
  fontSize: 16,
  fontWeight: "bold",
})
