import React, {useEffect, useRef, useState} from "react"
import {View, ViewStyle, TextStyle} from "react-native"
import LinearGradient from "react-native-linear-gradient"
import Icon from "react-native-vector-icons/FontAwesome"
import Animated, {useSharedValue, withTiming} from "react-native-reanimated"
import {useCoreStatus} from "@/contexts/CoreStatusProvider"
import {useAppTheme} from "@/utils/useAppTheme"
import {ThemedStyle} from "@/theme"
import {Text} from "@/components/ignite"
import {translate} from "@/i18n"

export default function CloudConnection() {
  const {status} = useCoreStatus()
  const {theme, themed} = useAppTheme()
  const cloudConnectionStatusAnim = useSharedValue(1)
  const [hideCloudConnection, setHideCloudConnection] = useState(true)

  // Add delay logic for disconnection alerts
  const [delayedStatus, setDelayedStatus] = useState<string | undefined>(status.core_info.cloud_connection_status)
  const disconnectionTimerRef = useRef<NodeJS.Timeout | null>(null)
  const DISCONNECTION_DELAY = 3000 // 3 seconds delay

  /**
   * Return gradient colors based on the cloud connection status
   */
  const getGradientColors = (connectionStatus: string | undefined): string[] => {
    switch (connectionStatus) {
      case "CONNECTED":
        return ["#4CAF50", "#81C784"] // Green gradient
      case "CONNECTING":
        return ["#FFA726", "#FB8C00"] // Orange gradient
      case "RECONNECTING":
        return ["#FFC107", "#FFD54F"] // Yellow-ish gradient
      case "DISCONNECTED":
      default:
        return ["#FF8A80", "#FF5252"] // Red gradient
    }
  }

  /**
   * Return icon name and color based on connection status
   */
  const getIcon = (connectionStatus: string | undefined): {name: string; color: string; label: string} => {
    switch (connectionStatus) {
      case "CONNECTED":
        return {
          name: "check-circle",
          color: "#4CAF50",
          label: translate("connection:connected"),
        }
      case "CONNECTING":
        return {
          name: "spinner",
          color: "#FB8C00",
          label: translate("connection:connecting"),
        }
      case "RECONNECTING":
        return {
          name: "refresh",
          color: "#FFD54F",
          label: translate("connection:reconnecting"),
        }
      case "DISCONNECTED":
      default:
        return {
          name: "exclamation-circle",
          color: "#FF5252",
          label: translate("connection:disconnected"),
        }
    }
  }

  const {
    name: iconName,
    color: iconColor,
    label: statusLabel,
  } = getIcon(delayedStatus || status.core_info.cloud_connection_status)

  useEffect(() => {
    const currentStatus = status.core_info.cloud_connection_status
    console.log("CloudConnection: Status:", currentStatus)

    // Clear any existing timer
    if (disconnectionTimerRef.current) {
      clearTimeout(disconnectionTimerRef.current)
      disconnectionTimerRef.current = null
    }

    if (currentStatus === "DISCONNECTED") {
      // Don't update delayedStatus immediately for DISCONNECTED - keep previous status
      // Start timer to show disconnection after delay
      disconnectionTimerRef.current = setTimeout(() => {
        // Only show if still disconnected when timer fires
        if (status.core_info.cloud_connection_status === "DISCONNECTED") {
          setDelayedStatus(currentStatus)
          cloudConnectionStatusAnim.value = withTiming(1, {duration: 500})
          setTimeout(() => {
            setHideCloudConnection(false)
          }, 500)
        }
      }, DISCONNECTION_DELAY)
    } else {
      // For non-disconnected states, update immediately and hide badge
      setDelayedStatus(currentStatus)
      setHideCloudConnection(true)
      cloudConnectionStatusAnim.value = withTiming(0, {duration: 500})
    }

    // Cleanup function
    return () => {
      if (disconnectionTimerRef.current) {
        clearTimeout(disconnectionTimerRef.current)
        disconnectionTimerRef.current = null
      }
    }
  }, [status.core_info.cloud_connection_status])

  // if (status.core_info.cloud_connection_status === "CONNECTED") {
  //   return
  // }

  if (hideCloudConnection) {
    return null
  }

  return (
    <Animated.View style={[themed($animatedContainer), {opacity: cloudConnectionStatusAnim}]}>
      <LinearGradient
        colors={getGradientColors(delayedStatus || status.core_info.cloud_connection_status)}
        style={themed($outerContainer)}>
        <View style={themed($innerContainer)}>
          <View style={themed($row)}>
            <Icon name={iconName} size={16} color={iconColor} style={themed($icon)} />
            <Text style={themed($text)}>{statusLabel}</Text>
          </View>
        </View>
      </LinearGradient>
    </Animated.View>
  )
}

const $animatedContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  zIndex: 999,
  marginTop: -56,
  marginBottom: 8,
})

const $outerContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  borderRadius: spacing.md,
})

const $innerContainer: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.background,
  borderRadius: spacing.md,
  elevation: 1,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.xs,
  margin: spacing.xxs,
})

const $row: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  flexDirection: "row",
  justifyContent: "center",
})

const $icon: ThemedStyle<ViewStyle> = ({spacing}) => ({
  marginRight: spacing.xs,
})

const $text: ThemedStyle<TextStyle> = ({colors, typography}) => ({
  color: colors.text,
  fontFamily: typography.primary.medium,
  fontSize: 14,
  fontWeight: "600",
})
