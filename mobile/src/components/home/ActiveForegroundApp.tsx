import {View, TouchableOpacity, Text, ViewStyle, ImageStyle, TextStyle} from "react-native"

import AppIcon from "@/components/misc/AppIcon"
import {useActiveForegroundApp} from "@/hooks/useNewUiFilteredApps"
import {useAppStatus} from "@/contexts/AppletStatusProvider"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {useAppTheme} from "@/utils/useAppTheme"
import ChevronRight from "assets/icons/component/ChevronRight"
import restComms from "@/managers/RestComms"
import {showAlert} from "@/utils/AlertUtils"
import {ThemedStyle} from "@/theme"

export const ActiveForegroundApp: React.FC = () => {
  const {themed, theme} = useAppTheme()
  const {push} = useNavigationHistory()
  const activeForegroundApp = useActiveForegroundApp()
  const {optimisticallyStopApp, clearPendingOperation, refreshAppStatus} = useAppStatus()

  const handlePress = () => {
    if (activeForegroundApp) {
      // Check if app has webviewURL and navigate directly to it
      if (activeForegroundApp.webviewURL && activeForegroundApp.isOnline !== false) {
        push("/applet/webview", {
          webviewURL: activeForegroundApp.webviewURL,
          appName: activeForegroundApp.name,
          packageName: activeForegroundApp.packageName,
        })
      } else {
        push("/applet/settings", {
          packageName: activeForegroundApp.packageName,
          appName: activeForegroundApp.name,
        })
      }
    }
  }

  const handleLongPress = () => {
    if (activeForegroundApp) {
      showAlert("Stop App", `Do you want to stop ${activeForegroundApp.name}?`, [
        {text: "Cancel", style: "cancel"},
        {
          text: "Stop",
          style: "destructive",
          onPress: async () => {
            optimisticallyStopApp(activeForegroundApp.packageName)

            try {
              await restComms.stopApp(activeForegroundApp.packageName)
              clearPendingOperation(activeForegroundApp.packageName)
            } catch (error) {
              refreshAppStatus()
              console.error("Stop app error:", error)
            }
          },
        },
      ])
    }
  }

  if (!activeForegroundApp) {
    // Show placeholder when no active app
    return (
      <View style={themed($container)}>
        <View style={themed($placeholderContent)}>
          <Text style={themed($placeholderText)}>Tap an app below to activate it</Text>
        </View>
      </View>
    )
  }

  return (
    <TouchableOpacity
      style={themed($container)}
      onPress={handlePress}
      onLongPress={handleLongPress}
      activeOpacity={0.7}>
      <View style={themed($rowContent)}>
        <AppIcon app={activeForegroundApp as any} style={themed($appIcon)} hideLoadingIndicator />
        <View style={themed($appInfo)}>
          <Text style={themed($appName)} numberOfLines={1} ellipsizeMode="tail">
            {activeForegroundApp.name}
          </Text>
          <View style={themed($tagContainer)}>
            <View style={themed($activeTag)}>
              <Text style={themed($tagText)}>Active</Text>
            </View>
          </View>
        </View>
        <ChevronRight color={theme.colors.text} />
      </View>
    </TouchableOpacity>
  )
}

const $container: ThemedStyle<ViewStyle> = ({spacing}) => ({
  borderRadius: spacing.sm,
  marginVertical: spacing.xs,
  minHeight: 72,
})

const $rowContent: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  alignItems: "center",
  paddingHorizontal: spacing.xs,
  paddingVertical: spacing.sm,
  gap: spacing.sm,
})

const $appIcon: ThemedStyle<ImageStyle> = () => ({
  width: 64,
  height: 64,
})

const $appInfo: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  justifyContent: "center",
})

const $appName: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 16,
  fontWeight: "500",
  color: colors.text,
  marginBottom: spacing.xxs,
})

const $tagContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  gap: spacing.xs,
})

const $activeTag: ThemedStyle<ViewStyle> = ({spacing, colors}) => ({
  paddingHorizontal: spacing.xs,
  paddingVertical: 2,
  backgroundColor: colors.success + "20",
  borderRadius: spacing.xxs,
})

const $tagText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 11,
  color: colors.foregroundTagText,
  fontWeight: "500",
})

const $placeholderContent: ThemedStyle<ViewStyle> = ({spacing}) => ({
  padding: spacing.lg,
  alignItems: "center",
  justifyContent: "center",
})

const $placeholderText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 15,
  color: colors.textDim,
  textAlign: "center",
})
