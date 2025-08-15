import React from "react"
import {View, ViewStyle, TextStyle, TouchableOpacity, Dimensions, FlatList} from "react-native"
import {Text} from "@/components/ignite"
import {AppInterface, useAppStatus} from "@/contexts/AppStatusProvider"
import {translate} from "@/i18n"
import {useAppTheme} from "@/utils/useAppTheme"
import {Spacer} from "./Spacer"
import {spacing, ThemedStyle} from "@/theme"
import showAlert from "@/utils/AlertUtils"
import AppIcon from "./AppIcon"
import {useCoreStatus} from "@/contexts/CoreStatusProvider"

const GRID_COLUMNS = 4
const SCREEN_WIDTH = Dimensions.get("window").width

export default function IncompatibleAppsList() {
  const {appStatus} = useAppStatus()
  const {themed, theme} = useAppTheme()
  const {status} = useCoreStatus()

  // Filter out incompatible apps (not running and marked as incompatible)
  const incompatibleApps = appStatus.filter(app => {
    if (app.is_running) {
      return false
    }

    // Check if app has compatibility info and is marked as incompatible
    const isIncompatible = app.compatibility && !app.compatibility.isCompatible
    if (isIncompatible) {
      console.log("🚫 INCOMPATIBLE APP DETECTED:", app.name, {
        packageName: app.packageName,
        compatibility: app.compatibility,
        missingRequired: app.compatibility?.missingRequired,
      })
    }
    return isIncompatible
  })

  // console.log(`📱 Total incompatible apps found: ${incompatibleApps.length}`)

  // Don't show section if no incompatible apps
  if (incompatibleApps.length === 0) {
    return null
  }

  const handleAppPress = (app: AppInterface) => {
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

  // Get connected glasses name
  const glassesName = status.glasses_info?.model_name || status.core_info.default_wearable || "your glasses"

  // Pad the array to make sure incomplete rows are filled
  const paddedApps = [...incompatibleApps]
  if (paddedApps.length % GRID_COLUMNS !== 0) {
    const missingApps = GRID_COLUMNS - (paddedApps.length % GRID_COLUMNS)
    for (let i = 0; i < missingApps; i++) {
      paddedApps.push({packageName: `empty-${i}`, name: ""} as AppInterface)
    }
  }

  const renderAppItem = ({item}: {item: AppInterface}) => {
    // Empty placeholder
    if (item.packageName.startsWith("empty-")) {
      return <View style={themed($gridItem)} />
    }

    return (
      <TouchableOpacity style={themed($gridItem)} onPress={() => handleAppPress(item)} activeOpacity={0.7}>
        <View style={themed($appContainer)}>
          <AppIcon app={item} style={[themed($appIcon), themed($incompatibleIcon)]} />
        </View>
        <Text text={item.name} style={themed($appName)} numberOfLines={2} ellipsizeMode="tail" />
      </TouchableOpacity>
    )
  }

  return (
    <View style={themed($container)}>
      <Spacer height={theme.spacing.md} />

      {/* Header */}
      <Text style={themed($headerText)}>{`Incompatible with ${glassesName}`}</Text>

      {/* Grid of incompatible apps using FlatList like regular apps */}
      <FlatList
        data={paddedApps}
        renderItem={renderAppItem}
        keyExtractor={item => item.packageName}
        numColumns={GRID_COLUMNS}
        columnWrapperStyle={themed($row)}
        scrollEnabled={false}
        contentContainerStyle={themed($gridContainer)}
      />
    </View>
  )
}

const $container: ThemedStyle<ViewStyle> = ({spacing}) => ({
  paddingHorizontal: spacing.sm, // Match AppsGridView padding
})

const $headerText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 15,
  fontWeight: "600",
  color: colors.textDim,
  textAlign: "left", // Align left like section headers
  marginBottom: spacing.sm,
})

const $gridContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  // Match AppsGridView gridContainer
})

const $row: ThemedStyle<ViewStyle> = ({spacing}) => ({
  justifyContent: "space-evenly", // Match AppsGridView
})

const $gridItem: ThemedStyle<ViewStyle> = ({spacing}) => ({
  // Match exact width calculation from AppsGridView
  width: (SCREEN_WIDTH - spacing.lg * 2 - spacing.sm * 2 - spacing.xs * 4) / GRID_COLUMNS,
  alignItems: "center",
  marginBottom: spacing.sm,
  opacity: 0.6, // Make incompatible apps look disabled
})

const $appContainer: ThemedStyle<ViewStyle> = () => ({
  position: "relative",
})

const $appIcon: ThemedStyle<ViewStyle> = ({spacing}) => ({
  width: 60, // Match AppsGridView exactly
  height: 60,
  borderRadius: 30,
  marginBottom: spacing.xs,
  overflow: "hidden",
})

const $incompatibleIcon: ThemedStyle<ViewStyle> = () => ({
  opacity: 0.7, // Additional dimming for incompatible apps
})

const $appName: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 11, // Match AppsGridView exactly (was 12)
  fontWeight: "600", // Match AppsGridView
  color: colors.textDim,
  textAlign: "center",
  lineHeight: 14, // Match AppsGridView exactly
})
