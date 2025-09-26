import React, {useState, useCallback, useMemo} from "react"
import {View, FlatList, TouchableOpacity, Alert, Dimensions, ActivityIndicator} from "react-native"
import {useRouter} from "expo-router"

import {Text} from "@/components/ignite"
import AppIcon from "@/components/misc/AppIcon"
import {GetMoreAppsIcon} from "@/components/misc/GetMoreAppsIcon"
import {useNewUiForegroundApps, useNewUiActiveForegroundApp} from "@/hooks/useNewUiFilteredApps"
import {useAppStatus} from "@/contexts/AppletStatusProvider"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {useAppTheme} from "@/utils/useAppTheme"
import {AppletInterface} from "@/types/AppletInterface"
import restComms from "@/managers/RestComms"
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons"
import showAlert from "@/utils/AlertUtils"
import {performHealthCheckFlow} from "@/utils/healthCheckFlow"
import {askPermissionsUI} from "@/utils/PermissionsUtils"

const GRID_COLUMNS = 4
const SCREEN_WIDTH = Dimensions.get("window").width

// Special type for the Get More Apps item
interface GridItem extends AppletInterface {
  isGetMoreApps?: boolean
}

export const NewUiForegroundAppsGrid: React.FC = () => {
  const {themed, theme} = useAppTheme()
  const {push} = useNavigationHistory()
  const router = useRouter()
  const foregroundApps = useNewUiForegroundApps()
  const activeForegroundApp = useNewUiActiveForegroundApp()
  const {optimisticallyStartApp, optimisticallyStopApp, clearPendingOperation, refreshAppStatus} = useAppStatus()

  // Prepare grid data with placeholders and "Get More Apps"
  const startApp = useCallback(
    async (packageName: string) => {
      console.log("startApp called for:", packageName)
      // When switching apps, the app might not be in the current filtered list
      // So we need to check both foregroundApps and pass the app through from handleAppPress
      let app = foregroundApps.find(a => a.packageName === packageName)

      // If not found in foregroundApps, it might be passed as a parameter (when switching)
      // For now, we'll create a minimal app object if not found
      if (!app) {
        console.log("App not in current foreground list, starting without health check:", packageName)
        optimisticallyStartApp(packageName)
        try {
          await restComms.startApp(packageName)
          clearPendingOperation(packageName)
        } catch (error) {
          refreshAppStatus()
          console.error("Start app error:", error)
        }
        return
      }

      // First check permissions for the app
      const permissionResult = await askPermissionsUI(app, theme)
      if (permissionResult === -1) {
        // User cancelled
        return
      } else if (permissionResult === 0) {
        // Permissions failed, retry
        await startApp(packageName)
        return
      }

      // If app is marked as online by backend, start optimistically immediately
      // We'll do health check in background to verify
      if (app.isOnline !== false) {
        console.log("App is online, starting optimistically:", packageName)
        optimisticallyStartApp(packageName)

        // Do health check in background
        performHealthCheckFlow({
          app,
          onStartApp: async () => {
            // App already started optimistically, just make the server call
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
            // Health check failed, move app back to inactive
            console.log("Health check failed, reverting app to inactive:", packageName)
            optimisticallyStopApp(packageName)
            refreshAppStatus()
          },
          optimisticallyStopApp,
          clearPendingOperation,
        })
      } else {
        // App is explicitly offline, use normal flow with health check first
        const shouldStart = await performHealthCheckFlow({
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
    },
    [foregroundApps, optimisticallyStartApp, optimisticallyStopApp, clearPendingOperation, refreshAppStatus, theme],
  )

  const stopApp = useCallback(
    async (packageName: string) => {
      optimisticallyStopApp(packageName)

      try {
        await restComms.stopApp(packageName)
        clearPendingOperation(packageName)
      } catch (error) {
        refreshAppStatus()
        console.error("Stop app error:", error)
      }
    },
    [optimisticallyStopApp, clearPendingOperation, refreshAppStatus],
  )

  const gridData = useMemo(() => {
    // Filter out incompatible apps and running apps
    const inactiveApps = foregroundApps.filter(app => {
      // Exclude running apps
      if (app.is_running) return false

      // Exclude incompatible apps
      if (app.compatibility && !app.compatibility.isCompatible) return false

      return true
    })

    // Add "Get More Apps" as the last item
    const appsWithGetMore = [
      ...inactiveApps,
      {
        packageName: "get-more-apps",
        name: "Get More Apps",
        type: "standard",
        isGetMoreApps: true,
        logoURL: "",
        permissions: [],
      } as GridItem,
    ]

    // Calculate how many empty placeholders we need to fill the last row
    const totalItems = appsWithGetMore.length
    const remainder = totalItems % GRID_COLUMNS
    const emptySlots = remainder === 0 ? 0 : GRID_COLUMNS - remainder

    // Add empty placeholders to align items to the left
    const paddedApps = [...appsWithGetMore]
    for (let i = 0; i < emptySlots; i++) {
      paddedApps.push({
        packageName: `empty-${i}`,
        name: "",
        type: "standard",
        logoURL: "",
        permissions: [],
      } as GridItem)
    }

    return paddedApps
  }, [foregroundApps])

  const handleAppPress = useCallback(
    async (app: GridItem) => {
      console.log("App pressed:", app.packageName, "isGetMoreApps:", app.isGetMoreApps)
      // Handle "Get More Apps" specially
      if (app.isGetMoreApps) {
        router.push("/store")
        return
      }

      // Check if there's already an active foreground app
      if (activeForegroundApp) {
        showAlert(
          "Only One Foreground App",
          "There can only be one foreground app active at a time. Would you like to stop the current app and start this one?",
          [
            {text: "Cancel", style: "cancel"},
            {
              text: "Switch Apps",
              onPress: async () => {
                await stopApp(activeForegroundApp.packageName)
                await startApp(app.packageName)
              },
            },
          ],
          {cancelable: true},
        )
      } else {
        // No active app, just start this one
        console.log("Starting app directly:", app.packageName)
        await startApp(app.packageName)
      }
    },
    [activeForegroundApp, router, startApp, stopApp],
  )

  const renderItem = useCallback(
    ({item}: {item: GridItem}) => {
      // Don't render empty placeholders
      if (!item.name && !item.isGetMoreApps) {
        return <View style={themed($gridItem)} />
      }

      // Render "Get More Apps" item
      if (item.isGetMoreApps) {
        return (
          <TouchableOpacity style={themed($gridItem)} onPress={() => handleAppPress(item)} activeOpacity={0.7}>
            <GetMoreAppsIcon size="large" style={{marginBottom: theme.spacing.xs}} />
            <Text text={item.name} style={themed($appName)} numberOfLines={2} />
          </TouchableOpacity>
        )
      }

      const isOffline = item.isOnline === false

      return (
        <TouchableOpacity style={themed($gridItem)} onPress={() => handleAppPress(item)} activeOpacity={0.7}>
          <View style={themed($appContainer)}>
            <AppIcon app={item as any} style={themed($appIcon)} />
            {isOffline && (
              <View style={themed($offlineBadge)}>
                <MaterialCommunityIcons name="alert-circle" size={14} color={theme.colors.error} />
              </View>
            )}
          </View>
          <Text
            text={item.name}
            style={themed(isOffline ? $appNameOffline : $appName)}
            numberOfLines={item.name.split(" ").length > 1 ? 2 : 1}
          />
        </TouchableOpacity>
      )
    },
    [themed, theme, handleAppPress],
  )

  if (foregroundApps.length === 0) {
    // Still show "Get More Apps" even when no apps
    return (
      <View style={themed($container)}>
        <Text style={themed($emptyText)}>No foreground apps available</Text>
        <TouchableOpacity style={themed($getMoreAppsButton)} onPress={() => router.push("/store")} activeOpacity={0.7}>
          <GetMoreAppsIcon size="large" style={{marginBottom: theme.spacing.xs}} />
          <Text text="Get More Apps" style={themed($appName)} />
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={themed($container)}>
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
  flex: 1,
  marginTop: theme.spacing.sm,
})

const $gridContent = theme => ({
  paddingBottom: theme.spacing.md,
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
})

const $appName = theme => ({
  fontSize: 12,
  color: theme.colors.text,
  textAlign: "center",
  marginTop: theme.spacing.xxs,
  lineHeight: 14,
})

const $appNameOffline = theme => ({
  fontSize: 12,
  color: theme.colors.textDim,
  textAlign: "center",
  marginTop: theme.spacing.xxs,
  textDecorationLine: "line-through",
  lineHeight: 14,
})

const $offlineBadge = theme => ({
  position: "absolute",
  top: -4,
  right: -4,
  backgroundColor: theme.colors.background,
  borderRadius: 10,
  padding: 2,
})

const $emptyContainer = theme => ({
  flex: 1,
  alignItems: "center",
  justifyContent: "center",
  paddingVertical: theme.spacing.xxl,
})

const $emptyText = theme => ({
  fontSize: 15,
  color: theme.colors.textDim,
  textAlign: "center",
  marginBottom: theme.spacing.lg,
})

const $getMoreAppsButton = theme => ({
  alignItems: "center",
  marginTop: theme.spacing.md,
})
