import {Header, PillButton, Screen, Text} from "@/components/ignite"
import AppIcon from "@/components/misc/AppIcon"
import Divider from "@/components/misc/Divider"
import LoadingOverlay from "@/components/misc/LoadingOverlay"
import SettingsSkeleton from "@/components/misc/SettingsSkeleton"
import GroupTitle from "@/components/settings/GroupTitle"
import {InfoRow} from "@/components/settings/InfoRow"
import MultiSelectSetting from "@/components/settings/MultiSelectSetting"
import NumberSetting from "@/components/settings/NumberSetting"
import SelectSetting from "@/components/settings/SelectSetting"
import SelectWithSearchSetting from "@/components/settings/SelectWithSearchSetting"
import {SettingsGroup} from "@/components/settings/SettingsGroup"
import SliderSetting from "@/components/settings/SliderSetting"
import TextSettingNoSave from "@/components/settings/TextSettingNoSave"
import TimeSetting from "@/components/settings/TimeSetting"
import TitleValueSetting from "@/components/settings/TitleValueSetting"
import ToggleSetting from "@/components/settings/ToggleSetting"
import ActionButton from "@/components/ui/ActionButton"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {translate} from "@/i18n"
import restComms from "@/services/RestComms"
import {useApplets, useRefreshApplets, useStartApplet, useStopApplet} from "@/stores/applets"
import {useSettingsStore} from "@/stores/settings"
import {ThemedStyle} from "@/theme"
import {showAlert} from "@/utils/AlertUtils"
import {askPermissionsUI} from "@/utils/PermissionsUtils"
import {useAppTheme} from "@/utils/useAppTheme"
import AsyncStorage from "@react-native-async-storage/async-storage"
import {useFocusEffect, useLocalSearchParams} from "expo-router"
import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from "react"
import {Animated, BackHandler, TextStyle, View, ViewStyle} from "react-native"
import {useSafeAreaInsets} from "react-native-safe-area-context"
import Toast from "react-native-toast-message"
import FontAwesome from "react-native-vector-icons/FontAwesome"

