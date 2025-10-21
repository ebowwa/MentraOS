import {withWrappers} from "@/utils/structure/with-wrappers"
import {Suspense} from "react"
import {KeyboardProvider} from "react-native-keyboard-controller"
import {CoreStatusProvider} from "@/contexts/CoreStatusProvider"
import {GestureHandlerRootView} from "react-native-gesture-handler"
import {AuthProvider} from "@/contexts/AuthContext"
import {SearchResultsProvider} from "@/contexts/SearchResultsContext"
import {AppStoreWebviewPrefetchProvider} from "@/contexts/AppStoreWebviewPrefetchProvider"
import {ModalProvider} from "@/utils/AlertUtils"
import {NavigationHistoryProvider} from "@/contexts/NavigationHistoryContext"
import {DeeplinkProvider} from "@/contexts/DeeplinkContext"
import {PostHogProvider} from "posthog-react-native"
import Constants from "expo-constants"
import {useAppTheme, useThemeProvider} from "@/utils/useAppTheme"
import {TextStyle, View, ViewStyle} from "react-native"
import BackgroundGradient from "@/components/misc/BackgroundGradient"
import {Text} from "@/components/ignite"
import Toast from "react-native-toast-message"
import {ThemedStyle} from "@/theme"

// components at the top wrap everything below them in order:
export const AllProviders = withWrappers(
  props => {
    const {themeScheme, setThemeContextOverride, ThemeProvider} = useThemeProvider()
    return <ThemeProvider value={{themeScheme, setThemeContextOverride}}>{props.children}</ThemeProvider>
  },
  Suspense,
  KeyboardProvider,
  CoreStatusProvider,
  AuthProvider,
  SearchResultsProvider,
  AppStoreWebviewPrefetchProvider,
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
  props => {
    return (
      <View style={{flex: 1}}>
        <BackgroundGradient>{props.children}</BackgroundGradient>
      </View>
    )
  },
  props => {
    const {themed} = useAppTheme()
    const toastConfig = {
      baseToast: ({text1, props}: {text1?: string; props?: {icon?: React.ReactNode}}) => (
        <View style={themed($toastContainer)}>
          {props?.icon && <View style={themed($toastIcon)}>{props.icon}</View>}
          <Text text={text1} style={themed($toastText)} />
        </View>
      ),
    }
    return (
      <>
        {props.children}
        <Toast config={toastConfig} />
      </>
    )
  },
)

const $toastIcon: ThemedStyle<ViewStyle> = ({spacing}) => ({
  marginRight: spacing.md,
  justifyContent: "center",
  alignItems: "center",
})

const $toastText: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  color: colors.text,
  fontSize: spacing.md,
})

const $toastContainer: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  flexDirection: "row",
  alignItems: "center",
  backgroundColor: colors.background,
  borderRadius: spacing.md,
  paddingVertical: spacing.sm,
  paddingHorizontal: spacing.md,
  marginHorizontal: spacing.md,
})
