import {useEffect, useState} from "react"
import {Stack, SplashScreen} from "expo-router"
import {useFonts} from "@expo-google-fonts/space-grotesk"
import {customFontsToLoad} from "@/theme"
import {initI18n} from "@/i18n"
import {loadDateFnsLocale} from "@/utils/formatDate"
import {AllProviders} from "@/utils/structure/AllProviders"
import {AllEffects} from "@/utils/structure/AllEffects"
import * as Sentry from "@sentry/react-native"
import Constants from "expo-constants"
import {registerGlobals} from "react-native-webrtc"
import {initializeSettings} from "@/stores/settings"
import {ConsoleLogger} from "@/utils/debug/console"

Sentry.init({
  dsn: Constants.expoConfig?.extra?.SENTRY_DSN,

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

// initialize the settings store
initializeSettings()

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