export default function AppSettings() {
  const {packageName, appName: appNameParam} = useLocalSearchParams()
  const [isUninstalling, setIsUninstalling] = useState(false)
  const {theme, themed} = useAppTheme()
  const {goBack, replace} = useNavigationHistory()
  const insets = useSafeAreaInsets()
  const hasLoadedData = useRef(false)

  // Use appName from params or default to empty string
  const [appName, setAppName] = useState(appNameParam || "")

  // Animation values for collapsing header
  const scrollY = useRef(new Animated.Value(0)).current
  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 50, 100],
    outputRange: [0, 0, 1],
    extrapolate: "clamp",
  })

  // State to hold the complete configuration from the server.
  const [serverAppInfo, setServerAppInfo] = useState<any>(null)
  // Local state to track current values for each setting.
  const [settingsState, setSettingsState] = useState<{[key: string]: any}>({})

  const startApp = useStartApplet()
  const applets = useApplets()
  const refreshApplets = useRefreshApplets()
  const stopApp = useStopApplet()

  const appInfo = useMemo(() => {
    return applets.find(app => app.packageName === packageName) || null
  }, [applets, packageName])

  const SETTINGS_CACHE_KEY = (packageName: string) => `app_settings_cache_${packageName}`
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [hasCachedSettings, setHasCachedSettings] = useState(false)

  if (!packageName || typeof packageName !== "string") {
    console.error("No packageName found in params")
    return null
  }

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        goBack()
        return true
      }
      const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress)
      return () => {
        subscription.remove()
      }
    }, [goBack]),
  )

  // Handle app start/stop actions with debouncing
  const handleStartStopApp = async () => {
    if (!appInfo) return

    try {
      if (appInfo.running) {
        stopApp(packageName)
        return
      }

      // If the app appears offline, confirm before proceeding
      if (!appInfo.healthy) {
        const developerName = (
          " " +
          ((serverAppInfo as any)?.organization?.name ||
            (appInfo as any).orgName ||
            (appInfo as any).developerId ||
            "") +
          " "
        ).replace("  ", " ")
        const proceed = await new Promise<boolean>(resolve => {
          // Use the shared alert utility
          showAlert(
            "App is down for maintenance",
            `${appInfo.name} appears offline. Try anyway?\n\nThe developer${developerName}needs to get their server back up and running. Please contact them for more details.`,
            [
              {text: translate("common:cancel"), style: "cancel", onPress: () => resolve(false)},
              {text: "Try Anyway", onPress: () => resolve(true)},
            ],
            {iconName: "alert-circle-outline", iconColor: theme.colors.palette.angry500},
          )
        })
        if (!proceed) return
      }

      if (!(await restComms.checkAppHealthStatus(appInfo.packageName))) {
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
        handleStartStopApp() // restart this function
        return
      }

      startApp(packageName)
    } catch (error) {
      // Refresh the app status to get the accurate state from the server
      refreshApplets()

      console.error(`Error ${appInfo.running ? "stopping" : "starting"} app:`, error)
    }
  }

  const handleUninstallApp = () => {
    console.log(`Uninstalling app: ${packageName}`)

    showAlert(
      "Uninstall App",
      `Are you sure you want to uninstall ${appInfo?.name || appName}?`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Uninstall",
          style: "destructive",
          onPress: async () => {
            try {
              setIsUninstalling(true)
              // First stop the app if it's running
              if (appInfo?.running) {
                // Optimistically update UI first
                stopApp(packageName)
                await restComms.stopApp(packageName)
              }

              // Then uninstall it
              await restComms.uninstallApp(packageName)

              // Show success message
              Toast.show({
                type: "success",
                text1: `${appInfo?.name || appName} has been uninstalled successfully`,
              })

              replace("/(tabs)/home")
            } catch (error: any) {
              console.error("Error uninstalling app:", error)
              refreshApplets()
              Toast.show({
                type: "error",
                text1: `Error uninstalling app: ${error.message || "Unknown error"}`,
              })
            } finally {
              setIsUninstalling(false)
            }
          },
        },
      ],
      {
        iconName: "delete-forever",
        iconSize: 48,
        iconColor: theme.colors.palette.angry600,
      },
    )
  }

  const fetchUpdatedSettingsInfo = async () => {
    // Only show skeleton if there are no cached settings
    if (!hasCachedSettings) setSettingsLoading(true)
    const startTime = Date.now() // For profiling
    try {
      const data = await restComms.getAppSettings(packageName)
      const elapsed = Date.now() - startTime
      console.log(`[PROFILE] getTpaSettings for ${packageName} took ${elapsed}ms`)
      console.log("GOT TPA SETTING")
      console.log(JSON.stringify(data))
      // TODO: Profile backend and optimize if slow
      // If no data is returned from the server, create a minimal app info object
      if (!data) {
        setServerAppInfo({
          name: appInfo?.name || appName,
          description: appInfo?.description || "No description available.",
          settings: [],
          uninstallable: true,
        })
        setSettingsState({})
        setHasCachedSettings(false)
        setSettingsLoading(false)
        return
      }
      setServerAppInfo(data)

      // Update appName if we got it from server
      if (data.name) {
        setAppName(data.name)
      }

      // Initialize local state using the "selected" property.
      if (data.settings && Array.isArray(data.settings)) {
        const initialState: {[key: string]: any} = {}
        data.settings.forEach((setting: any) => {
          if (setting.type !== "group") {
            // Use cached value if it exists (user has interacted with this setting before)
            // Otherwise use 'selected' from backend (which includes defaultValue for new settings)
            initialState[setting.key] = setting.selected
          }
        })
        setSettingsState(initialState)
        // Cache the settings
        AsyncStorage.setItem(
          SETTINGS_CACHE_KEY(packageName),
          JSON.stringify({
            serverAppInfo: data,
            settingsState: initialState,
          }),
        )
        setHasCachedSettings(data.settings.length > 0)
      } else {
        setHasCachedSettings(false)
      }
      setSettingsLoading(false)

      // TACTICAL BYPASS: Execute immediate webview redirect if webviewURL detected
      // if (data.webviewURL && fromWebView !== "true") {
      //   replace("/applet/webview", {
      //     webviewURL: data.webviewURL,
      //     appName: appName,
      //     packageName: packageName,
      //   })
      //   return
      // }
    } catch (err) {
      setSettingsLoading(false)
      setHasCachedSettings(false)
      console.error("Error fetching App settings:", err)
      setServerAppInfo({
        name: appInfo?.name || appName,
        description: appInfo?.description || "No description available.",
        settings: [],
        uninstallable: true,
      })
      setSettingsState({})
    }
  }

  // When a setting changes, update local state and send the full updated settings payload.
  const handleSettingChange = (key: string, value: any) => {
    setSettingsState(prevState => ({
      ...prevState,
      [key]: value,
    }))

    // Build an array of settings to send.
    restComms
      .updateAppSetting(packageName, {key, value})
      .then(data => {
        console.log("Server update response:", data)
      })
      .catch(error => {
        console.error("Error updating setting on server:", error)
      })
  }

  // Render each setting.
  const renderSetting = (setting: any, index: number) => {
    switch (setting.type) {
      case "group":
        return <GroupTitle key={`group-${index}`} title={setting.title} />
      case "toggle":
        return (
          <ToggleSetting
            key={index}
            label={setting.label}
            value={settingsState[setting.key]}
            onValueChange={val => handleSettingChange(setting.key, val)}
          />
        )
      case "text":
        return (
          <TextSettingNoSave
            key={index}
            label={setting.label}
            value={settingsState[setting.key]}
            onChangeText={text => handleSettingChange(setting.key, text)}
            settingKey={setting.key}
          />
        )
      case "text_no_save_button":
        return (
          <TextSettingNoSave
            key={index}
            label={setting.label}
            value={settingsState[setting.key]}
            onChangeText={text => handleSettingChange(setting.key, text)}
            settingKey={setting.key}
          />
        )
      case "slider":
        return (
          <SliderSetting
            key={index}
            label={setting.label}
            value={settingsState[setting.key]}
            min={setting.min}
            max={setting.max}
            onValueChange={val =>
              setSettingsState(prevState => ({
                ...prevState,
                [setting.key]: val,
              }))
            }
            onValueSet={val => handleSettingChange(setting.key, val)}
          />
        )
      case "select":
        return (
          <SelectSetting
            key={index}
            label={setting.label}
            value={settingsState[setting.key]}
            options={setting.options}
            defaultValue={setting.defaultValue}
            onValueChange={val => handleSettingChange(setting.key, val)}
          />
        )
      case "select_with_search":
        return (
          <SelectWithSearchSetting
            key={index}
            label={setting.label}
            value={settingsState[setting.key]}
            options={setting.options}
            defaultValue={setting.defaultValue}
            onValueChange={val => handleSettingChange(setting.key, val)}
          />
        )
      case "numeric_input":
        return (
          <NumberSetting
            key={index}
            label={setting.label}
            value={settingsState[setting.key] || 0}
            min={setting.min}
            max={setting.max}
            step={setting.step}
            placeholder={setting.placeholder}
            onValueChange={val => handleSettingChange(setting.key, val)}
          />
        )
      case "time_picker":
        return (
          <TimeSetting
            key={index}
            label={setting.label}
            value={settingsState[setting.key] || 0}
            showSeconds={setting.showSeconds !== false}
            onValueChange={val => handleSettingChange(setting.key, val)}
          />
        )
      case "multiselect":
        return (
          <MultiSelectSetting
            key={index}
            label={setting.label}
            values={settingsState[setting.key]}
            options={setting.options}
            onValueChange={vals => handleSettingChange(setting.key, vals)}
          />
        )
      case "titleValue":
        return <TitleValueSetting key={index} label={setting.label} value={setting.value} />
      default:
        return null
    }
  }

  // Add header button when webviewURL exists
  useLayoutEffect(() => {
    if (serverAppInfo?.webviewURL) {
      // TODO2.0:
      // navigation.setOptions({
      //   headerRight: () => (
      //     <View style={{marginRight: 8}}>
      //       <FontAwesome.Button
      //         name="globe"
      //         size={22}
      //         color={isDarkTheme ? "#FFFFFF" : "#000000"}
      //         backgroundColor="transparent"
      //         underlayColor="transparent"
      //         onPress={() => {
      //           navigation.replace("AppWebView", {
      //             webviewURL: serverAppInfo.webviewURL,
      //             appName: appName,
      //             packageName: packageName,
      //             fromSettings: true,
      //           })
      //         }}
      //         style={{padding: 0, margin: 0}}
      //         iconStyle={{marginRight: 0}}
      //       />
      //     </View>
      //   ),
      // })
    }
  }, [serverAppInfo, packageName, appName])

  // Reset hasLoadedData when packageName changes
  useEffect(() => {
    hasLoadedData.current = false
  }, [packageName])

  // Fetch App settings on mount
  useEffect(() => {
    // Skip if we've already loaded data for this packageName
    if (hasLoadedData.current) {
      return
    }

    let isMounted = true
    let debounceTimeout: NodeJS.Timeout

    const loadCachedSettings = async () => {
      const cached = await useSettingsStore.getState().loadSetting(SETTINGS_CACHE_KEY(packageName))
      if (cached && isMounted) {
        setServerAppInfo(cached.serverAppInfo)
        setSettingsState(cached.settingsState)
        setHasCachedSettings(!!(cached.serverAppInfo?.settings && cached.serverAppInfo.settings.length > 0))
        setSettingsLoading(false)

        // Update appName from cached data if available
        if (cached.serverAppInfo?.name) {
          setAppName(cached.serverAppInfo.name)
        }

        // TACTICAL BYPASS: If webviewURL exists in cached data, execute immediate redirect
        // if (cached.serverAppInfo?.webviewURL && fromWebView !== "true") {
        //   replace("/applet/webview", {
        //     webviewURL: cached.serverAppInfo.webviewURL,
        //     appName: appName,
        //     packageName: packageName,
        //   })
        //   return
        // }
      } else {
        setHasCachedSettings(false)
        setSettingsLoading(true)
      }
    }

    // Load cached settings immediately
    loadCachedSettings()

    // Debounce fetch to avoid redundant calls
    debounceTimeout = setTimeout(() => {
      fetchUpdatedSettingsInfo()
      hasLoadedData.current = true
    }, 150)

    return () => {
      isMounted = false
      clearTimeout(debounceTimeout)
    }
  }, [])

  if (!appInfo) {
    // Optionally, you could render a fallback error or nothing
    return null
  }

  return (
    <Screen preset="fixed" safeAreaEdges={[]} style={{paddingHorizontal: theme.spacing.md}}>
      {isUninstalling && <LoadingOverlay message={`Uninstalling ${appInfo?.name || appName}...`} />}

      <View>
        <Header title="" leftIcon="caretLeft" onLeftPress={() => goBack()} />
        <Animated.View
          style={{
            opacity: headerOpacity,
            position: "absolute",
            top: insets.top,
            left: 0,
            right: 0,
            height: 56,
            justifyContent: "center",
            alignItems: "center",
            pointerEvents: "none",
          }}>
          <Text
            style={{
              fontSize: 17,
              fontWeight: "600",
              color: theme.colors.text,
            }}
            numberOfLines={1}
            ellipsizeMode="tail">
            {appInfo?.name || (appName as string)}
          </Text>
        </Animated.View>
      </View>

      {/* <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{flex: 1}}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}> */}
      <Animated.ScrollView
        style={{marginRight: -theme.spacing.md, paddingRight: theme.spacing.md}}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event([{nativeEvent: {contentOffset: {y: scrollY}}}], {useNativeDriver: true})}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled">
        <View style={{gap: theme.spacing.lg}}>
          {/* Combined App Info and Action Section */}
          <View style={themed($topSection)}>
            <AppIcon app={appInfo} style={themed($appIconLarge)} />

            <View style={themed($rightColumn)}>
              <View style={themed($textContainer)}>
                <Text style={themed($appNameSmall)}>{appInfo.name}</Text>
                <Text style={themed($versionText)}>{appInfo.version || "1.0.0"}</Text>
              </View>
              <View style={themed($buttonContainer)}>
                <PillButton
                  text={appInfo.is_running ? "Stop" : "Start"}
                  onPress={handleStartStopApp}
                  variant="icon"
                  buttonStyle={{paddingHorizontal: theme.spacing.lg, minWidth: 80}}
                />
              </View>
            </View>
          </View>

          {appInfo.isOnline === false && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: theme.spacing.xs,
                backgroundColor: theme.colors.errorBackground,
                borderRadius: 8,
                paddingHorizontal: theme.spacing.sm,
                paddingVertical: theme.spacing.xs,
              }}>
              <FontAwesome name="warning" size={16} color={theme.colors.error} />
              <Text style={{color: theme.colors.error, flex: 1}}>
                This app appears to be offline. Some actions may not work.
              </Text>
            </View>
          )}

          <Divider variant="full" />

          {/* Description Section */}
          <View style={themed($descriptionSection)}>
            <Text style={themed($descriptionText)}>{appInfo.description || "No description available."}</Text>
          </View>

          <Divider variant="full" />

          {/* App Instructions Section */}
          {serverAppInfo?.instructions && (
            <View style={themed($sectionContainer)}>
              <Text style={themed($sectionTitle)}>About this App</Text>
              <Text style={themed($instructionsText)}>{serverAppInfo.instructions}</Text>
            </View>
          )}

          {/* App Settings Section */}
          <View style={themed($settingsContainer)}>
            {settingsLoading && (!serverAppInfo?.settings || typeof serverAppInfo.settings === "undefined") ? (
              <SettingsSkeleton />
            ) : serverAppInfo?.settings && serverAppInfo.settings.length > 0 ? (
              serverAppInfo.settings.map((setting: any, index: number) =>
                renderSetting({...setting, uniqueKey: `${setting.key}-${index}`}, index),
              )
            ) : (
              <Text style={themed($noSettingsText)}>No settings available for this app</Text>
            )}
          </View>

          {/* Additional Information Section */}
          <View>
            <Text
              style={[
                themed($groupTitle),
                {
                  marginTop: theme.spacing.md,
                  marginBottom: theme.spacing.xs,
                  paddingHorizontal: theme.spacing.md,
                  fontSize: 16,
                  fontFamily: "Montserrat-Regular",
                  color: theme.colors.textDim,
                },
              ]}>
              Other
            </Text>
            <SettingsGroup>
              <View style={{paddingVertical: theme.spacing.sm}}>
                <Text style={{fontSize: 15, color: theme.colors.text}}>Additional Information</Text>
              </View>
              <InfoRow label="Company" value={serverAppInfo?.organization?.name || "-"} showDivider={false} />
              <InfoRow label="Website" value={serverAppInfo?.organization?.website || "-"} showDivider={false} />
              <InfoRow label="Contact" value={serverAppInfo?.organization?.contactEmail || "-"} showDivider={false} />
              <InfoRow
                label="App Type"
                value={
                  appInfo?.type === "standard" ? "Foreground" : appInfo?.type === "background" ? "Background" : "-"
                }
                showDivider={false}
              />
              <InfoRow label="Package Name" value={packageName} showDivider={false} />
            </SettingsGroup>
          </View>

          {/* Uninstall Button at the bottom */}
          <ActionButton
            label="Uninstall"
            variant="destructive"
            onPress={() => {
              if (serverAppInfo?.uninstallable) {
                handleUninstallApp()
              } else {
                showAlert("Cannot Uninstall", "This app cannot be uninstalled.", [{text: "OK", style: "default"}])
              }
            }}
            disabled={!serverAppInfo?.uninstallable}
          />

          {/* Bottom safe area padding */}
          <View style={{height: Math.max(40, insets.bottom + 20)}} />
        </View>
      </Animated.ScrollView>
      {/* </KeyboardAvoidingView> */}
    </Screen>
  )
}

