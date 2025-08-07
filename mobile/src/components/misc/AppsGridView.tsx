import React, {useState, useRef} from "react"
import {View, ScrollView, TouchableOpacity, ViewStyle, TextStyle, Dimensions, FlatList} from "react-native"
import Popover from "react-native-popover-view"
import {Text} from "@/components/ignite"
import AppIcon from "./AppIcon"
import {useAppTheme} from "@/utils/useAppTheme"
import {ThemedStyle} from "@/theme"
import {translate} from "@/i18n"
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons"

interface AppModel {
  name: string
  packageName: string
  is_running?: boolean
  is_foreground?: boolean
  appType?: string
  webviewURL?: string
  compatibility?: {
    isCompatible: boolean
    message?: string
  }
}

interface AppsGridViewProps {
  apps: AppModel[]
  onStartApp: (packageName: string) => void
  onStopApp: (packageName: string) => void
  onOpenSettings: (app: AppModel) => void
  onOpenWebView?: (app: AppModel) => void
  title?: string
  showInactiveApps?: boolean
}

const GRID_COLUMNS = 3
const SCREEN_WIDTH = Dimensions.get("window").width

export const AppsGridView: React.FC<AppsGridViewProps> = ({
  apps,
  onStartApp,
  onStopApp,
  onOpenSettings,
  onOpenWebView,
  title,
  showInactiveApps = false,
}) => {
  const {themed, theme} = useAppTheme()
  const [selectedApp, setSelectedApp] = useState<AppModel | null>(null)
  const [popoverVisible, setPopoverVisible] = useState(false)
  const touchableRefs = useRef<{[key: string]: TouchableOpacity | null}>({})

  const handleAppPress = (app: AppModel) => {
    setSelectedApp(app)
    setPopoverVisible(true)
  }

  const handlePopoverClose = () => {
    setPopoverVisible(false)
    setSelectedApp(null)
  }

  const handleStartStop = () => {
    if (selectedApp) {
      if (selectedApp.is_running) {
        onStopApp(selectedApp.packageName)
      } else {
        onStartApp(selectedApp.packageName)
      }
      handlePopoverClose()
    }
  }

  const handleOpenSettings = () => {
    if (selectedApp) {
      onOpenSettings(selectedApp)
      handlePopoverClose()
    }
  }

  const handleOpenWebView = () => {
    if (selectedApp && onOpenWebView) {
      onOpenWebView(selectedApp)
      handlePopoverClose()
    }
  }

  const renderAppItem = ({item, index}: {item: AppModel; index: number}) => {
    const isActive = item.is_running || false
    const isForeground = item.appType === "standard" || item.is_foreground

    return (
      <TouchableOpacity
        ref={ref => {
          touchableRefs.current[item.packageName] = ref
        }}
        key={item.packageName}
        style={themed($gridItem)}
        onPress={() => handleAppPress(item)}
        activeOpacity={0.7}>
        <View style={themed($appContainer)}>
          <AppIcon app={item} isForegroundApp={isForeground} style={themed($appIcon)} />
          {isActive && <View style={themed($activeIndicator)} />}
        </View>
        <Text text={item.name} style={themed($appName)} numberOfLines={2} ellipsizeMode="tail" />
      </TouchableOpacity>
    )
  }

  return (
    <View style={themed($container)}>
      {title && <Text style={themed($title)} text={title} />}

      <FlatList
        data={apps}
        renderItem={renderAppItem}
        keyExtractor={item => item.packageName}
        numColumns={GRID_COLUMNS}
        columnWrapperStyle={themed($row)}
        scrollEnabled={false}
        contentContainerStyle={themed($gridContainer)}
      />

      {selectedApp && touchableRefs.current[selectedApp.packageName] && (
        <Popover
          from={touchableRefs.current[selectedApp.packageName]!}
          isVisible={popoverVisible}
          onRequestClose={handlePopoverClose}
          popoverStyle={themed($popoverStyle)}
          backgroundStyle={{backgroundColor: "rgba(0, 0, 0, 0.5)"}}
          animationConfig={{duration: 200}}
          arrowSize={{width: 16, height: 8}}>
          <View style={themed($popoverContent)}>
            <View style={themed($popoverHeader)}>
              <AppIcon
                app={selectedApp}
                isForegroundApp={selectedApp.appType === "standard"}
                style={themed($popoverAppIcon)}
              />
              <Text text={selectedApp.name} style={themed($popoverAppName)} numberOfLines={1} />
            </View>

            <View style={themed($popoverDivider)} />

            <TouchableOpacity style={themed($popoverOption)} onPress={handleStartStop}>
              <MaterialCommunityIcons
                name={selectedApp.is_running ? "stop-circle-outline" : "play-circle-outline"}
                size={24}
                color={theme.colors.text}
              />
              <Text
                text={selectedApp.is_running ? translate("common:stop") : translate("common:start")}
                style={themed($popoverOptionText)}
              />
            </TouchableOpacity>

            <TouchableOpacity style={themed($popoverOption)} onPress={handleOpenSettings}>
              <MaterialCommunityIcons name="cog-outline" size={24} color={theme.colors.text} />
              <Text text={translate("common:settings")} style={themed($popoverOptionText)} />
            </TouchableOpacity>

            {selectedApp.webviewURL && onOpenWebView && (
              <TouchableOpacity style={themed($popoverOption)} onPress={handleOpenWebView}>
                <MaterialCommunityIcons name="web" size={24} color={theme.colors.text} />
                <Text text={translate("common:openWebView")} style={themed($popoverOptionText)} />
              </TouchableOpacity>
            )}
          </View>
        </Popover>
      )}
    </View>
  )
}

