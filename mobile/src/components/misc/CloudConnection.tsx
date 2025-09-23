import React, {useEffect, useRef, useState} from "react"
import {View, ViewStyle, TextStyle} from "react-native"
import LinearGradient from "react-native-linear-gradient"
import Icon from "react-native-vector-icons/FontAwesome"
import Animated, {useSharedValue, withTiming} from "react-native-reanimated"
import {useConnectionStore} from "@/stores/connection"
import {WebSocketStatus} from "@/managers/WebSocketManager"
import {useAppTheme} from "@/utils/useAppTheme"
import {ThemedStyle} from "@/theme"
import {Text} from "@/components/ignite"
import {translate} from "@/i18n"

export default function CloudConnection() {
  const connectionStatus = useConnectionStore(state => state.status)
  const {theme, themed} = useAppTheme()
  const cloudConnectionStatusAnim = useSharedValue(1)
  const [hideCloudConnection, setHideCloudConnection] = useState(true)

  // Add delay logic for disconnection alerts
  const [delayedStatus, setDelayedStatus] = useState<WebSocketStatus>(connectionStatus)
  const disconnectionTimerRef = useRef<NodeJS.Timeout | null>(null)
  const DISCONNECTION_DELAY = 3000 // 3 seconds delay

  /**
   * Return gradient colors based on the cloud connection status
   */
  const getGradientColors = (connectionStatus: WebSocketStatus): string[] => {
    switch (connectionStatus) {
      case WebSocketStatus.CONNECTED:
        return ["#4CAF50", "#81C784"] // Green gradient
      case WebSocketStatus.CONNECTING:
        return ["#FFA726", "#FB8C00"] // Orange gradient
      case WebSocketStatus.ERROR:
        return ["#FFC107", "#FFD54F"] // Yellow-ish gradient
      case WebSocketStatus.DISCONNECTED:
      default:
        return ["#FF8A80", "#FF5252"] // Red gradient
    }
  }

  /**
   * Return icon name and color based on connection status
   */
  const getIcon = (connectionStatus: WebSocketStatus): {name: string; color: string; label: string} => {
    switch (connectionStatus) {
      case WebSocketStatus.CONNECTED:
        return {
          name: "check-circle",
          color: "#4CAF50",
          label: translate("connection:connected"),
        }
      case WebSocketStatus.CONNECTING:
        return {
          name: "spinner",
          color: "#FB8C00",
          label: translate("connection:connecting"),
        }
      case WebSocketStatus.ERROR:
        return {
          name: "refresh",
          color: "#FFD54F",
          label: translate("connection:reconnecting"),
        }
      case WebSocketStatus.DISCONNECTED:
      default:
        return {
          name: "exclamation-circle",
          color: "#FF5252",
          label: translate("connection:disconnected"),
        }
    }
  }

  const {name: iconName, color: iconColor, label: statusLabel} = getIcon(delayedStatus)

  useEffect(() => {
    console.log("CloudConnection: Status:", connectionStatus)

    // Clear any existing timer
    if (disconnectionTimerRef.current) {
      clearTimeout(disconnectionTimerRef.current)
      disconnectionTimerRef.current = null
    }

    if (connectionStatus === WebSocketStatus.DISCONNECTED || connectionStatus === WebSocketStatus.ERROR) {
      // Don't update delayedStatus immediately for DISCONNECTED/ERROR - keep previous status
      // Start timer to show disconnection after delay
      disconnectionTimerRef.current = setTimeout(() => {
        // Only show if still disconnected/error when timer fires
        if (connectionStatus === WebSocketStatus.DISCONNECTED || connectionStatus === WebSocketStatus.ERROR) {
          setDelayedStatus(connectionStatus)
          cloudConnectionStatusAnim.value = withTiming(1, {duration: 500})
          setTimeout(() => {
            setHideCloudConnection(false)
          }, 500)
        }
      }, DISCONNECTION_DELAY)
    } else {
      // For connected/connecting states, update immediately and hide badge if connected
      setDelayedStatus(connectionStatus)
      setHideCloudConnection(connectionStatus === WebSocketStatus.CONNECTED)
      cloudConnectionStatusAnim.value =
        connectionStatus === WebSocketStatus.CONNECTED ? withTiming(0, {duration: 500}) : withTiming(1, {duration: 500})
    }

    // Cleanup function
    return () => {
      if (disconnectionTimerRef.current) {
        clearTimeout(disconnectionTimerRef.current)
        disconnectionTimerRef.current = null
      }
    }
  }, [connectionStatus])

  // if (connectionStatus === WebSocketStatus.CONNECTED) {
  //   return
  // }

  if (hideCloudConnection) {
    return null
  }

  return (
    <Animated.View style={[themed($animatedContainer), {opacity: cloudConnectionStatusAnim}]}>
      <LinearGradient colors={getGradientColors(delayedStatus)} style={themed($outerContainer)}>
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
