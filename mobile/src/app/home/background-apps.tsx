import {Fragment, useMemo} from "react"
import {View, ScrollView, TouchableOpacity, ViewStyle, TextStyle} from "react-native"
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons"

import {Header, Screen, Text, Switch} from "@/components/ignite"
import AppIcon from "@/components/misc/AppIcon"
import ChevronRight from "assets/icons/component/ChevronRight"
import {GetMoreAppsIcon} from "@/components/misc/GetMoreAppsIcon"
import {AppletInterface, useAppStatus} from "@/contexts/AppletStatusProvider"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {useCoreStatus} from "@/contexts/CoreStatusProvider"
import {useAppTheme} from "@/utils/useAppTheme"
import restComms from "@/managers/RestComms"
import Divider from "@/components/misc/Divider"
import {Spacer} from "@/components/misc/Spacer"
import {performHealthCheckFlow} from "@/utils/healthCheckFlow"
import {askPermissionsUI} from "@/utils/PermissionsUtils"
import {showAlert} from "@/utils/AlertUtils"
import {ThemedStyle} from "@/theme"

export default function BackgroundAppsScreen() {
  const {themed, theme} = useAppTheme()
  const {push, goBack} = useNavigationHistory()
  const {status} = useCoreStatus()
  const {appStatus, optimisticallyStartApp, optimisticallyStopApp, clearPendingOperation, refreshAppStatus} =
    useAppStatus()

  const backgroundApps = useMemo(
    () => appStatus.filter(app => app.type === "background"),
    [appStatus],
  )

  const incompatibleApps = useMemo(
    () =>
      backgroundApps.filter(
        app => !app.is_running && app.compatibility !== undefined && app.compatibility.isCompatible === false,
      ),
    [backgroundApps],
  )

  const {activeApps, inactiveApps} = useMemo(() => {
    const isCompatible = (app: AppletInterface) => !(app.compatibility && app.compatibility.isCompatible === false)

    const active = backgroundApps.filter(app => app.is_running && isCompatible(app))
    const inactive = backgroundApps.filter(app => !app.is_running && isCompatible(app))

    return {activeApps: active, inactiveApps: inactive}
  }, [backgroundApps])

  const glassesName =
    status.glasses_info?.model_name || status.core_info?.default_wearable || "your glasses"

  const toggleApp = async (app: AppletInterface) => {
    if (app.is_running) {
      await stopApp(app.packageName)
    } else {
      await startApp(app.packageName)
    }
  }

  const startApp = async (packageName: string) => {
    const app = backgroundApps.find(a => a.packageName === packageName)
    if (!app) {
      console.error("App not found:", packageName)
      return
    }

    const permissionResult = await askPermissionsUI(app, theme)
    if (permissionResult === -1) {
      return
    } else if (permissionResult === 0) {
      await startApp(packageName)
      return
    }

    if (app.isOnline !== false) {
      console.log("Background app is online, starting optimistically:", packageName)
      optimisticallyStartApp(packageName)

      performHealthCheckFlow({
        app,
        onStartApp: async () => {
          try {
            await restComms.startApp(packageName)
            clearPendingOperation(packageName)
          } catch (error) {
            refreshAppStatus()
            console.error("Start app error:", error)
          }
        },
        onAppUninstalled: async () => {
          await refreshAppStatus()
        },
        onHealthCheckFailed: async () => {
          console.log("Health check failed, reverting background app to inactive:", packageName)
          optimisticallyStopApp(packageName)
          refreshAppStatus()
        },
        optimisticallyStopApp,
        clearPendingOperation,
      })
    } else {
      await performHealthCheckFlow({
        app,
        onStartApp: async () => {
          optimisticallyStartApp(packageName)
          try {
            await restComms.startApp(packageName)
            clearPendingOperation(packageName)
          } catch (error) {
            refreshAppStatus()
            console.error("Start app error:", error)
          }
        },
        onAppUninstalled: async () => {
          await refreshAppStatus()
        },
        optimisticallyStopApp,
        clearPendingOperation,
      })
    }
  }

  const stopApp = async (packageName: string) => {
    optimisticallyStopApp(packageName)

    try {
      await restComms.stopApp(packageName)
      clearPendingOperation(packageName)
    } catch (error) {
      refreshAppStatus()
      console.error("Stop app error:", error)
    }
  }

  const openAppSettings = (app: AppletInterface) => {
    if (app.webviewURL && app.isOnline !== false) {
      push("/applet/webview", {
        webviewURL: app.webviewURL,
        appName: app.name,
        packageName: app.packageName,
      })
    } else {
      push("/applet/settings", {
        packageName: app.packageName,
        appName: app.name,
      })
    }
  }

  const renderAppItem = (app: AppletInterface, index: number, isLast: boolean) => {
    const handleRowPress = () => {
      if (app.is_running) {
        openAppSettings(app)
      }
    }

    return (
      <Fragment key={app.packageName}>
        <TouchableOpacity
          style={themed($appRow)}
          onPress={handleRowPress}
          activeOpacity={app.is_running ? 0.7 : 1}
          disabled={!app.is_running}>
          <View style={themed($appContent)}>
            <AppIcon app={app as any} style={themed($appIcon)} hideLoadingIndicator={app.is_running} />
            <View style={themed($appInfo)}>
              <Text
                text={app.name}
                style={[themed($appName), app.isOnline === false && themed($offlineApp)]}
                numberOfLines={1}
                ellipsizeMode="tail"
              />
              {app.isOnline === false && (
                <View style={themed($offlineRow)}>
                  <MaterialCommunityIcons name="alert-circle" size={14} color={theme.colors.error} />
                  <Text text="Offline" style={themed($offlineText)} />
                </View>
              )}
            </View>
          </View>
          <View style={themed($rightControls)}>
            {app.is_running && (
              <TouchableOpacity
                onPress={e => {
                  e.stopPropagation()
                  openAppSettings(app)
                }}
                style={themed($gearButton)}
                hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
                <MaterialCommunityIcons name="cog" size={22} color={theme.colors.textDim} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={e => {
                e.stopPropagation()
                toggleApp(app)
              }}
              activeOpacity={1}>
              <Switch
                value={app.is_running}
                onValueChange={() => toggleApp(app)}
                disabled={false}
                pointerEvents="none"
              />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
        {!isLast && <Divider />}
      </Fragment>
    )
  }

  return (
    <Screen preset="fixed" style={themed($screen)}>
      <Header leftIcon="back" onLeftPress={goBack} title="Background Apps" />

      <View style={themed($headerInfo)}>
        <Text style={themed($headerText)}>Multiple background apps can be active at once.</Text>
      </View>

      <ScrollView
        style={themed($scrollView)}
        contentContainerStyle={themed($scrollViewContent)}
        showsVerticalScrollIndicator={false}>
        {backgroundApps.length === 0 ? (
          <View style={themed($emptyContainer)}>
            <Text style={themed($emptyText)}>No background apps available</Text>
          </View>
        ) : (
          <>
            {activeApps.length > 0 ? (
              <>
                <Text style={themed($sectionHeader)}>Active Background Apps</Text>
                <View style={themed($sectionContent)}>
                  {activeApps.map((app, index) => renderAppItem(app, index, index === activeApps.length - 1))}
                </View>
                <Spacer height={theme.spacing.lg} />
              </>
            ) : (
              <>
                <Text style={themed($sectionHeader)}>Active Background Apps</Text>
                <View style={themed($tipContainer)}>
                  <View style={themed($tipContent)}>
                    <Text style={themed($tipText)}>Activate an App</Text>
                    <Text style={themed($tipSubtext)}>Tap an app's switch to activate it</Text>
                  </View>
                  <Switch value={false} onValueChange={() => {}} disabled={false} pointerEvents="none" />
                </View>
                <Spacer height={theme.spacing.lg} />
              </>
            )}

            {inactiveApps.length > 0 && (
              <>
                <Text style={themed($sectionHeader)}>Inactive Background Apps</Text>
                <View style={themed($sectionContent)}>
                  {inactiveApps.map((app, index) => renderAppItem(app, index, false))}
                  <TouchableOpacity style={themed($appRow)} onPress={() => push("/store")} activeOpacity={0.7}>
                    <View style={themed($appContent)}>
                      <GetMoreAppsIcon size="medium" />
                      <View style={themed($appInfo)}>
                        <Text text="Get More Apps" style={themed($appName)} />
                        <Text text="Explore the MentraOS Store" style={themed($getMoreAppsSubtext)} />
                      </View>
                    </View>
                    <ChevronRight color={theme.colors.textDim} />
                  </TouchableOpacity>
                </View>
              </>
            )}

            {incompatibleApps.length > 0 && (
              <>
                <Spacer height={theme.spacing.lg} />
                <Text style={themed($sectionHeader)}>{`Incompatible with ${glassesName}`}</Text>
                <View style={themed($sectionContent)}>
                  {incompatibleApps.map((app, index) => (
                    <Fragment key={app.packageName}>
                      <TouchableOpacity
                        style={themed($appRow)}
                        onPress={() => {
                          const missingHardware =
                            app.compatibility?.missingRequired?.map(req => req.type.toLowerCase()).join(", ") ||
                            "required features"
                          showAlert(
                            "Hardware Incompatible",
                            app.compatibility?.message ||
                              `${app.name} requires ${missingHardware} which is not available on your connected glasses`,
                            [{text: "OK"}],
                            {
                              iconName: "alert-circle-outline",
                              iconColor: theme.colors.error,
                            },
                          )
                        }}
                        activeOpacity={0.7}>
                        <View style={themed($appContent)}>
                          <AppIcon app={app as any} style={themed($incompatibleAppIcon)} />
                          <View style={themed($appInfo)}>
                            <Text
                              text={app.name}
                              style={themed($incompatibleAppName)}
                              numberOfLines={1}
                              ellipsizeMode="tail"
                            />
                          </View>
                        </View>
                      </TouchableOpacity>
                      {index < incompatibleApps.length - 1 && <Divider />}
                    </Fragment>
                  ))}
                </View>
              </>
            )}
          </>
        )}

        <Spacer height={theme.spacing.xxl} />
      </ScrollView>
    </Screen>
  )
}

const $screen: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $headerInfo: ThemedStyle<ViewStyle> = ({spacing, colors}) => ({
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
  borderBottomWidth: 1,
  borderBottomColor: colors.border,
})

const $headerText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 14,
  color: colors.textDim,
  textAlign: "center",
})

