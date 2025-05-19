import { SplashScreen } from "expo-router"
import "react-native-reanimated"
import { withWrappers, } from "@/utils/with-wrappers"
import { Suspense } from "react"
import { KeyboardProvider } from "react-native-keyboard-controller"

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync()


export const AllProviders = withWrappers(
  Suspense,
  KeyboardProvider,
)
