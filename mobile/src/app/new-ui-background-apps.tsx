import React, {useState, useCallback, useMemo} from "react"
import {View, ScrollView, TouchableOpacity, ActivityIndicator} from "react-native"
import {useRouter} from "expo-router"
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons"

import {Header, Screen, Text, Switch} from "@/components/ignite"
import AppIcon from "@/components/misc/AppIcon"
import ChevronRight from "assets/icons/component/ChevronRight"
import {GetMoreAppsIcon} from "@/components/misc/GetMoreAppsIcon"
import {useNewUiBackgroundApps} from "@/hooks/useNewUiFilteredApps"
import {useAppStatus} from "@/contexts/AppletStatusProvider"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {useAppTheme} from "@/utils/useAppTheme"
import {AppletInterface} from "@/types/AppletInterface"
import restComms from "@/managers/RestComms"
import Divider from "@/components/misc/Divider"
import {Spacer} from "@/components/misc/Spacer"

export default function NewUiBackgroundAppsScreen() {
  const {themed, theme} = useAppTheme()
  const router = useRouter()
  const {push} = useNavigationHistory()
  const backgroundApps = useNewUiBackgroundApps()
  const {optimisticallyStartApp, optimisticallyStopApp, clearPendingOperation, refreshAppStatus} = useAppStatus()
  const [isLoading, setIsLoading] = useState(false)

  // Separate active and inactive apps
  const {activeApps, inactiveApps} = useMemo(() => {
    const active = backgroundApps.filter(app => app.is_running)
    const inactive = backgroundApps.filter(app => !app.is_running)
    return {activeApps: active, inactiveApps: inactive}
  }, [backgroundApps])

  const handleBack = () => {
    router.back()
  }

  const toggleApp = async (app: AppletInterface) => {
    if (app.is_running) {
      await stopApp(app.packageName)
    } else {
      await startApp(app.packageName)
    }
  }

  const startApp = async (packageName: string) => {
    setIsLoading(true)
    optimisticallyStartApp(packageName)

    try {
      await restComms.startApp(packageName)
      clearPendingOperation(packageName)
    } catch (error) {
      refreshAppStatus()
      console.error("Start app error:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const stopApp = async (packageName: string) => {
    setIsLoading(true)
    optimisticallyStopApp(packageName)

    try {
      await restComms.stopApp(packageName)
      clearPendingOperation(packageName)
    } catch (error) {
      refreshAppStatus()
      console.error("Stop app error:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const openAppSettings = (app: AppletInterface) => {
    push("/applet/settings", {
      packageName: app.packageName,
      appName: app.name,
    })
  }

  const renderAppItem = (app: AppletInterface, index: number, isLast: boolean) => {
    const handleRowPress = () => {
      if (app.is_running) {
        openAppSettings(app)
      }
    }

    return (
      <React.Fragment key={app.packageName}>
        <TouchableOpacity
          style={themed($appRow)}
          onPress={handleRowPress}
          activeOpacity={app.is_running ? 0.7 : 1}
          disabled={!app.is_running}>
          <View style={themed($appContent)}>
            <AppIcon app={app as any} style={themed($appIcon)} />
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
                disabled={isLoading}
                pointerEvents="none"
              />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
        {!isLast && <Divider />}
      </React.Fragment>
    )
  }

  return (
    <Screen preset="fixed" style={themed($screen)}>
      <Header leftIcon="back" onLeftPress={handleBack} title="Background Apps" />

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
            {/* Active Background Apps Section */}
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
                  <View style={themed($animatedToggle)}>
                    <View style={themed($toggleBar)} />
                    <View style={themed($toggleCircle)} />
                  </View>
                </View>
                <Spacer height={theme.spacing.lg} />
              </>
            )}

            {/* Inactive Background Apps Section */}
            {inactiveApps.length > 0 && (
              <>
                <Text style={themed($sectionHeader)}>Inactive Background Apps</Text>
                <View style={themed($sectionContent)}>
                  {inactiveApps.map((app, index) => renderAppItem(app, index, false))}
                  {/* Get More Apps item */}
                  <TouchableOpacity style={themed($appRow)} onPress={() => router.push("/store")} activeOpacity={0.7}>
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
          </>
        )}

        <Spacer height={theme.spacing.xxl} />
      </ScrollView>

      {isLoading && (
        <View style={themed($loadingOverlay)}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      )}
    </Screen>
  )
}

const $screen = theme => ({
  flex: 1,
  backgroundColor: theme.colors.background,
})

const $headerInfo = theme => ({
  paddingHorizontal: theme.spacing.md,
  paddingVertical: theme.spacing.sm,
  backgroundColor: theme.colors.surface,
  borderBottomWidth: 1,
  borderBottomColor: theme.colors.border,
})

const $headerText = theme => ({
  fontSize: 14,
  color: theme.colors.textDim,
  textAlign: "center",
})

const $scrollView = theme => ({
  flex: 1,
})

const $scrollViewContent = theme => ({
  paddingTop: theme.spacing.md,
})

const $sectionHeader = theme => ({
  fontSize: 14,
  fontWeight: "600",
  color: theme.colors.textDim,
  marginBottom: theme.spacing.xs,
  paddingHorizontal: theme.spacing.md,
  textTransform: "uppercase",
  letterSpacing: 0.5,
})

const $sectionContent = theme => ({
  paddingHorizontal: theme.spacing.md,
})

const $appRow = theme => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  paddingVertical: theme.spacing.sm,
  minHeight: 80,
})

