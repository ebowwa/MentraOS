import {useEffect, useState} from "react"
import {Stack, SplashScreen} from "expo-router"
import { initializeReporting, reportCritical, reportError, reportWarning, reportInfo } from '@/reporting'
import { reportAppStartupIssue, reportAppCrash } from '@/reporting/domains'

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

// Sentry will be initialized by ReportManager

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
        
        // 🧪 TESTING: Send dummy error reports to test reporting system
        // Set to true to enable testing, false to disable
        const ENABLE_TEST_REPORTS = __DEV__ // Only in development
        if (ENABLE_TEST_REPORTS) {
          console.log('🧪 Sending test error reports...')
          
          // Test different report levels
          reportInfo('Test info message', 'app.testing', 'test_initialization')
          reportWarning('Test warning message', 'app.testing', 'test_initialization')
          reportError('Test error message', 'app.testing', 'test_initialization')
          reportCritical('Test critical message', 'app.testing', 'test_initialization')
          
          // Test with exception
          reportError('Test error with exception', 'app.testing', 'test_exception', new Error('Test exception for error reporting'))
          
          // Test domain-specific reporting
          reportAppStartupIssue('Test startup issue', new Error('Test startup error'))
          
          console.log('✅ Test error reports sent')
        }
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
    if (fontError) {
      reportAppStartupIssue("Font loading failed", fontError)
      throw fontError
    }
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

export default Root;