const $scrollView: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $scrollViewContent: ThemedStyle<ViewStyle> = ({spacing}) => ({
  paddingTop: spacing.md,
})

const $sectionHeader: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 14,
  fontWeight: "600",
  color: colors.textDim,
  marginBottom: spacing.xs,
  paddingHorizontal: spacing.lg,
  textTransform: "uppercase",
  letterSpacing: 0.5,
})

const $sectionContent: ThemedStyle<ViewStyle> = ({spacing}) => ({
  paddingHorizontal: spacing.lg,
})

const $appRow: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  paddingVertical: spacing.md,
  minHeight: 72,
})

const $appContent: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  alignItems: "center",
  flex: 1,
  gap: spacing.sm,
})

const $appIcon: ThemedStyle<ViewStyle> = () => ({
  width: 48,
  height: 48,
})

const $appInfo: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  justifyContent: "center",
  marginRight: spacing.lg,
  paddingRight: spacing.sm,
})

const $appName: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 16,
  color: colors.text,
  marginBottom: 2,
})

const $rightControls: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
})

const $offlineApp: ThemedStyle<TextStyle> = ({colors}) => ({
  textDecorationLine: "line-through",
  color: colors.textDim,
})

const $offlineRow: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
  marginTop: 2,
})

const $offlineText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 12,
  color: colors.error,
})

const $tipContainer: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  marginHorizontal: spacing.lg,
  paddingVertical: spacing.md,
  paddingHorizontal: spacing.md,
  backgroundColor: colors.background,
  borderRadius: spacing.sm,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  borderWidth: 1,
  borderColor: colors.border,
})

const $tipContent: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  gap: spacing.xs,
})

const $tipText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 15,
  fontWeight: "500",
  color: colors.text,
})

const $tipSubtext: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 13,
  color: colors.textDim,
})

const $gearButton: ThemedStyle<ViewStyle> = ({spacing}) => ({
  padding: spacing.xs,
})

const $emptyContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  alignItems: "center",
  justifyContent: "center",
  paddingVertical: spacing.xxxl,
})

const $emptyText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 15,
  color: colors.textDim,
  textAlign: "center",
})

const $getMoreAppsSubtext: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 12,
  color: colors.textDim,
  marginTop: 2,
})

const $incompatibleAppIcon: ThemedStyle<ViewStyle> = () => ({
  width: 48,
  height: 48,
  opacity: 0.4,
})

const $incompatibleAppName: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 16,
  color: colors.textDim,
})
