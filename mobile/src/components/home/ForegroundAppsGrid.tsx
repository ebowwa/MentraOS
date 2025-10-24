import {useCallback, useMemo} from "react"
import {FlatList, TextStyle, TouchableOpacity, View, ViewStyle} from "react-native"

import {Text} from "@/components/ignite"
import AppIcon from "@/components/misc/AppIcon"
import {GetMoreAppsIcon} from "@/components/misc/GetMoreAppsIcon"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {
  ClientAppletInterface,
  DUMMY_APPLET,
  useActiveForegroundApp,
  useInactiveForegroundApps,
  useStartApplet,
} from "@/stores/applets"
import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"

const GRID_COLUMNS = 4

// Special type for the Get More Apps item
interface GridItem extends ClientAppletInterface {
  isGetMoreApps?: boolean
}

export const ForegroundAppsGrid: React.FC = () => {
  const {themed, theme} = useAppTheme()
  const {push} = useNavigationHistory()
  const foregroundApps = useInactiveForegroundApps()
  const activeForegroundApp = useActiveForegroundApp()
  const startApplet = useStartApplet()

  // const {optimisticallyStartApp, optimisticallyStopApp, clearPendingOperation, refreshAppStatus} = useAppStatus()

  // // Prepare grid data with placeholders and "Get More Apps"
  // const startApp = useCallback(
  //   async (packageName: string) => {
  //     console.log("startApp called for:", packageName)
  //     // When switching apps, the app might not be in the current filtered list
  //     // So we need to check both foregroundApps and pass the app through from handleAppPress
  //     let app = foregroundApps.find(a => a.packageName === packageName)

  //     // If not found in foregroundApps, it might be passed as a parameter (when switching)
  //     // For now, we'll create a minimal app object if not found
  //     if (!app) {
  //       console.log("App not in current foreground list, starting without health check:", packageName)
  //       startApp(packageName)
  //       try {
  //         await restComms.startApp(packageName)
  //       } catch (error) {
  //         // refreshAppStatus()
  //         console.error("Start app error:", error)
  //       }
  //       return
  //     }

  //     // Handle offline apps - activate only (no server communication needed)
  //     if (isOfflineApp(app)) {
  //       console.log("Starting offline app in ForegroundAppsGrid:", packageName)
  //       optimisticallyStartApp(packageName, app.type)
  //       return
  //     }

  //     // First check permissions for the app
  //     const permissionResult = await askPermissionsUI(app, theme)
  //     if (permissionResult === -1) {
  //       // User cancelled
  //       return
  //     } else if (permissionResult === 0) {
  //       // Permissions failed, retry
  //       await startApp(packageName)
  //       return
  //     }

  //     // If app is marked as online by backend, start optimistically immediately
  //     // We'll do health check in background to verify
  //     if (app.isOnline !== false) {
  //       console.log("App is online, starting optimistically:", packageName)
  //       optimisticallyStartApp(packageName)

  //       // Do health check in background
  //       performHealthCheckFlow({
  //         app,
  //         onStartApp: async () => {
  //           // App already started optimistically, just make the server call
  //           try {
  //             await restComms.startApp(packageName)
  //             clearPendingOperation(packageName)
  //           } catch (error) {
  //             refreshAppStatus()
  //             console.error("Start app error:", error)
  //           }
  //         },
  //         onAppUninstalled: async () => {
  //           await refreshAppStatus()
  //         },
  //         onHealthCheckFailed: async () => {
  //           // Health check failed, move app back to inactive
  //           console.log("Health check failed, reverting app to inactive:", packageName)
  //           optimisticallyStopApp(packageName)
  //           refreshAppStatus()
  //         },
  //         optimisticallyStopApp,
  //         clearPendingOperation,
  //       })
  //     } else {
  //       // App is explicitly offline, use normal flow with health check first
  //       await performHealthCheckFlow({
  //         app,
  //         onStartApp: async () => {
  //           optimisticallyStartApp(packageName)
  //           try {
  //             await restComms.startApp(packageName)
  //             clearPendingOperation(packageName)
  //           } catch (error) {
  //             refreshAppStatus()
  //             console.error("Start app error:", error)
  //           }
  //         },
  //         onAppUninstalled: async () => {
  //           await refreshAppStatus()
  //         },
  //         optimisticallyStopApp,
  //         clearPendingOperation,
  //       })
  //     }
  //   },
  //   [foregroundApps, optimisticallyStartApp, optimisticallyStopApp, clearPendingOperation, refreshAppStatus, theme],
  // )

  // const stopApp = useCallback(
  //   async (packageName: string) => {
  //     optimisticallyStopApp(packageName)

  //     // Skip offline apps - they don't need server communication
  //     const appToStop = foregroundApps.find(a => a.packageName === packageName)
  //     if (appToStop && isOfflineApp(appToStop)) {
  //       console.log("Skipping offline app stop in ForegroundAppsGrid:", packageName)
  //       clearPendingOperation(packageName)
  //       return
  //     }

  //     try {
  //       await restComms.stopApp(packageName)
  //       clearPendingOperation(packageName)
  //     } catch (error) {
  //       refreshAppStatus()
  //       console.error("Stop app error:", error)
  //     }
  //   },
  //   [foregroundApps, optimisticallyStopApp, clearPendingOperation, refreshAppStatus],
  // )

  const gridData = useMemo(() => {
    // Filter out incompatible apps and running apps
    const inactiveApps = foregroundApps.filter(app => {
      // Exclude running apps
      if (app.running) return false
      if (!app.compatibility?.isCompatible) return false
      return true
    })

    // Sort to put Camera app first, then alphabetical
    inactiveApps.sort((a, b) => {
      // Camera app always comes first
      if (a.packageName === "com.mentra.camera") return -1
      if (b.packageName === "com.mentra.camera") return 1

      // Otherwise sort alphabetically
      return a.name.localeCompare(b.name)
    })

    // Add "Get More Apps" as the last item
    const appsWithGetMore = [
      ...inactiveApps,
      {
        packageName: "get-more-apps",
        name: "Get More Apps",
        type: "standard",
        isGetMoreApps: true,
        logoUrl: "",
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
      paddedApps.push(DUMMY_APPLET)
    }

    return paddedApps
  }, [foregroundApps])

  const handleAppPress = useCallback(
    async (app: GridItem) => {
      console.log("App pressed:", app.packageName, "isGetMoreApps:", app.isGetMoreApps)

      // Handle "Get More Apps" specially
      if (app.isGetMoreApps) {
        push("/store")
        return
      }

      // // Check if there's already an active foreground app and automatically switch
      // // This applies to both online and offline apps
      // if (activeForegroundApp && app.packageName !== activeForegroundApp.packageName) {
      //   console.log("Switching from", activeForegroundApp.packageName, "to", app.packageName)
      //   await stopApplet(activeForegroundApp.packageName)
      // }

      // Now start the new app (offline or online)
      await startApplet(app.packageName)
    },
    [activeForegroundApp, push],
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

      // const isOfflineAppItem = isOfflineApp(item)

      return (
        <TouchableOpacity style={themed($gridItem)} onPress={() => handleAppPress(item)} activeOpacity={0.7}>
          <View style={themed($appContainer)}>
            <AppIcon app={item as any} style={themed($appIcon)} />
          </View>
          <Text
            text={item.name}
            style={themed(!item.healthy ? $appNameOffline : $appName)}
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
        <TouchableOpacity style={themed($getMoreAppsButton)} onPress={() => push("/store")} activeOpacity={0.7}>
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

const $container: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  marginTop: spacing.sm,
})

const $gridContent: ThemedStyle<ViewStyle> = ({spacing}) => ({
  paddingBottom: spacing.md,
})

const $gridItem: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  alignItems: "center",
  marginVertical: spacing.sm,
  paddingHorizontal: spacing.xs,
})

const $appContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  position: "relative",
  width: 64,
  height: 64,
  marginBottom: spacing.xs,
})

const $appIcon: ThemedStyle<ViewStyle> = () => ({
  width: 64,
  height: 64,
  // borderRadius is handled by AppIcon component based on squircle settings
})

const $appName: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 12,
  color: colors.text,
  textAlign: "center",
  marginTop: spacing.xxs,
  lineHeight: 14,
})

const $appNameOffline: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 12,
  color: colors.textDim,
  textAlign: "center",
  marginTop: spacing.xxs,
  textDecorationLine: "line-through",
  lineHeight: 14,
})

const $emptyText: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 15,
  color: colors.textDim,
  textAlign: "center",
  marginBottom: spacing.lg,
})

const $getMoreAppsButton: ThemedStyle<ViewStyle> = ({spacing}) => ({
  alignItems: "center",
  marginTop: spacing.md,
})