const $appContent = theme => ({
  flexDirection: "row",
  alignItems: "center",
  flex: 1,
  gap: theme.spacing.sm,
})

const $appIcon = theme => ({
  width: 56,
  height: 56,
})

const $appInfo = theme => ({
  flex: 1,
  justifyContent: "center",
  marginRight: theme.spacing.lg,
  paddingRight: theme.spacing.sm,
})

const $appName = theme => ({
  fontSize: 16,
  color: theme.colors.text,
  marginBottom: 2,
})

const $rightControls = theme => ({
  flexDirection: "row",
  alignItems: "center",
  gap: theme.spacing.sm,
})

const $offlineApp = theme => ({
  textDecorationLine: "line-through",
  color: theme.colors.textDim,
})

const $offlineRow = theme => ({
  flexDirection: "row",
  alignItems: "center",
  gap: 4,
  marginTop: 2,
})

const $offlineText = theme => ({
  fontSize: 12,
  color: theme.colors.error,
})

const $tipContainer = theme => ({
  marginHorizontal: theme.spacing.md,
  paddingVertical: theme.spacing.md,
  paddingHorizontal: theme.spacing.md,
  backgroundColor: theme.colors.palette.neutral100,
  borderRadius: theme.spacing.sm,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  borderWidth: 1,
  borderColor: theme.colors.border,
})

const $tipContent = theme => ({
  flex: 1,
  gap: 4,
})

const $tipText = theme => ({
  fontSize: 15,
  fontWeight: "500",
  color: theme.colors.text,
})

const $tipSubtext = theme => ({
  fontSize: 13,
  color: theme.colors.textDim,
})

const $animatedToggle = theme => ({
  width: 32,
  height: 16,
  position: "relative",
})

const $toggleBar = theme => ({
  height: 16,
  width: 32,
  borderRadius: 16,
  backgroundColor: theme.colors.switchTrackOff,
  borderColor: theme.colors.switchBorder,
  borderWidth: theme.colors.switchBorderWidth,
  position: "absolute",
})

const $toggleCircle = theme => ({
  width: 24,
  height: 24,
  top: -4,
  left: -4,
  borderRadius: 12,
  backgroundColor: theme.colors.switchThumbOff,
  position: "absolute",
  borderColor: theme.colors.switchBorder,
  borderWidth: theme.colors.switchBorderWidth,
})

const $gearButton = theme => ({
  padding: theme.spacing.xs,
})

const $emptyContainer = theme => ({
  flex: 1,
  alignItems: "center",
  justifyContent: "center",
  paddingVertical: theme.spacing.xxxl,
})

const $emptyText = theme => ({
  fontSize: 15,
  color: theme.colors.textDim,
  textAlign: "center",
})

const $loadingOverlay = theme => ({
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: "rgba(0, 0, 0, 0.3)",
  alignItems: "center",
  justifyContent: "center",
})

const $getMoreAppsSubtext = theme => ({
  fontSize: 12,
  color: theme.colors.textDim,
  marginTop: 2,
})
