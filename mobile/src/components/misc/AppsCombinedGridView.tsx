import React, {useState, useCallback, useMemo} from "react"
import {View, ViewStyle, TextStyle, Dimensions, Platform} from "react-native"
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
        <ScrollView showsVerticalScrollIndicator={true}>
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
        <ScrollView showsVerticalScrollIndicator={true}>
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
    (props: any) => (
      <TabBar
        {...props}
        indicatorStyle={{
          backgroundColor: theme.colors.text,
          borderRadius: 10,
          height: 2,
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
        }}
        indicatorContainerStyle={{
          flex: 1,
        }}
        style={themed($tabBar)}
        labelStyle={{
          fontSize: 16,
          fontWeight: "600",
          textTransform: "none",
        }}
        activeColor={theme.colors.text}
        inactiveColor={theme.colors.textDim}
      />
    ),
    [theme.colors],
  )

  // console.log("APPSCOMBINEDGRIDVIEW RE-RENDER")

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

const $tabBar: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.background,
  // width: "100%",
  marginHorizontal: spacing.lg,
  borderRadius: spacing.sm,
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