const $topSection: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  gap: spacing.lg,
  alignItems: "center",
})

const $rightColumn: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  justifyContent: "space-between",
})

const $textContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  gap: spacing.xxs,
})

const $buttonContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  alignSelf: "flex-start",
  marginTop: spacing.sm,
})

const $appIconLarge: ThemedStyle<ViewStyle> = () => ({
  width: 90,
  height: 90,
  borderRadius: 45, // Half of width/height for perfect circle
})

const $appNameSmall: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 24,
  fontWeight: "600",
  fontFamily: "Montserrat-Bold",
  color: colors.text,
})

const $versionText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 16,
  fontFamily: "Montserrat-Regular",
  color: colors.textDim,
})

const $descriptionSection: ThemedStyle<ViewStyle> = ({spacing}) => ({
  paddingVertical: spacing.xs,
  paddingHorizontal: spacing.md,
})

const $descriptionText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 16,
  fontFamily: "Montserrat-Regular",
  lineHeight: 22,
  color: colors.text,
})

const $sectionContainer: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  borderRadius: spacing.sm,
  borderWidth: 1,
  padding: spacing.md,
  elevation: 2,
  shadowColor: "#000",
  shadowOffset: {width: 0, height: 2},
  shadowOpacity: 0.1,
  shadowRadius: spacing.xxs,
  backgroundColor: colors.background,
  borderColor: colors.border,
})

const $sectionTitle: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 18,
  fontWeight: "bold",
  fontFamily: "Montserrat-Bold",
  marginBottom: spacing.sm,
  color: colors.text,
})

const $instructionsText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 14,
  lineHeight: 22,
  fontFamily: "Montserrat-Regular",
  color: colors.text,
})

const $settingsContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  gap: spacing.md,
})

const $noSettingsText: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 14,
  fontFamily: "Montserrat-Regular",
  fontStyle: "italic",
  textAlign: "center",
  padding: spacing.md,
  color: colors.textDim,
})

const $groupTitle: ThemedStyle<TextStyle> = () => ({})
