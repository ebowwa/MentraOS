import React, {useState, useCallback, useMemo} from "react"
import {View, ViewStyle, TextStyle, Dimensions, Platform} from "react-native"
import {TabView, SceneMap, TabBar} from "react-native-tab-view"
import {AppsGridView} from "./AppsGridView"
import {useAppTheme} from "@/utils/useAppTheme"
import {spacing, ThemedStyle} from "@/theme"
import {Text} from "@/components/ignite"
import {translate} from "@/i18n"
// import { ScrollView } from "react-native-gesture-handler"
import {ScrollView} from "react-native"
import {useAppStatus} from "@/contexts/AppStatusProvider"
import BackendServerComms from "@/backend_comms/BackendServerComms"
import showAlert from "@/utils/AlertUtils"
import {askPermissionsUI} from "@/utils/PermissionsUtils"
import {saveSetting} from "@/utils/SettingsHelper"
import {SETTINGS_KEYS} from "@/consts"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import AppsIncompatibleList from "@/components/misc/AppsIncompatibleList"
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

interface AppsCombinedGridViewProps {}

const initialLayout = {width: Dimensions.get("window").width}

const AppsCombinedGridViewRoot: React.FC<AppsCombinedGridViewProps> = () => {
  const {themed, theme} = useAppTheme()
  const {
    appStatus,
    checkAppHealthStatus,
    optimisticallyStartApp,
    optimisticallyStopApp,
    clearPendingOperation,
    refreshAppStatus,
  } = useAppStatus()
  const {push, replace} = useNavigationHistory()

  const backendComms = BackendServerComms.getInstance()
  const [index, setIndex] = useState(0)
  const [hasInitiallyLoaded, setHasInitiallyLoaded] = useState(false)
  const [routes] = useState([
    {key: "active", title: translate("home:activeApps")},
    {key: "inactive", title: translate("home:inactiveApps")},
  ])

  // Handler functions for grid view
  const handleStartApp = useCallback(
    async (packageName: string) => {
      const appInfo = appStatus.find(app => app.packageName === packageName)
      if (!appInfo) {
        console.error("App not found:", packageName)
        return
      }

      if (!(await checkAppHealthStatus(appInfo.packageName))) {
        showAlert(translate("errors:appNotOnlineTitle"), translate("errors:appNotOnlineMessage"), [
          {text: translate("common:ok")},
        ])
        return
      }

      // ask for needed perms:
      const result = await askPermissionsUI(appInfo, theme)
      if (result === -1) {
        return
      } else if (result === 0) {
        handleStartApp(appInfo.packageName) // restart this function
        return
      }

      // Optimistically update UI
      optimisticallyStartApp(packageName)

      // Handle foreground apps
      if (appInfo?.appType === "standard") {
        const runningStandardApps = appStatus.filter(
          app => app.is_running && app.appType === "standard" && app.packageName !== packageName,
        )

        for (const runningApp of runningStandardApps) {
          optimisticallyStopApp(runningApp.packageName)
          try {
            await backendComms.stopApp(runningApp.packageName)
            clearPendingOperation(runningApp.packageName)
          } catch (error) {
            console.error("Stop app error:", error)
            refreshAppStatus()
          }
        }
      }

      try {
        await backendComms.startApp(packageName)
        clearPendingOperation(packageName)
        await saveSetting(SETTINGS_KEYS.HAS_EVER_ACTIVATED_APP, true)
      } catch (error: any) {
        console.error("Start app error:", error)

        if (error?.response?.data?.error?.stage === "HARDWARE_CHECK") {
          showAlert(
            translate("home:hardwareIncompatible"),
            error.response.data.error.message ||
              translate("home:hardwareIncompatibleMessage", {
                app: appInfo.name,
                missing: "required hardware",
              }),
            [{text: translate("common:ok")}],
            {
              iconName: "alert-circle-outline",
              iconColor: theme.colors.error,
            },
          )
        }

        clearPendingOperation(packageName)
        refreshAppStatus()
      }
    },
    [
      appStatus,
      checkAppHealthStatus,
      optimisticallyStartApp,
      optimisticallyStopApp,
      clearPendingOperation,
      refreshAppStatus,
      backendComms,
      theme,
    ],
  )

  const handleStopApp = useCallback(
    async (packageName: string) => {
      optimisticallyStopApp(packageName)

      try {
        await backendComms.stopApp(packageName)
        clearPendingOperation(packageName)
      } catch (error) {
        refreshAppStatus()
        console.error("Stop app error:", error)
      }
    },
    [optimisticallyStopApp, clearPendingOperation, refreshAppStatus, backendComms],
  )

  const handleOpenAppSettings = useCallback(
    (app: any) => {
      push("/applet/settings", {packageName: app.packageName, appName: app.name})
    },
    [push],
  )

  const handleOpenWebView = useCallback(
    (app: any) => {
      if (app.webviewURL) {
        replace("/applet/webview", {
          webviewURL: app.webviewURL,
          appName: app.name,
          packageName: app.packageName,
        })
      }
    },
    [replace],
  )

  // Memoize filtered arrays to prevent unnecessary re-renders
  const activeApps = useMemo(() => appStatus.filter(app => app.is_running), [appStatus])

  const inactiveApps = useMemo(
    () =>
      appStatus.filter(
        app =>
          !app.is_running &&
          (!app.compatibility || app.compatibility.isCompatible) &&
          !(Platform.OS === "ios" && (app.packageName === "cloud.augmentos.notify" || app.name === "Notify")),
      ),
    [appStatus],
  )

  // Track when apps have initially loaded
  React.useEffect(() => {
    if (appStatus.length > 0 && !hasInitiallyLoaded) {
      setHasInitiallyLoaded(true)

      // Auto-switch to the tab that has apps
      if (activeApps.length === 0 && inactiveApps.length > 0) {
        setIndex(1) // Switch to inactive tab
      } else if (activeApps.length > 0 && inactiveApps.length === 0) {
        setIndex(0) // Switch to active tab
      }
    }
  }, [appStatus, activeApps.length, inactiveApps.length, hasInitiallyLoaded])

  // If no apps at all
  // if (!hasActiveApps && !hasInactiveApps) {
  //   return (
  //     <View style={themed($emptyContainer)}>
  //       <Text text={translate("home:noAppsInstalled")} style={themed($emptyText)} />
  //     </View>
  //   )
  // }

  const ActiveRoute = useMemo(
    () => () => (
      <View style={[themed($scene), {minHeight: 300}]}>
        <ScrollView
          showsVerticalScrollIndicator={true}
          contentContainerStyle={{paddingBottom: spacing.lg}} // Space for tab bar
        >
          <AppsGridView
            apps={activeApps}
            onStartApp={handleStartApp}
            onStopApp={handleStopApp}
            onOpenSettings={handleOpenAppSettings}
            onOpenWebView={handleOpenWebView}
          />
        </ScrollView>
      </View>
    ),
    [activeApps, handleStartApp, handleStopApp, handleOpenAppSettings, handleOpenWebView, themed],
  )

  const InactiveRoute = useMemo(
    () => () => (
      <View style={themed($scene)}>
        <ScrollView
          showsVerticalScrollIndicator={true}
          contentContainerStyle={{paddingBottom: spacing.lg}} // Space for tab bar
        >
          <AppsGridView
            apps={inactiveApps}
            onStartApp={handleStartApp}
            onStopApp={handleStopApp}
            onOpenSettings={handleOpenAppSettings}
            onOpenWebView={handleOpenWebView}
          />
          <AppsIncompatibleList />
        </ScrollView>
      </View>
    ),
    [inactiveApps, handleStartApp, handleStopApp, handleOpenAppSettings, handleOpenWebView, themed],
  )

  const renderScene = useMemo(
    () =>
      SceneMap({
        active: ActiveRoute,
        inactive: InactiveRoute,
      }),
    [ActiveRoute, InactiveRoute],
  )

  const renderTabBar = useCallback(
    (props: any) => {
      // Check if we should disable tabs (only after initial load)
      const shouldDisableActiveTab = hasInitiallyLoaded && activeApps.length === 0 && inactiveApps.length > 0
      const shouldDisableInactiveTab = hasInitiallyLoaded && inactiveApps.length === 0 && activeApps.length > 0

      return (
        <TabBar
          {...props}
          indicatorStyle={themed($indicator)}
          indicatorContainerStyle={{
            width: "50%",
          }}
          style={themed($tabBar)}
          labelStyle={{
            fontSize: 16,
            fontWeight: "600",
            textTransform: "none",
          }}
          activeColor={theme.colors.text}
          inactiveColor={theme.colors.textDim}
          onTabPress={({route, preventDefault}) => {
            if (
              (route.key === "active" && shouldDisableActiveTab) ||
              (route.key === "inactive" && shouldDisableInactiveTab)
            ) {
              preventDefault()
            }
          }}
          getLabelText={({route}) => {
            const isDisabled =
              (route.key === "active" && shouldDisableActiveTab) ||
              (route.key === "inactive" && shouldDisableInactiveTab)
            return route.title + (isDisabled ? "" : "")
          }}
        />
      )
    },
    [theme.colors, hasInitiallyLoaded, activeApps.length, inactiveApps.length],
  )

  // console.log("APPSCOMBINEDGRIDVIEW RE-RENDER")

  // Check if we should show the tooltip instead of tabs
  const shouldShowTooltip = hasInitiallyLoaded && activeApps.length === 0 && inactiveApps.length > 0

  if (shouldShowTooltip) {
    return (
      <View style={[themed($container)]}>
        <View style={themed($tooltipBar)}>
          <MaterialCommunityIcons name="gesture-tap" size={20} color={theme.colors.textDim} />
          <Text text={translate("home:tapToActivate")} style={themed($tooltipText)} />
        </View>
        <View style={[themed($scene), {flex: 1}]}>
          <ScrollView
            showsVerticalScrollIndicator={true}
            contentContainerStyle={{paddingBottom: spacing.lg}} // Space for tab bar
          >
            <AppsGridView
              apps={inactiveApps}
              onStartApp={handleStartApp}
              onStopApp={handleStopApp}
              onOpenSettings={handleOpenAppSettings}
              onOpenWebView={handleOpenWebView}
            />
            <AppsIncompatibleList />
          </ScrollView>
        </View>
      </View>
    )
  }

  return (
    <View style={[themed($container)]}>
      <TabView
        navigationState={{index, routes}}
        renderScene={renderScene}
        renderTabBar={renderTabBar}
        onIndexChange={setIndex}
        initialLayout={initialLayout}
        style={[themed($tabView)]}
        lazy={false}
      />
    </View>
  )
}

