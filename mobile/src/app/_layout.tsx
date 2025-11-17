import {useFonts} from "@expo-google-fonts/space-grotesk"
import {registerGlobals} from "@livekit/react-native-webrtc"
import * as Sentry from "@sentry/react-native"
import {Stack, SplashScreen, useNavigationContainerRef} from "expo-router"
import {useEffect, useState} from "react"
import {LogBox} from "react-native"

import {initI18n} from "@/i18n"
import {SETTINGS_KEYS, useSettingsStore} from "@/stores/settings"
import {customFontsToLoad} from "@/theme"
import {ConsoleLogger} from "@/utils/debug/console"
import {loadDateFnsLocale} from "@/utils/formatDate"
import {AllEffects} from "@/utils/structure/AllEffects"
import {AllProviders} from "@/utils/structure/AllProviders"

// prevent the annoying warning box at the bottom of the screen from getting in the way:
LogBox.ignoreLogs([
  "Failed to open debugger. Please check that the dev server is running and reload the app.",
  "Require cycle:",
  "is missing the required default export.",
  "Attempted to import the module",
])

const navigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: true,
  routeChangeTimeoutMs: 1_000, // default: 1_000
  ignoreEmptyBackNavigationTransactions: true, // default: true
})

const setupSentry = () => {
  // Only initialize Sentry if DSN is provided
  const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN
  const isChina = useSettingsStore.getState().getSetting(SETTINGS_KEYS.china_deployment)

  if (!sentryDsn || sentryDsn === "secret" || sentryDsn.trim() === "") {
    return
  }
  if (isChina) {
    return
  }

  const release = `${process.env.EXPO_PUBLIC_MENTRAOS_VERSION}`
  const dist = `${process.env.EXPO_PUBLIC_BUILD_TIME}-${process.env.EXPO_PUBLIC_BUILD_COMMIT}`
  const branch = process.env.EXPO_PUBLIC_BUILD_BRANCH
  const isProd = branch == "main" || branch == "staging"
  const sampleRate = isProd ? 0.1 : 1.0

  Sentry.init({
    dsn: sentryDsn,

    // Adds more context data to events (IP address, cookies, user, etc.)
    // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
    sendDefaultPii: true,

    // send 1/10th of events in prod:
    tracesSampleRate: sampleRate,

    // debug: true,
    _experiments: {
      enableUnhandledCPPExceptionsV2: true,
    },
    //   enableNativeCrashHandling: false,
    //   enableNativeNagger: false,
    //   enableNative: false,
    //   enableLogs: false,
    //   enabled: false,
    release: release,
    dist: dist,
    integrations: [Sentry.feedbackIntegration({})],
  })
}

setupSentry()

// initialize the settings store
useSettingsStore.getState().loadAllSettings()

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync()

function Root() {
  const [_fontsLoaded, fontError] = useFonts(customFontsToLoad)
  const [loaded, setLoaded] = useState(false)

  const loadAssets = async () => {
    try {
      await initI18n()
      await loadDateFnsLocale()
      // initialize webrtc
      await registerGlobals()
    } catch (error) {
      console.error("Error loading assets:", error)
    } finally {
      setLoaded(true)
    }
  }

  useEffect(() => {
    loadAssets()
  }, [])

  useEffect(() => {
    if (fontError) throw fontError
  }, [fontError])

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync()
    }
  }, [loaded])

  const ref = useNavigationContainerRef()
  useEffect(() => {
    if (ref) {
      navigationIntegration.registerNavigationContainer(ref)
    }
  }, [ref])

  if (!loaded) {
    return null
  }

  return (
    <AllProviders>
      <AllEffects />
      <Stack
        screenOptions={{
          headerShown: false,
          gestureEnabled: true,
          gestureDirection: "horizontal",
          animation: "simple_push",
        }}
      />
      <ConsoleLogger />
    </AllProviders>
  )
}

export default Sentry.wrap(Root)
