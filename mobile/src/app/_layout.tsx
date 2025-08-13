import {useEffect, useState} from "react"
import {Stack, SplashScreen} from "expo-router"

import {useFonts} from "@expo-google-fonts/space-grotesk"
import {colors, customFontsToLoad} from "@/theme"
import {initI18n} from "@/i18n"
import {loadDateFnsLocale} from "@/utils/formatDate"
import {useThemeProvider} from "@/utils/useAppTheme"
import {AllProviders} from "@/utils/AllProviders"
import BackgroundGradient from "@/components/misc/BackgroundGradient"
import MessageBanner from "@/components/misc/MessageBanner"
import Toast from "react-native-toast-message"
import {View} from "react-native"
import {Text} from "@/components/ignite"
import * as Sentry from "@sentry/react-native"

Sentry.init({
  dsn: "https://bb44ccdf95a57a8c58e49dc8fe858e0e@o4509837829079040.ingest.us.sentry.io/4509837865254912",

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Configure Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration()],

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,

  beforeSend(event, hint) {
    // console.log("Sentry.beforeSend", event, hint)
    console.log("Sentry.beforeSend", hint)
    return event
  },
})

SplashScreen.preventAutoHideAsync()

if (__DEV__) {
  // Load Reactotron configuration in development. We don't want to
  // include this in our production bundle, so we are using `if (__DEV__)`
  // to only execute this in development.
  require("src/devtools/ReactotronConfig.ts")
}

function Root() {
  const [fontsLoaded, fontError] = useFonts(customFontsToLoad)
  const [isI18nInitialized, setIsI18nInitialized] = useState(false)
  const {themeScheme, setThemeContextOverride, ThemeProvider} = useThemeProvider()

  useEffect(() => {
    initI18n()
      .then(() => setIsI18nInitialized(true))
      .then(() => loadDateFnsLocale())
      .catch(error => {
        console.error("Error initializing i18n:", error)
        // Still set initialized to true to prevent app from being stuck
        setIsI18nInitialized(true)
      })
  }, [])

  const loaded = fontsLoaded && isI18nInitialized

  const toastConfig = {
    baseToast: ({text1, props}: {text1?: string; props?: {icon?: React.ReactNode}}) => (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: colors.background,
          borderRadius: 16,
          paddingVertical: 12,
          paddingHorizontal: 16,
          marginHorizontal: 16,
        }}>
        {props?.icon && (
          <View style={{marginRight: 10, justifyContent: "center", alignItems: "center"}}>{props.icon}</View>
        )}
        <Text
          text={text1}
          style={{
            fontSize: 15,
            color: colors.text,
          }}
        />
      </View>
    ),
  }

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
    <ThemeProvider value={{themeScheme, setThemeContextOverride}}>
      <AllProviders>
        <View style={{flex: 1}}>
          <BackgroundGradient>
            <Stack
              screenOptions={{
                headerShown: false,
                gestureEnabled: true,
                gestureDirection: "horizontal",
                // gestureResponseDistance: 100,
                // fullScreenGestureEnabled: true,
                animation: "none",
              }}>
              <Stack.Screen name="(tabs)" options={{headerShown: false}} />
              <Stack.Screen name="auth" options={{headerShown: false}} />
              <Stack.Screen name="pairing" options={{headerShown: false}} />
              <Stack.Screen name="settings" options={{headerShown: false}} />
              <Stack.Screen name="gallery" options={{headerShown: false}} />
              <Stack.Screen name="mirror" options={{headerShown: false}} />
              <Stack.Screen name="search" options={{headerShown: false}} />
              <Stack.Screen name="permissions" options={{headerShown: false}} />
              <Stack.Screen name="onboarding" options={{headerShown: false}} />
              <Stack.Screen name="app" options={{headerShown: false}} />
              <Stack.Screen name="welcome" options={{headerShown: false}} />
            </Stack>
            <MessageBanner />
            <Toast config={toastConfig} />
          </BackgroundGradient>
        </View>
      </AllProviders>
    </ThemeProvider>
  )
}

export default Sentry.wrap(Root)
