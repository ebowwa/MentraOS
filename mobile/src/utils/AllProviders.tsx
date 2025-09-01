import {SplashScreen} from "expo-router"
import "react-native-reanimated"
import {withWrappers} from "@/utils/with-wrappers"
import {Suspense} from "react"
import {KeyboardProvider} from "react-native-keyboard-controller"
import {CoreStatusProvider} from "@/contexts/CoreStatusProvider"
import {AppStatusProvider} from "@/contexts/AppletStatusProvider"
import {GestureHandlerRootView} from "react-native-gesture-handler"
import {AuthProvider} from "@/contexts/AuthContext"
import {SearchResultsProvider} from "@/contexts/SearchResultsContext"
import {AppStoreWebviewPrefetchProvider} from "@/contexts/AppStoreWebviewPrefetchProvider"
import {ModalProvider} from "./AlertUtils"
import {GlassesMirrorProvider} from "@/contexts/GlassesMirrorContext"
import {NavigationHistoryProvider} from "@/contexts/NavigationHistoryContext"
import {DeeplinkProvider} from "@/contexts/DeeplinkContext"
import {NetworkConnectivityProvider} from "@/contexts/NetworkConnectivityProvider"
import {PostHogProvider} from "posthog-react-native"
import Constants from "expo-constants"

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync()

export const AllProviders = withWrappers(
  Suspense,
  KeyboardProvider,
  CoreStatusProvider,
  AuthProvider,
  SearchResultsProvider,
  AppStoreWebviewPrefetchProvider,
  AppStatusProvider,
  GlassesMirrorProvider,
  NavigationHistoryProvider,
  DeeplinkProvider,
  GestureHandlerRootView,
  ModalProvider,
  props => {
    const posthogApiKey = Constants.expoConfig?.extra?.POSTHOG_API_KEY

    // If no API key is provided, disable PostHog to prevent errors
    if (!posthogApiKey || posthogApiKey.trim() === "") {
      console.log("PostHog API key not found, disabling PostHog analytics")
      return <>{props.children}</>
    }

    return (
      <PostHogProvider apiKey={posthogApiKey} options={{disabled: false}}>
        {props.children}
      </PostHogProvider>
    )
  },
)
