// YourAppsList.tsx
import React, {useEffect, useRef, useState} from "react"
import {View, TouchableOpacity, Animated as RNAnimated, Platform, ViewStyle, TextStyle, Keyboard} from "react-native"
import {Text} from "@/components/ignite"
import {useStatus} from "@/contexts/AugmentOSStatusProvider"
import BackendServerComms from "@/backend_comms/BackendServerComms"
import {loadSetting, saveSetting} from "@/utils/SettingsHelper"
import {SETTINGS_KEYS} from "@/consts"
import {useFocusEffect} from "@react-navigation/native"
import {AppInterface, AppPermission, useAppStatus} from "@/contexts/AppStatusProvider"
import {requestFeaturePermissions} from "@/utils/PermissionsUtils"
import {checkFeaturePermissions} from "@/utils/PermissionsUtils"
import {PermissionFeatures} from "@/utils/PermissionsUtils"
import showAlert from "@/utils/AlertUtils"
import {PERMISSION_CONFIG} from "@/utils/PermissionsUtils"
import {translate} from "@/i18n"
import {useAppTheme} from "@/utils/useAppTheme"
import {router} from "expo-router"
import {AppListItem} from "./AppListItem"
import {Spacer} from "./Spacer"
import Divider from "./Divider"
import {ThemedStyle} from "@/theme"
import {TreeIcon} from "assets/icons/component/TreeIcon"
import AppsHeader from "./AppsHeader"
import {
  checkAndRequestNotificationAccessSpecialPermission,
  checkNotificationAccessSpecialPermission,
} from "@/utils/NotificationServiceUtils"
import {AppListStoreLink} from "./AppListStoreLink"
// import DraggableFlatList, {RenderItemParams, ScaleDecorator} from "react-native-draggable-flatlist"
import Animated, {
  EntryExitTransition,
  FadingTransition,
  JumpingTransition,
  LinearTransition,
} from "react-native-reanimated"

// Add a new settings key for app order
const APP_ORDER_KEY = "APP_ORDER_PREFERENCE"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"

