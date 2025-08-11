import React, {useState, useCallback, useMemo, useEffect} from "react"
import {View, ViewStyle, TextStyle, Dimensions, Platform, TouchableOpacity} from "react-native"
import {TabView, SceneMap, TabBar} from "react-native-tab-view"
import {AppsGridView} from "./AppsGridView"
import {useAppTheme} from "@/utils/useAppTheme"
import {ThemedStyle} from "@/theme"
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
  const [hasInitiallyLoaded, setHasInitiallyLoaded] = useState(false)
  const [index, setIndex] = useState(0)
  const [routes] = useState([
    {key: "active", title: translate("home:activeApps")},
    {key: "inactive", title: translate("home:inactiveApps")},
  ])

  const handleIndexChange = (index: number) => {
    // console.log("handleIndexChange", index)
  }

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

  const handleOpenAppSettings = (app: any) => {
    push("/applet/settings", {packageName: app.packageName, appName: app.name})
  }

  const handleOpenWebView = (app: any) => {
    if (app.webviewURL) {
      push("/applet/webview", {
        webviewURL: app.webviewURL,
        appName: app.name,
        packageName: app.packageName,
      })
    }
  }

  console.log("APPSCOMBINEDGRIDVIEW RE-RENDER")

  // Memoize filtered arrays to prevent unnecessary re-renders
  const activeApps = useMemo(() => appStatus.filter(app => app.is_running), [appStatus])

  const inactiveApps = useMemo(() => {
    const filtered = appStatus.filter(
      app =>
        !app.is_running &&
        (!app.compatibility || app.compatibility.isCompatible) &&
        !(Platform.OS === "ios" && (app.packageName === "cloud.augmentos.notify" || app.name === "Notify")),
    )

    // Log apps that were filtered out due to compatibility
    const incompatibleCount = appStatus.filter(
      app => !app.is_running && app.compatibility && !app.compatibility.isCompatible,
    ).length

    console.log(
      `📊 Apps Status - Active: ${activeApps.length}, Inactive (compatible): ${filtered.length}, Incompatible: ${incompatibleCount}`,
    )

    return filtered
  }, [appStatus, activeApps.length])

  // Track when apps have initially loaded
  useEffect(() => {
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

  const ActiveRoute = () => (
    <ScrollView
      showsVerticalScrollIndicator={true}
      contentContainerStyle={{paddingBottom: theme.spacing.sm, paddingTop: theme.spacing.md}} // Space for tab bar and navbar
      style={{flex: 1}}>
      <AppsGridView
        apps={activeApps}
        onStartApp={handleStartApp}
        onStopApp={handleStopApp}
        onOpenSettings={handleOpenAppSettings}
        onOpenWebView={handleOpenWebView}
      />
    </ScrollView>
  )

  const InactiveRoute = () => (
    <ScrollView
      showsVerticalScrollIndicator={true}
      contentContainerStyle={{paddingBottom: theme.spacing.sm, paddingTop: theme.spacing.md}} // Space for tab bar and navbar
      style={{flex: 1}}>
      <AppsGridView
        apps={inactiveApps}
        onStartApp={handleStartApp}
        onStopApp={handleStopApp}
        onOpenSettings={handleOpenAppSettings}
        onOpenWebView={handleOpenWebView}
      />
      <AppsIncompatibleList />
    </ScrollView>
  )

  const renderScene = useMemo(
    () =>
      SceneMap({
        active: React.memo(ActiveRoute),
        inactive: React.memo(InactiveRoute),
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
          style={themed($simpleTabBar)}
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
          getLabelText={({route}: any) => {
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

  // Single container approach with tooltip
  if (shouldShowTooltip) {
    return (
      <View style={[themed($container)]}>
        <View style={themed($singleContainer)}>
          <View style={themed($headerSection)}>
            <Text text={translate("home:tapToActivate")} style={themed($tooltipText)} />
          </View>
          <ScrollView
            showsVerticalScrollIndicator={true}
            contentContainerStyle={{paddingBottom: theme.spacing.sm, paddingTop: theme.spacing.md}}
            style={{flex: 1}}>
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

  // Use TabView for swipe gestures, but wrap it in single container
  return (
    <View style={[themed($container)]}>
      <View style={themed($singleContainer)}>
        <TabView
          navigationState={{index, routes}}
          renderScene={renderScene}
          renderTabBar={renderTabBar}
          onIndexChange={handleIndexChange}
          initialLayout={initialLayout}
          style={{flex: 1}}
          lazy={false}
        />
      </View>
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
  // paddingTop moved to ScrollView contentContainerStyle
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
  borderTopLeftRadius: spacing.sm,
  borderTopRightRadius: spacing.sm,
  borderBottomLeftRadius: 0,
  borderBottomRightRadius: 0,
  borderTopWidth: spacing.xxxs,
  borderLeftWidth: spacing.xxxs,
  borderRightWidth: spacing.xxxs,
  borderBottomWidth: 0,
  borderColor: colors.border,
  elevation: 0,
  shadowOpacity: 0,
  shadowOffset: {width: 0, height: 0},
  shadowRadius: 0,
})

const $tabView: ThemedStyle<ViewStyle> = ({spacing}) => ({
  // paddingHorizontal: spacing.lg,
})

const $tooltipText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 15,
  color: colors.textDim,
  fontWeight: "500",
})

const $singleContainer: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  flex: 1,
  backgroundColor: colors.background,
  marginHorizontal: spacing.lg,
  marginBottom: spacing.lg, // Add space above navbar
  borderRadius: spacing.sm,
  borderWidth: spacing.xxxs,
  borderColor: colors.border,
  overflow: "hidden",
})

const $simpleTabBar: ThemedStyle<ViewStyle> = ({colors}) => ({
  backgroundColor: colors.background,
  elevation: 0,
  shadowOpacity: 0,
  borderBottomWidth: 1,
  borderBottomColor: "rgba(0,0,0,0.05)",
})

const $headerSection: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  gap: spacing.xs,
  paddingVertical: spacing.sm,
  paddingHorizontal: spacing.lg,
  height: 48,
  borderBottomWidth: 1,
  borderBottomColor: "rgba(0,0,0,0.05)",
})