const $container: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
})

const $title: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 18,
  fontWeight: "600",
  color: colors.text,
  marginBottom: spacing.md,
  marginLeft: spacing.md,
})

const $gridContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  paddingHorizontal: spacing.sm,
})

const $row: ThemedStyle<ViewStyle> = ({spacing}) => ({
  justifyContent: "space-between",
  paddingHorizontal: spacing.sm,
})

const $gridItem: ThemedStyle<ViewStyle> = ({spacing}) => ({
  width: (SCREEN_WIDTH - spacing.md * 2 - spacing.sm * 4) / GRID_COLUMNS,
  alignItems: "center",
  marginBottom: spacing.lg,
})

const $appContainer: ThemedStyle<ViewStyle> = () => ({
  position: "relative",
})

const $appIcon: ThemedStyle<ViewStyle> = ({spacing}) => ({
  width: 60,
  height: 60,
  marginBottom: spacing.xs,
})

const $activeIndicator: ThemedStyle<ViewStyle> = ({colors}) => ({
  position: "absolute",
  bottom: 4,
  right: 4,
  width: 12,
  height: 12,
  borderRadius: 6,
  backgroundColor: colors.success,
  borderWidth: 2,
  borderColor: colors.background,
})

const $appName: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 12,
  color: colors.text,
  textAlign: "center",
  lineHeight: 14,
})

const $popoverStyle: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.background,
  borderRadius: spacing.sm,
  padding: 0,
  minWidth: 200,
})

const $popoverContent: ThemedStyle<ViewStyle> = () => ({})

const $popoverHeader: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  alignItems: "center",
  padding: spacing.md,
})

const $popoverAppIcon: ThemedStyle<ViewStyle> = ({spacing}) => ({
  width: 32,
  height: 32,
  marginRight: spacing.sm,
})

const $popoverAppName: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 16,
  fontWeight: "600",
  color: colors.text,
  flex: 1,
})

const $popoverDivider: ThemedStyle<ViewStyle> = ({colors}) => ({
  height: 1,
  backgroundColor: colors.separator,
})

const $popoverOption: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  alignItems: "center",
  padding: spacing.md,
})

const $popoverOptionText: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 15,
  color: colors.text,
  marginLeft: spacing.md,
})
