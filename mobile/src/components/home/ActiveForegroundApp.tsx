import {ImageStyle, TextStyle, TouchableOpacity, View, ViewStyle} from "react-native"

import {Text} from "@/components/ignite"
import AppIcon from "@/components/misc/AppIcon"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {useActiveForegroundApp, useStopApplet} from "@/stores/applets"
import {ThemedStyle} from "@/theme"
import {showAlert} from "@/utils/AlertUtils"
import {useAppTheme} from "@/utils/useAppTheme"
import ChevronRight from "assets/icons/component/ChevronRight"
import {CloseXIcon} from "assets/icons/component/CloseXIcon"

export const ActiveForegroundApp: React.FC = () => {
  const {themed, theme} = useAppTheme()
  const {push} = useNavigationHistory()
  const applet = useActiveForegroundApp()
  const stopApplet = useStopApplet()

  const handlePress = () => {
    if (applet) {
      // Handle offline apps - navigate directly to React Native route
      if (applet.offline) {
        const offlineRoute = applet.offlineRoute
        if (offlineRoute) {
          push(offlineRoute)
          return
        }
      }

      // Check if app has webviewURL and navigate directly to it
      if (applet.webviewUrl && applet.healthy) {
        push("/applet/webview", {
          webviewURL: applet.webviewUrl,
          appName: applet.name,
          packageName: applet.packageName,
        })
      } else {
        push("/applet/settings", {
          packageName: applet.packageName,
          appName: applet.name,
        })
      }
    }
  }

  const handleLongPress = () => {
    if (applet) {
      showAlert("Stop App", `Do you want to stop ${applet.name}?`, [
        {text: "Cancel", style: "cancel"},
        {
          text: "Stop",
          style: "destructive",
          onPress: async () => {
            stopApplet(applet.packageName)
          },
        },
      ])
    }
  }

  const handleStopApp = async (event: any) => {
    if (applet?.loading) {
      // don't do anything if still loading
      return
    }

    // Prevent the parent TouchableOpacity from triggering
    event.stopPropagation()

    if (applet) {
      stopApplet(applet.packageName)
    }
  }

  if (!applet) {
    // Show placeholder when no active app
    return (
      <View style={themed($container)}>
        <View style={themed($placeholderContent)}>
          <Text style={themed($placeholderText)} tx="home:appletPlaceholder" />
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
        <AppIcon app={applet} style={themed($appIcon)} />
        <View style={themed($appInfo)}>
          <Text style={themed($appName)} numberOfLines={1} ellipsizeMode="tail">
            {applet.name}
          </Text>
          <View style={themed($tagContainer)}>
            <View style={themed($activeTag)}>
              <Text style={themed($tagText)}>Active</Text>
            </View>
          </View>
        </View>
        {!applet.loading && (
          <TouchableOpacity onPress={handleStopApp} style={themed($closeButton)} activeOpacity={0.7}>
            <CloseXIcon size={24} color={theme.colors.textDim} />
          </TouchableOpacity>
        )}
        <ChevronRight color={theme.colors.text} />
      </View>
    </TouchableOpacity>
  )
}

const $container: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  marginVertical: spacing.xs,
  minHeight: 72,
  borderWidth: 2,
  borderColor: colors.border,
  borderRadius: spacing.md,
  backgroundColor: colors.backgroundAlt,
  paddingHorizontal: spacing.sm,
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
  color: colors.primary,
  fontWeight: "500",
})

const $closeButton: ThemedStyle<ViewStyle> = ({spacing}) => ({
  padding: spacing.xs,
  justifyContent: "center",
  alignItems: "center",
})

const $placeholderContent: ThemedStyle<ViewStyle> = ({spacing}) => ({
  padding: spacing.lg,
  alignItems: "center",
  justifyContent: "center",
  paddingVertical: spacing.xl,
})

const $placeholderText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 15,
  color: colors.textDim,
  textAlign: "center",
})
