import React, {useState, useCallback, useMemo} from "react"
import {View, FlatList, TouchableOpacity, Alert, Dimensions, ActivityIndicator} from "react-native"

import {Text} from "@/components/ignite"
import AppIcon from "@/components/misc/AppIcon"
import {useNewUiForegroundApps, useNewUiActiveForegroundApp} from "@/hooks/useNewUiFilteredApps"
import {useAppStatus} from "@/contexts/AppletStatusProvider"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {useAppTheme} from "@/utils/useAppTheme"
import {AppletInterface} from "@/types/AppletInterface"
import restComms from "@/managers/RestComms"
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons"
import showAlert from "@/utils/AlertUtils"

const GRID_COLUMNS = 4
const SCREEN_WIDTH = Dimensions.get("window").width

export const NewUiForegroundAppsGrid: React.FC = () => {
  const {themed, theme} = useAppTheme()
  const {push} = useNavigationHistory()
  const foregroundApps = useNewUiForegroundApps()
  const activeForegroundApp = useNewUiActiveForegroundApp()
  const {optimisticallyStartApp, optimisticallyStopApp, clearPendingOperation, refreshAppStatus} = useAppStatus()
  const [isLoading, setIsLoading] = useState(false)

  // Filter out the currently active app from the grid
  const inactiveApps = useMemo(() => {
    return foregroundApps.filter(app => !app.is_running)
  }, [foregroundApps])

  const handleAppPress = useCallback(
    async (app: AppletInterface) => {
      // Check if app is offline
      if (app.isOnline === false) {
        const developerName = (" " + (app.developerName || "") + " ").replace("  ", " ")
        Alert.alert(
          "App is down for maintenance",
          `${app.name} appears to be offline. You can try anyway.\n\nThe developer${developerName}needs to get their server back up and running. Please contact them for more details.`,
          [
            {text: "Cancel", style: "cancel"},
            {
              text: "Try Anyway",
              onPress: () => startApp(app.packageName),
            },
          ],
          {cancelable: true},
        )
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
        await startApp(app.packageName)
      }
    },
    [activeForegroundApp],
  )

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

  const renderItem = useCallback(
    ({item}: {item: AppletInterface}) => {
      const isOffline = item.isOnline === false

      return (
        <TouchableOpacity
          style={themed($gridItem)}
          onPress={() => handleAppPress(item)}
          activeOpacity={0.7}
          disabled={isLoading}>
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
    [themed, theme, handleAppPress, isLoading],
  )

  if (inactiveApps.length === 0) {
    return (
      <View style={themed($emptyContainer)}>
        <Text style={themed($emptyText)}>No foreground apps available</Text>
      </View>
    )
  }

  if (isLoading) {
    return (
      <View style={themed($loadingContainer)}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    )
  }

  return (
    <View style={themed($container)}>
      <FlatList
        data={inactiveApps}
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
})

const $appNameOffline = theme => ({
  fontSize: 12,
  color: theme.colors.textDim,
  textAlign: "center",
  marginTop: theme.spacing.xxs,
  textDecorationLine: "line-through",
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
})

const $loadingContainer = theme => ({
  flex: 1,
  alignItems: "center",
  justifyContent: "center",
  paddingVertical: theme.spacing.xxl,
})