// memoize the component to prevent unnecessary re-renders:
export const AppsCombinedGridView = React.memo(AppsCombinedGridViewRoot)

const $container: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  marginHorizontal: -spacing.lg,
})

const $scene: ThemedStyle<ViewStyle> = ({spacing}) => ({
  paddingTop: spacing.md,
})

const $indicator: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.text,
  borderRadius: 10,
  height: 2,
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
  width: "85%",
  marginLeft: "7.5%",
})

const $tabBar: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.background,
  marginHorizontal: spacing.lg,
  borderRadius: spacing.sm,
  borderWidth: spacing.xxxs,
  borderColor: colors.border,
  elevation: 0,
  shadowOpacity: 0,
  shadowOffset: {width: 0, height: 0},
  shadowRadius: 0,
})

const $tabView: ThemedStyle<ViewStyle> = ({spacing}) => ({
  // paddingHorizontal: spacing.lg,
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

const $tooltipBar: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  gap: spacing.xs,
  paddingVertical: spacing.sm,
  paddingHorizontal: spacing.lg,
  marginHorizontal: spacing.lg,
  marginBottom: spacing.xs,
  backgroundColor: colors.background,
  borderRadius: spacing.sm,
  borderWidth: spacing.xxxs,
  borderColor: colors.border,
  height: 48, // Same height as tab bar
})

const $tooltipText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 14,
  color: colors.textDim,
  fontWeight: "500",
})
