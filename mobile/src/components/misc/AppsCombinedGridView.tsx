import React, {useState} from "react"
import {View, ViewStyle, TextStyle, Dimensions} from "react-native"
import {TabView, SceneMap, TabBar} from "react-native-tab-view"
import {AppsGridView} from "./AppsGridView"
import {useAppTheme} from "@/utils/useAppTheme"
import {ThemedStyle} from "@/theme"
import {Text} from "@/components/ignite"
import {translate} from "@/i18n"
// import { ScrollView } from "react-native-gesture-handler"
import {ScrollView} from "react-native"

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

interface AppsCombinedGridViewProps {
  activeApps: AppModel[]
  inactiveApps: AppModel[]
  onStartApp: (packageName: string) => void
  onStopApp: (packageName: string) => void
  onOpenSettings: (app: AppModel) => void
  onOpenWebView?: (app: AppModel) => void
}

const initialLayout = {width: Dimensions.get("window").width}

const GRID_COLUMNS = 4
const APP_ITEM_HEIGHT = 100 // Approximate height of each app item (icon + text)
const TAB_BAR_HEIGHT = 48 // Height of the tab bar

export const AppsCombinedGridView: React.FC<AppsCombinedGridViewProps> = ({
  activeApps,
  inactiveApps,
  onStartApp,
  onStopApp,
  onOpenSettings,
  onOpenWebView,
}) => {
  const {themed, theme} = useAppTheme()
  const [index, setIndex] = useState(0)
  const [routes] = useState([
    {key: "active", title: translate("home:activeApps")},
    {key: "inactive", title: translate("home:inactiveApps")},
  ])

  const hasActiveApps = activeApps.length > 0
  const hasInactiveApps = inactiveApps.length > 0

  // Calculate the height needed for the TabView
  const calculateGridHeight = (appsCount: number) => {
    if (appsCount === 0) return 200 // Empty state height
    const rows = Math.ceil(appsCount / GRID_COLUMNS)
    return rows * APP_ITEM_HEIGHT + theme.spacing.md * 2 // Add padding
  }

  const activeAppsHeight = calculateGridHeight(activeApps.length)
  const inactiveAppsHeight = calculateGridHeight(inactiveApps.length)
  const maxContentHeight = Math.max(activeAppsHeight, inactiveAppsHeight)
  const tabViewHeight = maxContentHeight + TAB_BAR_HEIGHT

  // If no apps at all
  if (!hasActiveApps && !hasInactiveApps) {
    return (
      <View style={themed($emptyContainer)}>
        <Text text={translate("home:noAppsInstalled")} style={themed($emptyText)} />
      </View>
    )
  }

  // // If only one type of apps exists
  // if (hasActiveApps && !hasInactiveApps) {
  //   return (
  //     <View style={themed($container)}>
  //       <Text style={themed($sectionTitle)} text={translate("home:activeApps")} />
  //       <AppsGridView
  //         apps={activeApps}
  //         onStartApp={onStartApp}
  //         onStopApp={onStopApp}
  //         onOpenSettings={onOpenSettings}
  //         onOpenWebView={onOpenWebView}
  //       />
  //     </View>
  //   )
  // }

  // if (!hasActiveApps && hasInactiveApps) {
  //   return (
  //     <View style={themed($container)}>
  //       <Text style={themed($sectionTitle)} text={translate("home:inactiveApps")} />
  //       <AppsGridView
  //         apps={inactiveApps}
  //         onStartApp={onStartApp}
  //         onStopApp={onStopApp}
  //         onOpenSettings={onOpenSettings}
  //         onOpenWebView={onOpenWebView}
  //       />
  //     </View>
  //   )
  // }

  const ActiveRoute = () => (
    <View style={themed($scene)}>
      <AppsGridView
        apps={activeApps}
        onStartApp={onStartApp}
        onStopApp={onStopApp}
        onOpenSettings={onOpenSettings}
        onOpenWebView={onOpenWebView}
      />
    </View>
  )

  const InactiveRoute = () => (
    <View style={themed($scene)}>
      <ScrollView>
        <AppsGridView
          apps={inactiveApps}
          onStartApp={onStartApp}
          onStopApp={onStopApp}
          onOpenSettings={onOpenSettings}
          onOpenWebView={onOpenWebView}
        />
      </ScrollView>
    </View>
  )

  const renderScene = SceneMap({
    active: ActiveRoute,
    inactive: InactiveRoute,
  })

  const renderTabBar = (props: any) => (
    <TabBar
      {...props}
      indicatorStyle={{backgroundColor: theme.colors.palette.accent500}}
      style={{backgroundColor: theme.colors.background}}
      labelStyle={{
        fontSize: 16,
        fontWeight: "600",
        textTransform: "none",
      }}
      activeColor={theme.colors.text}
      inactiveColor={theme.colors.textDim}
    />
  )

  return (
    <View style={[themed($container)]}>
      <TabView
        navigationState={{index, routes}}
        renderScene={renderScene}
        renderTabBar={renderTabBar}
        onIndexChange={setIndex}
        initialLayout={initialLayout}
        style={[themed($tabView), {height: tabViewHeight}]}
        lazy={false}
      />
    </View>
  )
}

const $container: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $tabView: ThemedStyle<ViewStyle> = () => ({})

const $scene: ThemedStyle<ViewStyle> = ({spacing}) => ({
  paddingTop: spacing.md,
})

const $emptyContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
  padding: spacing.xl,
})

const $emptyText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 16,
  color: colors.textDim,
  textAlign: "center",
})
