import React from "react"
import {View, TouchableOpacity, ViewStyle} from "react-native"
import {useAppTheme} from "@/utils/useAppTheme"
import {ThemedStyle} from "@/theme"
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons"
import {SETTINGS_KEYS, useSetting} from "@/stores/settings"
import showAlert from "@/utils/AlertUtils"
import {useAppStatus} from "@/contexts/AppletStatusProvider"
import bridge from "@/bridge/MantleBridge"

export const OfflineModeButton: React.FC = () => {
  const {theme, themed} = useAppTheme()
  const [offlineMode, setOfflineMode] = useSetting(SETTINGS_KEYS.OFFLINE_MODE)
  const [offlineCaptionsAppRunning, setOfflineCaptionsAppRunning] = useSetting(
    SETTINGS_KEYS.offline_captions_app_running,
  )
  const {stopAllApps} = useAppStatus()

  const handlePress = () => {
    const title = offlineMode ? "Disable Offline Mode?" : "Enable Offline Mode?"
    const message = offlineMode
      ? "Switching to online mode will close all offline-only apps and allow you to use all online apps."
      : "Enabling offline mode will close all running online apps. You'll only be able to use apps that work without an internet connection, and all other apps will be shut down."
    const confirmText = offlineMode ? "Go Online" : "Go Offline"

    showAlert(
      title,
      message,
      [
        {text: "Cancel", style: "cancel"},
        {
          text: confirmText,
          onPress: async () => {
            if (!offlineMode) {
              // If enabling offline mode, stop all running apps
              await stopAllApps()
            } else {
              // If disabling offline mode, turn off offline captions
              setOfflineCaptionsAppRunning(false)
              bridge.toggleOfflineApps(false)
            }
            setOfflineMode(!offlineMode)
          },
        },
      ],
      {
        iconName: offlineMode ? "wifi" : "wifi-off",
        iconColor: theme.colors.icon,
      },
    )
  }

  return (
    <View style={themed($container)}>
      <TouchableOpacity onPress={handlePress} style={themed($button)}>
        <MaterialCommunityIcons
          name={offlineMode ? "wifi-off" : "wifi"}
          size={24}
          color={theme.colors.icon}
        />
      </TouchableOpacity>
    </View>
  )
}

const $container: ThemedStyle<ViewStyle> = ({spacing}) => ({
  marginLeft: spacing.xs,
  marginRight: spacing.xs,
})

const $button: ThemedStyle<ViewStyle> = ({spacing}) => ({
  padding: spacing.xs,
  borderRadius: 20,
  justifyContent: "center",
  alignItems: "center",
})