import {useEffect, useState} from "react"
import {Stack, SplashScreen} from "expo-router"
import {useFonts} from "@expo-google-fonts/space-grotesk"
import {customFontsToLoad} from "@/theme"
import {initI18n} from "@/i18n"
import {loadDateFnsLocale} from "@/utils/formatDate"
import {AllProviders} from "@/utils/structure/AllProviders"
import {AllEffects} from "@/utils/structure/AllEffects"
import * as Sentry from "@sentry/react-native"
import {registerGlobals} from "@livekit/react-native-webrtc"
import {initializeSettings, SETTINGS_KEYS, useSettingsStore} from "@/stores/settings"
import {ConsoleLogger} from "@/utils/debug/console"
import {LogBox} from "react-native"

// prevent the annoying warning box at the bottom of the screen from getting in the way:
LogBox.ignoreLogs([
  "Failed to open debugger. Please check that the dev server is running and reload the app.",
  "Require cycle:",
  "is missing the required default export.",
  "Attempted to import the module",
])

// Only initialize Sentry if DSN is provided
const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN
const isChina = useSettingsStore.getState().getSetting(SETTINGS_KEYS.china_deployment)
if (!isChina && sentryDsn && sentryDsn !== "secret" && sentryDsn.trim() !== "") {
  Sentry.init({
    dsn: sentryDsn,

    // Adds more context data to events (IP address, cookies, user, etc.)
    // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
    sendDefaultPii: true,

    // send 1/10th of events in prod:
    tracesSampleRate: __DEV__ ? 1.0 : 0.1,

    // Configure Session Replay
    // DISABLED: Mobile replay causes MediaCodec spam by recording screen every 5 seconds
    // replaysSessionSampleRate: 0.1,
    // replaysOnErrorSampleRate: 1,
    // integrations: [Sentry.mobileReplayIntegration()],

    // uncomment the line below to enable Spotlight (https://spotlightjs.com)
    // spotlight: __DEV__,

    // beforeSend(event, hint) {
    //   // console.log("Sentry.beforeSend", event, hint)
    //   console.log("Sentry.beforeSend", hint)
    //   return event
    // },
  })
}

// initialize the settings store
initializeSettings()

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync()

function Root() {
  const [_fontsLoaded, fontError] = useFonts(customFontsToLoad)
  const [loaded, setLoaded] = useState(false)

  const loadAssets = async () => {
    try {
      // Load critical assets first (i18n and date formatting)
      await Promise.all([
        initI18n(),
        loadDateFnsLocale(),
      ])
      // Defer WebRTC initialization - it's heavy and may not be needed immediately
      // Initialize it after critical assets are loaded
      registerGlobals().catch((error) => {
        console.warn("Failed to initialize WebRTC (may be needed later):", error)
      })
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
          // gestureResponseDistance: 100,
          // fullScreenGestureEnabled: true,
          animation: "none",
        }}
      />
      <ConsoleLogger />
    </AllProviders>
  )
}

export default Sentry.wrap(Root)
