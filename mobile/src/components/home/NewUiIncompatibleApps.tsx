import React, {useCallback} from "react"
import {View, FlatList, TouchableOpacity, Dimensions} from "react-native"
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons"

import {Text} from "@/components/ignite"
import AppIcon from "@/components/misc/AppIcon"
import {useAppTheme} from "@/utils/useAppTheme"
import {AppletInterface} from "@/contexts/AppletStatusProvider"
import showAlert from "@/utils/AlertUtils"
import {translate} from "@/i18n"
import {useCoreStatus} from "@/contexts/CoreStatusProvider"
import {useNewUiIncompatibleApps} from "@/hooks/useNewUiFilteredApps"

const GRID_COLUMNS = 4

export const NewUiIncompatibleApps: React.FC = () => {
  const {themed, theme} = useAppTheme()
  const {status} = useCoreStatus()
  const incompatibleApps = useNewUiIncompatibleApps()

  // Get connected glasses name
  const glassesName = status.glasses_info?.model_name || status.core_info.default_wearable || "your glasses"

  // Prepare grid data with placeholders
  const gridData = React.useMemo(() => {
    // Calculate how many empty placeholders we need to fill the last row
    const totalItems = incompatibleApps.length
    const remainder = totalItems % GRID_COLUMNS
    const emptySlots = remainder === 0 ? 0 : GRID_COLUMNS - remainder

    // Add empty placeholders to align items to the left
    const paddedApps = [...incompatibleApps]
    for (let i = 0; i < emptySlots; i++) {
      paddedApps.push({
        packageName: `empty-${i}`,
        name: "",
        type: "standard",
        logoURL: "",
        permissions: [],
      } as AppletInterface)
    }

    return paddedApps
  }, [incompatibleApps])

  const handleAppPress = useCallback(
    (app: AppletInterface) => {
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
    },
    [theme],
  )

  const renderItem = useCallback(
    ({item}: {item: AppletInterface}) => {
      // Don't render empty placeholders
      if (!item.name) {
        return <View style={themed($gridItem)} />
      }

      return (
        <TouchableOpacity style={themed($gridItem)} onPress={() => handleAppPress(item)} activeOpacity={0.7}>
          <View style={themed($appContainer)}>
            <AppIcon app={item as any} style={themed($appIcon)} />
          </View>
          <Text text={item.name} style={themed($appNameIncompatible)} numberOfLines={2} />
        </TouchableOpacity>
      )
    },
    [themed, theme, handleAppPress],
  )

  // Don't show section if no incompatible apps
  if (incompatibleApps.length === 0) {
    return null
  }

  return (
    <View style={themed($container)}>
      <View style={themed($header)}>
        <Text style={themed($headerText)}>{`Incompatible with ${glassesName}`}</Text>
      </View>

      <FlatList
        data={gridData}
        renderItem={renderItem}
        keyExtractor={item => item.packageName}
        numColumns={GRID_COLUMNS}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={themed($gridContent)}
      />
    </View>
  )
}

const $container = theme => ({
  marginTop: theme.spacing.md,
})

const $header = theme => ({
  marginBottom: theme.spacing.sm,
  paddingHorizontal: theme.spacing.xs,
})

const $headerText = theme => ({
  fontSize: 16,
  fontWeight: "600",
  color: theme.colors.text,
  flex: 1,
})

const $gridContent = theme => ({
  paddingBottom: theme.spacing.sm,
})

const $gridItem = theme => ({
  flex: 1,
  alignItems: "center",
  marginVertical: theme.spacing.sm,
  paddingHorizontal: theme.spacing.xs,
})

const $appContainer = theme => ({
  position: "relative",
  width: 64,
  height: 64,
  marginBottom: theme.spacing.xs,
})

const $appIcon = theme => ({
  width: 64,
  height: 64,
  borderRadius: theme.spacing.sm,
  opacity: 0.4,
})

const $appNameIncompatible = theme => ({
  fontSize: 12,
  color: theme.colors.textDim,
  textAlign: "center",
  marginTop: theme.spacing.xxs,
  lineHeight: 14,
  opacity: 0.6,
})