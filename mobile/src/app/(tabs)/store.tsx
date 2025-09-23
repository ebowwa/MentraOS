import React, {useRef, useState, useCallback, useEffect, useMemo} from "react"
import {View, StyleSheet, ActivityIndicator, BackHandler} from "react-native"
import {WebView} from "react-native-webview"
import Config from "react-native-config"
import InternetConnectionFallbackComponent from "@/components/misc/InternetConnectionFallbackComponent"
import {RouteProp, useFocusEffect} from "@react-navigation/native"
import {RootStackParamList} from "@/components/misc/types"
import {useAppStatus} from "@/contexts/AppletStatusProvider"
import {useAppStoreWebviewPrefetch} from "@/contexts/AppStoreWebviewPrefetchProvider"
import {useAppTheme} from "@/utils/useAppTheme"
import {useLocalSearchParams, router} from "expo-router"
import {Text, Screen, Header} from "@/components/ignite"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"

// Define package name for the store webview
const STORE_PACKAGE_NAME = "org.augmentos.store"

export default function AppStoreWeb() {
  const [webviewLoading, setWebviewLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  // const packageName = route?.params?.packageName;
  const {packageName} = useLocalSearchParams()
  const [canGoBack, setCanGoBack] = useState(false)
  const {push} = useNavigationHistory()
  const {
    appStoreUrl,
    webviewLoading: prefetchedWebviewLoading,
    webViewRef: prefetchedWebviewRef,
  } = useAppStoreWebviewPrefetch()
  const {refreshAppStatus} = useAppStatus()
  const {theme, themed} = useAppTheme()

  // Construct the final URL with packageName if provided
  const finalUrl = useMemo(() => {
    if (!appStoreUrl) return null

    const url = new URL(appStoreUrl)
    console.log("AppStoreWeb: appStoreUrl", appStoreUrl)
    console.log("AppStoreWeb: packageName", packageName)
    if (packageName && typeof packageName === "string") {
      // If packageName is provided, update the path to point to the app details page
      url.pathname = `/package/${packageName}`
    }
    url.searchParams.set("theme", theme.isDark ? "dark" : "light")
    console.log("AppStoreWeb: finalUrl", url.toString())
    return url.toString()
  }, [appStoreUrl, packageName])

  // Theme colors - using theme system instead of hardcoded values
  const theme2 = {
    backgroundColor: theme.colors.background,
    headerBg: theme.colors.background,
    textColor: theme.colors.text,
    secondaryTextColor: theme.colors.textDim,
    borderColor: theme.colors.border,
    buttonBg: theme.colors.palette.gray200,
    buttonTextColor: theme.colors.text,
    primaryColor: theme.colors.palette.blue500,
  }

  // Handle WebView loading events
  const handleLoadStart = () => setWebviewLoading(true)
  const handleLoadEnd = () => {
    setWebviewLoading(false)
    setHasError(false)
  }

  const handleError = (syntheticEvent: any) => {
    const {nativeEvent} = syntheticEvent
    console.error("WebView error:", nativeEvent)
    setWebviewLoading(false)
    setHasError(true)

    // Parse error message to show user-friendly text
    const errorDesc = nativeEvent.description || ""
    let friendlyMessage = "Unable to load the App Store"

    if (
      errorDesc.includes("ERR_INTERNET_DISCONNECTED") ||
      errorDesc.includes("ERR_NETWORK_CHANGED") ||
      errorDesc.includes("ERR_CONNECTION_FAILED") ||
      errorDesc.includes("ERR_NAME_NOT_RESOLVED")
    ) {
      friendlyMessage = "No internet connection. Please check your network settings and try again."
    } else if (errorDesc.includes("ERR_CONNECTION_TIMED_OUT") || errorDesc.includes("ERR_TIMED_OUT")) {
      friendlyMessage = "Connection timed out. Please check your internet connection and try again."
    } else if (errorDesc.includes("ERR_CONNECTION_REFUSED")) {
      friendlyMessage = "Unable to connect to the App Store server. Please try again later."
    } else if (errorDesc.includes("ERR_SSL") || errorDesc.includes("ERR_CERT")) {
      friendlyMessage = "Security error. Please check your device's date and time settings."
    } else if (errorDesc) {
      // For any other errors, just show a generic message without the technical error
      friendlyMessage = "Unable to load the App Store. Please try again."
    }

    setErrorMessage(friendlyMessage)
  }

  const handleRetry = () => {
    setHasError(false)
    setErrorMessage("")
    if (prefetchedWebviewRef.current) {
      prefetchedWebviewRef.current.reload()
    }
  }

  // Handle messages from WebView
  const handleWebViewMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data)

      if ((data.type === "OPEN_APP_SETTINGS" || data.type === "OPEN_TPA_SETTINGS") && data.packageName) {
        // Navigate to TPA settings page
        push("/applet/settings", {packageName: data.packageName})
      }
    } catch (error) {
      console.error("Error handling WebView message:", error)
    }
  }

  // Handle Android back button press
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (prefetchedWebviewRef.current && canGoBack) {
          prefetchedWebviewRef.current.goBack()
          return true // Prevent default back action
        }
        return false // Allow default back action (close screen)
      }

      const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress)

      return () => subscription.remove() // Cleanup listener on blur
    }, [canGoBack, prefetchedWebviewRef]), // Re-run effect if canGoBack or ref changes
  )

  // propagate any changes in app lists when this screen is unmounted:
  useFocusEffect(
    useCallback(() => {
      return async () => {
        await refreshAppStatus()
      }
    }, []),
  )

  // Show loading state while getting the URL
  if (!finalUrl) {
    return (
      <Screen preset="fixed" style={{paddingHorizontal: theme.spacing.lg}}>
        <Header leftTx="store:title" />
        <View
          style={[
            styles.loadingContainer,
            {backgroundColor: theme.colors.background, marginHorizontal: -theme.spacing.lg},
          ]}>
          <ActivityIndicator size="large" color={theme2.primaryColor} />
          <Text text="Preparing App Store..." style={[styles.loadingText, {color: theme2.textColor}]} />
        </View>
      </Screen>
    )
  }

  if (hasError) {
    return (
      <Screen preset="fixed" style={{paddingHorizontal: theme.spacing.lg}}>
        <Header leftTx="store:title" />
        <InternetConnectionFallbackComponent
          retry={handleRetry}
          message={errorMessage || "Unable to load the App Store. Please check your connection and try again."}
        />
      </Screen>
    )
  }

  // If the prefetched WebView is ready, show it in the correct style
  return (
    <Screen preset="fixed" style={{paddingHorizontal: theme.spacing.lg}}>
      <Header leftTx="store:title" />
      <View
        style={[
          styles.webViewContainer,
          {backgroundColor: theme.colors.background, marginHorizontal: -theme.spacing.lg},
        ]}>
        {/* Show the prefetched WebView, but now visible and full size */}
        <WebView
          ref={prefetchedWebviewRef}
          source={{uri: finalUrl}}
          style={[styles.webView, {backgroundColor: theme.colors.background}]}
          onLoadStart={() => setWebviewLoading(true)}
          onLoadEnd={() => setWebviewLoading(false)}
          onError={handleError}
          onNavigationStateChange={navState => setCanGoBack(navState.canGoBack)}
          onMessage={handleWebViewMessage}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={true}
          scalesPageToFit={false}
          bounces={false}
          scrollEnabled={true}
          injectedJavaScript={`
              const meta = document.createElement('meta');
              meta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
              meta.setAttribute('name', 'viewport');
              document.getElementsByTagName('head')[0].appendChild(meta);
              true;
            `}
          renderLoading={() => (
            <View style={[styles.loadingOverlay, {backgroundColor: theme.colors.background}]}>
              <ActivityIndicator size="large" color={theme2.primaryColor} />
              <Text text="Loading App Store..." style={[styles.loadingText, {color: theme2.textColor}]} />
            </View>
          )}
        />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingOverlay: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0, // Keep this overlay as is since it's theme-neutral
  },
  loadingText: {
    fontSize: 16,
    marginTop: 10,
  },
  webView: {
    flex: 1,
  },
  webViewContainer: {
    flex: 1,
  },
})
