import React from "react"
import {View, TouchableOpacity, StyleSheet, ViewStyle} from "react-native"
import {useAppTheme} from "@/utils/useAppTheme"
import {spacing} from "@/theme"
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons"
import showAlert from "@/utils/AlertUtils"

interface OfflineModeButtonProps {
  isOfflineMode: boolean
  onToggle: (isOffline: boolean) => void
}

export const OfflineModeButton: React.FC<OfflineModeButtonProps> = ({isOfflineMode, onToggle}) => {
  const {theme} = useAppTheme()
  const styles = getStyles(theme)

  const handlePress = () => {
    const title = isOfflineMode ? "Disable Offline Mode?" : "Enable Offline Mode?"
    const message = isOfflineMode
      ? "Switching to online mode will close all offline-only apps and allow you to use all online apps."
      : "Enabling offline mode will close all running online apps. You'll only be able to use apps that work without an internet connection, and all other apps will be shut down."
    const confirmText = isOfflineMode ? "Go Online" : "Go Offline"

    showAlert(
      title,
      message,
      [
        {text: "Cancel", style: "cancel"},
        {
          text: confirmText,
          onPress: () => onToggle(!isOfflineMode),
        },
      ],
      {
        iconName: isOfflineMode ? "wifi" : "wifi-off",
        iconColor: theme.colors.tint,
      },
    )
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={handlePress} style={styles.button}>
        <MaterialCommunityIcons
          name={isOfflineMode ? "wifi-off" : "wifi"}
          size={24}
          color={isOfflineMode ? theme.colors.text : theme.colors.tint}
        />
      </TouchableOpacity>
    </View>
  )
}

const getStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      marginLeft: spacing.xs,
      marginRight: spacing.xs,
    },
    button: {
      padding: spacing.xs,
      borderRadius: 20,
      justifyContent: "center",
      alignItems: "center",
    },
  })
