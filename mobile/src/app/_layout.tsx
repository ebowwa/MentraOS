import {useEffect, useState} from "react"
import {Stack, SplashScreen} from "expo-router"
import * as Sentry from '@sentry/react-native'
import { initializeReporting, reportCritical } from '@/utils/reporting'

import {useFonts} from "@expo-google-fonts/space-grotesk"
import {colors, customFontsToLoad} from "@/theme"
import {initI18n} from "@/i18n"
import {loadDateFnsLocale} from "@/utils/formatDate"
import {useThemeProvider} from "@/utils/useAppTheme"
import {AllProviders} from "@/utils/AllProviders"
import BackgroundGradient from "@/components/misc/BackgroundGradient"
import MessageBanner from "@/components/misc/MessageBanner"
import Toast, {SuccessToast, BaseToast, ErrorToast} from "react-native-toast-message"
import {View} from "react-native"
import {Text} from "@/components/ignite"
import {Ionicons} from "@expo/vector-icons" // Replace with your project's icon import if different

Sentry.init({
  dsn: 'https://e39b9d206b558506ddb5051fcf612513@o4509753650249728.ingest.us.sentry.io/4509753651691520',

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Configure Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration(), Sentry.feedbackIntegration()],

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

SplashScreen.preventAutoHideAsync()

if (__DEV__) {
  // Load Reactotron configuration in development. We don't want to
  // include this in our production bundle, so we are using `if (__DEV__)`
  // to only execute this in development.
  require("src/devtools/ReactotronConfig.ts")
}

export {ErrorBoundary} from "@/components/ErrorBoundary/ErrorBoundary"

function Root() {
  const [fontsLoaded, fontError] = useFonts(customFontsToLoad)
  const [isI18nInitialized, setIsI18nInitialized] = useState(false)
  const {themeScheme, setThemeContextOverride, ThemeProvider} = useThemeProvider()

  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Initialize i18n
        await initI18n()
        setIsI18nInitialized(true)
        
        // Load date locale
        await loadDateFnsLocale()
        
        // Initialize reporting system
        await initializeReporting()
      } catch (error) {
        console.error("Error initializing app:", error)
        reportCritical("Error initializing app", 'app.lifecycle', 'app_initialization', error instanceof Error ? error : new Error(String(error)))
        // Still set initialized to true to prevent app from being stuck
        setIsI18nInitialized(true)
      }
    }

    initializeApp()
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
              }}
            />
            <MessageBanner />
            <Toast config={toastConfig} />
          </BackgroundGradient>
        </View>
      </AllProviders>
    </ThemeProvider>
  )
}

export default Sentry.wrap(Root);