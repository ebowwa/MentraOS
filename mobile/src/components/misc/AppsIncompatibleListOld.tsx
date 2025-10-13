import {Fragment} from "react"
import {View, ViewStyle} from "react-native"
import {useAppStatus} from "@/contexts/AppletStatusProvider"
import {AppletInterface} from "@/types/AppletTypes"
import {translate} from "@/i18n"
import {useAppTheme} from "@/utils/useAppTheme"
import {Spacer} from "./Spacer"
import {ThemedStyle} from "@/theme"
import showAlert from "@/utils/AlertUtils"
import {AppListItem} from "./AppListItem"
import Divider from "./Divider"
import AppsHeader from "./AppsHeader"

export default function IncompatibleAppsListOld() {
  const {appStatus} = useAppStatus()
  const {themed, theme} = useAppTheme()

  // Filter out incompatible apps (not running and marked as incompatible)
  const incompatibleApps = appStatus.filter(app => {
    if (app.is_running) {
      return false
    }

    // Check if app has compatibility info and is marked as incompatible
    const isIncompatible = app.compatibility && !app.compatibility.isCompatible
    return isIncompatible
  })

  // Don't show section if no incompatible apps
  if (incompatibleApps.length === 0) {
    return null
  }

  const handleAppPress = (app: AppletInterface) => {
    // Show alert explaining why the app is incompatible
    const missingHardware =
      app.compatibility?.missingRequired?.map(req => req.type.toLowerCase()).join(", ") || "required features"

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
    <View style={themed($appsContainer)}>
      <View style={themed($headerContainer)}>
        <AppsHeader title="home:incompatibleApps" showSearchIcon={false} />
      </View>

      <View style={themed($contentContainer)}>
        {incompatibleApps.map((app, index) => (
          <Fragment key={app.packageName}>
            <AppListItem
              app={app}
              isActive={false}
              isIncompatible={true}
              onTogglePress={() => handleAppPress(app)}
              onSettingsPress={() => handleAppPress(app)}
              isDisabled={false}
            />
            {index < incompatibleApps.length - 1 && (
              <>
                <Spacer height={8} />
                <Divider variant="inset" />
                <Spacer height={8} />
              </>
            )}
          </Fragment>
        ))}
      </View>
    </View>
  )
}

const $appsContainer: ThemedStyle<ViewStyle> = () => ({
  justifyContent: "flex-start",
})

const $headerContainer: ThemedStyle<ViewStyle> = () => ({})

const $contentContainer: ThemedStyle<ViewStyle> = () => ({})
