import React from "react"
import {View, ViewStyle, TextStyle, Animated} from "react-native"
import {Text} from "@/components/ignite"
import {AppInterface, useAppStatus} from "@/contexts/AppStatusProvider"
import {translate} from "@/i18n"
import {useAppTheme} from "@/utils/useAppTheme"
import {Spacer} from "./Spacer"
import Divider from "./Divider"
import {ThemedStyle} from "@/theme"
import AppsHeader from "./AppsHeader"
import {AppListItem} from "./AppListItem"
import showAlert from "@/utils/AlertUtils"

export default function IncompatibleAppsList() {
  const {appStatus} = useAppStatus()
  const {themed, theme} = useAppTheme()

  // Create animated value for opacity
  const opacityValue = React.useRef(new Animated.Value(1)).current

  // Filter out incompatible apps (not running and marked as incompatible)
  const incompatibleApps = appStatus.filter(app => {
    if (app.is_running) {
      return false
    }
    // Check if app has compatibility info and is marked as incompatible
    return app.compatibility && !app.compatibility.isCompatible
  })

  // Don't show section if no incompatible apps
  if (incompatibleApps.length === 0) {
    return null
  }

  const handleAppPress = (app: AppInterface) => {
    // Show alert explaining why the app is incompatible
    const missingHardware = app.compatibility?.missingRequired.map(req => req.type.toLowerCase()).join(", ") || ""

    showAlert(
      translate("home:hardwareIncompatible"),
      app.compatibility?.message ||
        translate("home:hardwareIncompatibleMessage", {
          app: app.name,
          missing: missingHardware,
        }),
      [{text: translate("common:ok")}],
      {
        iconName: "alert-circle-outline",
        iconColor: theme.colors.error,
      },
    )
  }

  return (
    <View style={themed($container)}>
      <AppsHeader title="home:incompatibleApps" showSearchIcon={false} />

      <View style={themed($descriptionContainer)}>
        <Text style={themed($descriptionText)}>{translate("home:incompatibleAppsDescription")}</Text>
      </View>

      <Spacer height={8} />

      {incompatibleApps.map((app, index) => (
        <React.Fragment key={app.packageName}>
          <AppListItem
            app={app}
            isActive={false}
            isIncompatible={true}
            onTogglePress={() => handleAppPress(app)}
            onSettingsPress={() => {}} // Disabled for incompatible apps
            opacity={opacityValue} // Use animated value for opacity
          />
          {index < incompatibleApps.length - 1 && (
            <>
              <Spacer height={8} />
              <Divider variant="inset" />
              <Spacer height={8} />
            </>
          )}
        </React.Fragment>
      ))}

      <Spacer height={16} />
    </View>
  )
}

const $container: ThemedStyle<ViewStyle> = ({spacing}) => ({
  marginHorizontal: spacing.lg,
})

const $descriptionContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
  marginBottom: spacing.sm,
})

const $descriptionText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 13,
  color: colors.textDim,
  lineHeight: 18,
})