export default function InactiveAppList({
  isSearchPage = false,
  searchQuery,
  liveCaptionsRef,
  onClearSearch,
}: {
  isSearchPage?: boolean
  searchQuery?: string
  liveCaptionsRef?: React.RefObject<any>
  onClearSearch?: () => void
}) {
  const {
    appStatus,
    refreshAppStatus,
    optimisticallyStartApp,
    optimisticallyStopApp,
    clearPendingOperation,
    isSensingEnabled,
  } = useAppStatus()
  const {status} = useStatus()
  const [onboardingModalVisible, setOnboardingModalVisible] = useState(false)
  const [onboardingCompleted, setOnboardingCompleted] = useState(true)
  const [inLiveCaptionsPhase, setInLiveCaptionsPhase] = useState(false)
  const [showSettingsHint, setShowSettingsHint] = useState(false)
  const [showOnboardingTip, setShowOnboardingTip] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [savedAppOrder, setSavedAppOrder] = useState<string[]>([])
  const {themed, theme} = useAppTheme()
  const {push} = useNavigationHistory()

  // Static values instead of animations
  const bounceAnim = React.useRef(new RNAnimated.Value(0)).current
  const pulseAnim = React.useRef(new RNAnimated.Value(0)).current

  const [containerWidth, setContainerWidth] = React.useState(0)

  // Reference for the Live Captions list item (use provided ref or create new one)
  const internalLiveCaptionsRef = useRef<any>(null)
  const actualLiveCaptionsRef = liveCaptionsRef || internalLiveCaptionsRef

  // Constants for grid item sizing
  const GRID_MARGIN = 6 // Total horizontal margin per item (left + right)
  const numColumns = 4 // Desired number of columns

  // Calculate the item width based on container width and margins
  const itemWidth = containerWidth > 0 ? (containerWidth - GRID_MARGIN * numColumns) / numColumns : 0

  const textColor = theme.isDark ? "#FFFFFF" : "#000000"

  const backendComms = BackendServerComms.getInstance()

  // Load saved app order on mount
  useEffect(() => {
    const loadAppOrder = async () => {
      const order = await loadSetting(APP_ORDER_KEY, [])
      setSavedAppOrder(order)
    }
    loadAppOrder()
  }, [])

  // Save app order when it changes
  const saveAppOrder = async (apps: AppInterface[]) => {
    const order = apps.map(app => app.packageName)
    await saveSetting(APP_ORDER_KEY, order)
    setSavedAppOrder(order)
  }

  // Check onboarding status whenever the screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      const checkOnboardingStatus = async () => {
        const completed = await loadSetting(SETTINGS_KEYS.ONBOARDING_COMPLETED, true)
        setOnboardingCompleted(completed)

        if (!completed) {
          setOnboardingModalVisible(true)
          setShowSettingsHint(false) // Hide settings hint during onboarding
          setShowOnboardingTip(true)
        } else {
          setShowOnboardingTip(false)

          // If onboarding is completed, check how many times settings have been accessed
          const settingsAccessCount = await loadSetting(SETTINGS_KEYS.SETTINGS_ACCESS_COUNT, 0)
          // Only show hint if they've accessed settings less than 1 times
          setShowSettingsHint(settingsAccessCount < 1)
        }
      }

      checkOnboardingStatus()
    }, []),
  )

  // Check if onboarding is completed on initial load
  useEffect(() => {
    const checkOnboardingStatus = async () => {
      const completed = await loadSetting(SETTINGS_KEYS.ONBOARDING_COMPLETED, true)
      setOnboardingCompleted(completed)
      setShowOnboardingTip(!completed)
    }

    checkOnboardingStatus()
  }, [])

  // Set static values instead of animations
  useEffect(() => {
    if (showOnboardingTip) {
      // Set static values instead of animating
      bounceAnim.setValue(0)
      pulseAnim.setValue(0.5)
    } else {
      bounceAnim.setValue(0)
      pulseAnim.setValue(0)
    }
  }, [showOnboardingTip])

  const completeOnboarding = () => {
    saveSetting(SETTINGS_KEYS.ONBOARDING_COMPLETED, true)
    setOnboardingCompleted(true)
    setShowOnboardingTip(false)
    setInLiveCaptionsPhase(false) // Reset any live captions phase state

    // Make sure to post an update to ensure all components re-render
    // This is important to immediately hide any UI elements that depend on these states
    setTimeout(() => {
      // Force a re-render by setting state again
      setShowOnboardingTip(false)
      setShowSettingsHint(true)
    }, 100)
  }

  const checkPermissions = async (app: AppInterface) => {
    let permissions = app.permissions || []
    const neededPermissions: string[] = []

    if (permissions.length == 1 && permissions[0].type == "ALL") {
      permissions = [
        {type: "MICROPHONE", required: true},
        {type: "CALENDAR", required: true},
        {type: "POST_NOTIFICATIONS", required: true},
        {type: "READ_NOTIFICATIONS", required: true},
        {type: "LOCATION", required: true},
        {type: "BACKGROUND_LOCATION", required: true},
      ] as AppPermission[]
    }

    if (app.packageName == "cloud.augmentos.notify") {
      permissions.push({type: "READ_NOTIFICATIONS", required: true, description: "Read notifications"})
    }

    for (const permission of permissions) {
      if (!(permission["required"] ?? true)) {
        continue
      }
      switch (permission.type) {
        case "MICROPHONE":
          const hasMicrophone = await checkFeaturePermissions(PermissionFeatures.MICROPHONE)
          if (!hasMicrophone) {
            neededPermissions.push(PermissionFeatures.MICROPHONE)
          }
          break
        case "CAMERA":
          const hasCamera = await checkFeaturePermissions(PermissionFeatures.CAMERA)
          if (!hasCamera) {
            neededPermissions.push(PermissionFeatures.CAMERA)
          }
          break
        case "CALENDAR":
          const hasCalendar = await checkFeaturePermissions(PermissionFeatures.CALENDAR)
          if (!hasCalendar) {
            neededPermissions.push(PermissionFeatures.CALENDAR)
          }
          break
        case "LOCATION":
          const hasLocation = await checkFeaturePermissions(PermissionFeatures.LOCATION)
          if (!hasLocation) {
            neededPermissions.push(PermissionFeatures.LOCATION)
          }
          break
        case "BACKGROUND_LOCATION":
          const hasBackgroundLocation = await checkFeaturePermissions(PermissionFeatures.BACKGROUND_LOCATION)
          if (!hasBackgroundLocation) {
            neededPermissions.push(PermissionFeatures.BACKGROUND_LOCATION)
          }
          break
        case "POST_NOTIFICATIONS":
          const hasNotificationPermission = await checkFeaturePermissions(PermissionFeatures.POST_NOTIFICATIONS)
          if (!hasNotificationPermission) {
            neededPermissions.push(PermissionFeatures.POST_NOTIFICATIONS)
          }
          break
        case "READ_NOTIFICATIONS":
          if (Platform.OS == "ios") {
            break
          }
          const hasNotificationAccess = await checkNotificationAccessSpecialPermission()
          if (!hasNotificationAccess) {
            neededPermissions.push(PermissionFeatures.READ_NOTIFICATIONS)
          }
          break
      }
    }

    return neededPermissions
  }

  const requestPermissions = async (permissions: string[]) => {
    for (const permission of permissions) {
      await requestFeaturePermissions(permission)
    }

    if (permissions.includes(PermissionFeatures.READ_NOTIFICATIONS) && Platform.OS === "android") {
      await checkAndRequestNotificationAccessSpecialPermission()
    }
  }

  function checkIsForegroundAppStart(packageName: string, isForeground: boolean): Promise<boolean> {
    if (!isForeground) {
      return Promise.resolve(true)
    }

    const runningStndAppList = getRunningStandardApps(packageName)
    if (runningStndAppList.length === 0) {
      return Promise.resolve(true)
    }

    return new Promise(resolve => {
      showAlert(
        translate("home:thereCanOnlyBeOne"),
        translate("home:thereCanOnlyBeOneMessage"),
        [
          {
            text: translate("common:cancel"),
            onPress: () => resolve(false),
            style: "cancel",
          },
          {
            text: translate("common:continue"),
            onPress: () => resolve(true),
          },
        ],
        {icon: <TreeIcon size={24} />},
      )
    })
  }

  const stopApp = async (packageName: string) => {
    console.log("STOP APP")

    // Optimistically update UI first
    optimisticallyStopApp(packageName)

    setIsLoading(true)
    try {
      await backendComms.stopApp(packageName)
      // Clear the pending operation since it completed successfully
      clearPendingOperation(packageName)
      // showToast()
    } catch (error) {
      // On error, refresh from the server to get the accurate state
      refreshAppStatus()
      console.error("Stop app error:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const startApp = async (packageName: string) => {
    if (!onboardingCompleted) {
      if (packageName !== "com.augmentos.livecaptions" && packageName !== "com.mentra.livecaptions") {
        showAlert(
          translate("home:completeOnboardingTitle"),
          translate("home:completeOnboardingMessage"),
          [{text: translate("common:ok")}],
          {
            iconName: "information-outline",
            iconColor: theme.colors.textDim,
          },
        )
        return
      } else {
        completeOnboarding()
      }
    }

    // Find the app we're trying to start
    const appToStart = appStatus.find(app => app.packageName === packageName)
    if (!appToStart) {
      console.error("App not found:", packageName)
      return
    }

    // check perms:
    const neededPermissions = await checkPermissions(appToStart)
    if (neededPermissions.length > 0) {
      await showAlert(
        neededPermissions.length > 1
          ? translate("home:permissionsRequiredTitle")
          : translate("home:permissionRequiredTitle"),
        translate("home:permissionMessage", {
          permissions: neededPermissions.map(perm => PERMISSION_CONFIG[perm]?.name || perm).join(", "),
        }),
        [
          {
            text: translate("common:cancel"),
            onPress: () => {},
            style: "cancel",
          },
          {
            text: translate("common:next"),
            onPress: async () => {
              await requestPermissions(neededPermissions)

              // Check if permissions were actually granted (for non-special permissions)
              // Special permissions like READ_NOTIFICATIONS on Android require manual action
              const stillNeededPermissions = await checkPermissions(appToStart)

              // If we still need READ_NOTIFICATIONS, don't auto-retry
              // The user needs to manually grant it in settings and try again
              if (stillNeededPermissions.includes(PermissionFeatures.READ_NOTIFICATIONS) && Platform.OS === "android") {
                // Permission flow is in progress, user needs to complete it manually
                return
              }

              // For other permissions that were granted, proceed with starting the app
              if (stillNeededPermissions.length === 0) {
                startApp(packageName)
              }
            },
          },
        ],
        {
          iconName: "information-outline",
          iconColor: theme.colors.textDim,
        },
      )
    }

    // Only update UI optimistically after user confirms and animation completes
    optimisticallyStartApp(packageName)

    // Check if it's a standard app
    if (appToStart?.appType === "standard") {
      console.log("% appToStart", appToStart)
      // Find any running standard apps
      const runningStandardApps = getRunningStandardApps(packageName)

      console.log("%%% runningStandardApps", runningStandardApps)

      // If there's any running standard app, stop it first
      for (const runningApp of runningStandardApps) {
        // Optimistically update UI
        optimisticallyStopApp(runningApp.packageName)

        try {
          console.log("%%% stopping app", runningApp.packageName)
          await backendComms.stopApp(runningApp.packageName)
          clearPendingOperation(runningApp.packageName)
        } catch (error) {
          console.error("stop app error:", error)
          refreshAppStatus()
        }
      }
    }

    // Start the operation in the background
    setIsLoading(true)
    try {
      console.log("%%% starting app", packageName)
      await backendComms.startApp(packageName)
      // Clear the pending operation since it completed successfully
      clearPendingOperation(packageName)

      // Mark that the user has ever activated an app
      await saveSetting(SETTINGS_KEYS.HAS_EVER_ACTIVATED_APP, true)

      if (!onboardingCompleted && packageName === "com.augmentos.livecaptions") {
        // If this is the Live Captions app, make sure we've hidden the tip
        setShowOnboardingTip(false)

        setTimeout(() => {
          showAlert(
            translate("home:tryLiveCaptionsTitle"),
            translate("home:tryLiveCaptionsMessage"),
            [{text: translate("common:ok")}],
            {
              iconName: "microphone",
            },
          )
        }, 500)
      }
    } catch (error) {
      // Revert the app state when there's an error starting the app
      console.error("start app error:", error)

      // Clear the pending operation for this app
      clearPendingOperation(packageName)
      // Refresh the app status to move the app back to inactive
      refreshAppStatus()
    } finally {
      setIsLoading(false)
    }

    setTimeout(() => {
      animateItemToTop(packageName)
    }, 1000)
  }

  const getRunningStandardApps = (packageName: string) => {
    return appStatus.filter(app => app.is_running && app.appType == "standard" && app.packageName !== packageName)
  }

  const openAppSettings = (app: any) => {
    console.log("%%% opening app settings", app)
    push("/app/settings", {packageName: app.packageName, appName: app.name})
  }

  // Filter out duplicate apps and running apps
  let availableApps = appStatus.filter(app => {
    // Check if this is the first occurrence of this package name
    const firstIndex = appStatus.findIndex(a => a.packageName === app.packageName)
    return firstIndex === appStatus.indexOf(app)
  })

  // remove the notify app on iOS
  if (Platform.OS === "ios") {
    availableApps = availableApps.filter(app => app.packageName !== "cloud.augmentos.notify" && app.name !== "Notify")
  }

  // Sort apps based on saved order or default sorting
  const sortApps = (apps: AppInterface[]) => {
    if (savedAppOrder.length > 0 && onboardingCompleted) {
      // Sort based on saved order
      return apps.sort((a, b) => {
        const aIndex = savedAppOrder.indexOf(a.packageName)
        const bIndex = savedAppOrder.indexOf(b.packageName)

        // If both are in saved order, sort by their saved position
        if (aIndex !== -1 && bIndex !== -1) {
          return aIndex - bIndex
        }

        // If only one is in saved order, it comes first
        if (aIndex !== -1) return -1
        if (bIndex !== -1) return 1

        // If neither are in saved order, sort alphabetically
        return a.name.localeCompare(b.name)
      })
    } else if (!onboardingCompleted) {
      // During onboarding, put Live Captions first
      return apps.sort((a, b) => {
        const aIsLiveCaptions =
          a.packageName === "com.augmentos.livecaptions" || a.packageName === "com.mentra.livecaptions"
        const bIsLiveCaptions =
          b.packageName === "com.augmentos.livecaptions" || b.packageName === "com.mentra.livecaptions"

        if (aIsLiveCaptions && !bIsLiveCaptions) return -1
        if (!aIsLiveCaptions && bIsLiveCaptions) return 1
        return a.name.localeCompare(b.name)
      })
    } else {
      // Normal alphabetical sort
      return apps.sort((a, b) => a.name.localeCompare(b.name))
    }
  }

  availableApps = sortApps(availableApps)

  if (searchQuery) {
    availableApps = availableApps.filter(app => app.name.toLowerCase().includes(searchQuery.toLowerCase()))
  }

  const handleTogglePress = async (app: AppInterface) => {
    if (!app.is_running) {
      const isForegroundApp = app.appType == "standard"
      const res = await checkIsForegroundAppStart(app.packageName, isForegroundApp)
      if (res) {
        startApp(app.packageName)
      }
      return
    }

    stopApp(app.packageName)
  }

  const renderDraggableItem = ({item: app, drag, isActive}: RenderItemParams<AppInterface>) => {
    // Check if this is the LiveCaptions app
    const isLiveCaptions =
      app.packageName === "com.augmentos.livecaptions" ||
      app.packageName === "cloud.augmentos.live-captions" ||
      app.packageName === "com.mentra.livecaptions"

    // Only set ref for LiveCaptions app
    const ref = isLiveCaptions ? actualLiveCaptionsRef : null

    return (
      <ScaleDecorator activeScale={0.98}>
        <TouchableOpacity onLongPress={drag} disabled={isActive} activeOpacity={1} hitSlop={12}>
          <View>
            <AppListItem
              app={app}
              // @ts-ignore
              is_foreground={app.appType == "standard" || app["tpaType"] == "standard"}
              isActive={app.is_running ?? false}
              onTogglePress={async () => {
                handleTogglePress(app)
              }}
              onSettingsPress={() => openAppSettings(app)}
              refProp={ref}
              opacity={1 as any}
            />
            {/* <Spacer height={16} />
            <Text>{app.name}</Text>
            <Spacer height={16} /> */}
            {/* <Divider variant="inset" /> */}
          </View>
        </TouchableOpacity>
      </ScaleDecorator>
    )
  }

  const renderItem = ({item: app}: {item: AppInterface}) => {
    // Check if this is the LiveCaptions app
    const isLiveCaptions =
      app.packageName === "com.augmentos.livecaptions" ||
      app.packageName === "cloud.augmentos.live-captions" ||
      app.packageName === "com.mentra.livecaptions"

    // Only set ref for LiveCaptions app
    const ref = isLiveCaptions ? actualLiveCaptionsRef : null

    return (
      <View>
        <AppListItem
          app={app}
          // @ts-ignore
          is_foreground={app.appType == "standard" || app["tpaType"] == "standard"}
          isActive={app.is_running ?? false}
          onTogglePress={async () => {
            handleTogglePress(app)
          }}
          onSettingsPress={() => openAppSettings(app)}
          refProp={ref}
          opacity={1 as any}
        />
        {/* <Spacer height={16} />
            <Text>{app.name}</Text>
            <Spacer height={16} /> */}
        {/* <Divider variant="inset" /> */}
      </View>
    )
  }

  const keyExtractor = (app: AppInterface) => app.packageName

  const handleDragEnd = ({data}: {data: AppInterface[]}) => {
    // Save the new order
    saveAppOrder(data)
  }

  // If searching or in onboarding, don't use draggable list
  if (isSearchPage || searchQuery || !onboardingCompleted) {
    return (
      <View>
        {!isSearchPage && <AppsHeader title="home:apps" showSearchIcon={true} />}

        {availableApps.map((app, index) => {
          const isLiveCaptions =
            app.packageName === "com.augmentos.livecaptions" ||
            app.packageName === "cloud.augmentos.live-captions" ||
            app.packageName === "com.mentra.livecaptions"

          const ref = isLiveCaptions ? actualLiveCaptionsRef : null

          return (
            <React.Fragment key={app.packageName}>
              <AppListItem
                app={app}
                // @ts-ignore
                is_foreground={app.appType == "standard" || app["tpaType"] == "standard"}
                isActive={app.is_running ?? false}
                onTogglePress={async () => {
                  handleTogglePress(app)
                }}
                onSettingsPress={() => openAppSettings(app)}
                refProp={ref}
                opacity={1 as any}
              />
              {index < availableApps.length - 1 && (
                <>
                  <Spacer height={8} />
                  <Divider variant="inset" />
                  <Spacer height={8} />
                </>
              )}
            </React.Fragment>
          )
        })}

        {/* Add "Get More Apps" link at the bottom - only on home page, not search */}
        {availableApps.length > 0 && !isSearchPage && (
          <>
            <Spacer height={8} />
            <Divider variant="inset" />
            <Spacer height={8} />
            <AppListStoreLink />
          </>
        )}

        {/* Show "No apps found" message when searching returns no results */}
        {isSearchPage && searchQuery && availableApps.length === 0 && (
          <View style={themed($noAppsContainer)}>
            <Text style={themed($noAppsText)}>{translate("home:noAppsFoundForQuery", {query: searchQuery})}</Text>
            {onClearSearch && (
              <>
                <Spacer height={16} />
                <TouchableOpacity
                  style={themed($clearSearchButton)}
                  onPress={() => {
                    Keyboard.dismiss()
                    onClearSearch()
                  }}
                  activeOpacity={0.7}
                  hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
                  <Text style={themed($clearSearchButtonText)}>{translate("home:clearSearch")}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* Add bottom padding for better scrolling experience */}
        <Spacer height={40} />
      </View>
    )
  }

  const animateItemToTop = async (packageName: string) => {
    // Find the index of the item to move
    const currentIndex = availableApps.findIndex(app => app.packageName === packageName)

    if (currentIndex === -1 || currentIndex === 0) {
      // Item not found or already at top
      return
    }

    // Create a new array with the item moved to the top
    const newData = [...availableApps]
    const [movedItem] = newData.splice(currentIndex, 1)
    newData.unshift(movedItem)

    // Update the data (this will trigger the animation)
    // You'll need to update availableApps through state
    // Since availableApps is derived from appStatus, you might need to:
    // 1. Update the saved app order
    // 2. Let the sorting logic handle it

    await saveAppOrder(newData)

    // Force a refresh to apply the new order
    // You might need to add a state variable to trigger re-render
    setSavedAppOrder(newData.map(app => app.packageName))
  }

  return (
    <View style={{flex: 1, paddingTop: theme.spacing.md}}>
      {!isSearchPage && <AppsHeader title="home:apps" showSearchIcon={true} />}

      {/* <DraggableFlatList
        style={{marginRight: -theme.spacing.md, paddingRight: theme.spacing.md}}
        data={availableApps}
        renderItem={renderDraggableItem}
        keyExtractor={keyExtractor}
        onDragEnd={handleDragEnd}
        itemLayoutAnimation={LinearTransition}
        // activationDistance={40}
        autoscrollThreshold={10}
        ListFooterComponent={
          <>
            <Spacer height={8} />
            <Divider variant="inset" />
            <Spacer height={8} />
            <AppListStoreLink />
            <Spacer height={40} />
          </>
        }
      /> */}

      <Animated.FlatList
        style={{marginRight: -theme.spacing.md, paddingRight: theme.spacing.md}}
        data={availableApps}
        // renderItem={renderDraggableItem}
        renderItem={renderItem}
        // keyExtractor={keyExtractor}
        // onDragEnd={handleDragEnd}
        itemLayoutAnimation={JumpingTransition.duration(5000)}
        // activationDistance={40}
        // autoscrollThreshold={10}
        // ListFooterComponent={
        //   <>
        //     <Spacer height={8} />
        //     <Divider variant="inset" />
        //     <Spacer height={8} />
        //     <AppListStoreLink />
        //     <Spacer height={40} />
        //   </>
        // }
      />
    </View>
  )
}

const $loadingContainer: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
  marginTop: 50,
})

const $noAppsContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
  paddingVertical: spacing.xxl,
})

const $noAppsText: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 16,
  color: colors.textDim,
  textAlign: "center",
})

const $clearSearchButton: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.buttonPrimary,
  paddingHorizontal: spacing.lg,
  paddingVertical: spacing.sm,
  borderRadius: 8,
  alignSelf: "center",
})

const $clearSearchButtonText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 14,
  fontWeight: "600",
  color: colors.textAlt,
  textAlign: "center",
})
