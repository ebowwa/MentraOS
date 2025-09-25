import React, {useRef, useState, useEffect, useCallback} from "react"
import {View, StyleSheet, Text, BackHandler} from "react-native"
import {WebView} from "react-native-webview"
import LoadingOverlay from "@/components/misc/LoadingOverlay"
import InternetConnectionFallbackComponent from "@/components/misc/InternetConnectionFallbackComponent"
import {SafeAreaView} from "react-native-safe-area-context"
import FontAwesome from "react-native-vector-icons/FontAwesome"
import RestComms from "@/managers/RestComms"
import showAlert from "@/utils/AlertUtils"
import {useAppTheme} from "@/utils/useAppTheme"
import {router, useLocalSearchParams, useFocusEffect} from "expo-router"
import {Header, Screen} from "@/components/ignite"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import restComms from "@/managers/RestComms"

export default function AppWebView() {
  //   const webviewURL = route.params?.webviewURL;
  //   const appName = route.params?.appName || 'App';
  //   const packageName = route.params?.packageName;
  //   const fromSettings = route.params?.fromSettings === true;
  const {themed, theme} = useAppTheme()
  const {webviewURL, appName, packageName, fromSettings} = useLocalSearchParams()
  const isFromSettings = fromSettings === "true"
  const [isLoading, setIsLoading] = useState(true) // For WebView loading itself
  const [hasError, setHasError] = useState(false)
  const webViewRef = useRef<WebView>(null)

  const [finalUrl, setFinalUrl] = useState<string | null>(null)
  const [isLoadingToken, setIsLoadingToken] = useState(true)
  const [tokenError, setTokenError] = useState<string | null>(null)
  const [retryTrigger, setRetryTrigger] = useState(0) // Trigger for retrying token generation
  const {replace, goBack, push, navigate, clearHistoryAndGoHome} = useNavigationHistory()

  if (typeof webviewURL !== "string" || typeof appName !== "string" || typeof packageName !== "string") {
    return <Text>Missing required parameters</Text>
  }

  // Handle Android back button
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        // Go back to previous screen
        goBack()
        return true
      }

      BackHandler.addEventListener("hardwareBackPress", onBackPress)

      return () => BackHandler.removeEventListener("hardwareBackPress", onBackPress)
    }, [goBack]),
  )

  // Set up the header with settings button if we came from app settings
  //   useEffect(() => {
  //     if (fromSettings && packageName) {
  //       navigation.setOptions({
  //         headerRight: () => (
  //           <View style={{ marginRight: 8 }}>
  //             <FontAwesome.Button
  //               name="cog"
  //               size={22}
  //               color={isDarkTheme ? '#FFFFFF' : '#000000'}
  //               backgroundColor="transparent"
  //               underlayColor="transparent"
  //               onPress={() => {
  //                 navigation.replace('AppSettings', {
  //                   packageName,
  //                   appName,
  //                   fromWebView: true
  //                 });
  //               }}
  //               style={{ padding: 0, margin: 0 }}
  //               iconStyle={{ marginRight: 0 }}
  //             />
  //           </View>
  //         )
  //       });
  //     }
  //   }, [fromSettings, packageName, appName]);

  function determineCloudUrl(): string | undefined {
    const cloudHostName = process.env.CLOUD_PUBLIC_HOST_NAME || process.env.CLOUD_HOST_NAME || process.env.MENTRAOS_HOST
    if (
      cloudHostName &&
      cloudHostName.trim() !== "prod.augmentos.cloud" &&
      cloudHostName.trim() !== "cloud" &&
      cloudHostName.includes(".")
    ) {
      console.log(`For App webview token verification, using cloud host name: ${cloudHostName}`)
      return `https://${cloudHostName}`
    }
    return undefined
  }

  // Theme colors
  const theme2 = {
    backgroundColor: theme.isDark ? "#1c1c1c" : "#f9f9f9",
    headerBg: theme.isDark ? "#333333" : "#fff",
    textColor: theme.isDark ? "#FFFFFF" : "#333333",
    secondaryTextColor: theme.isDark ? "#aaaaaa" : "#777777",
    borderColor: theme.isDark ? "#444444" : "#e0e0e0",
    buttonBg: theme.isDark ? "#444444" : "#eeeeee",
    buttonTextColor: theme.isDark ? "#ffffff" : "#333333",
    primaryColor: theme.colors.palette.primary300,
  }

  // Fetch temporary token on mount
  useEffect(() => {
    const generateTokenAndSetUrl = async () => {
      console.log("WEBVIEW: generateTokenAndSetUrl()")
      setIsLoadingToken(true)
      setTokenError(null)

      if (!packageName) {
        setTokenError("App package name is missing. Cannot authenticate.")
        setIsLoadingToken(false)
        return
      }
      if (!webviewURL) {
        setTokenError("Webview URL is missing.")
        setIsLoadingToken(false)
        return
      }

      try {
        const tempToken = await restComms.generateWebviewToken(packageName)
        let signedUserToken: string | undefined
        try {
          signedUserToken = await restComms.generateWebviewToken(packageName, "generate-webview-signed-user-token")
        } catch (error) {
          console.warn("Failed to generate signed user token:", error)
          signedUserToken = undefined
        }
        const cloudApiUrl = determineCloudUrl()

        // Construct final URL
        const url = new URL(webviewURL)
        url.searchParams.set("aos_temp_token", tempToken)
        if (signedUserToken) {
          url.searchParams.set("aos_signed_user_token", signedUserToken)
        }
        if (cloudApiUrl) {
          const checksum = await restComms.hashWithApiKey(cloudApiUrl, packageName)
          url.searchParams.set("cloudApiUrl", cloudApiUrl)
          url.searchParams.set("cloudApiUrlChecksum", checksum)
        }

        setFinalUrl(url.toString())
        console.log(`Constructed final webview URL: ${url.toString()}`)
      } catch (error: any) {
        console.error("Error generating webview token:", error)
        setTokenError(`Failed to prepare secure access: ${error.message}`)
        showAlert("Authentication Error", `Could not securely connect to ${appName}. Please try again later.`, [
          {text: "OK", onPress: () => goBack()},
        ])
      } finally {
        setIsLoadingToken(false)
      }
    }

    generateTokenAndSetUrl()
  }, [packageName, webviewURL, appName, retryTrigger]) // Dependencies

  // Handle WebView loading events
  const handleLoadStart = () => setIsLoading(true)
  const handleLoadEnd = () => {
    setIsLoading(false)
    setHasError(false)
  }
  const handleError = (syntheticEvent: any) => {
    // Use any for syntheticEvent
    const {nativeEvent} = syntheticEvent
    console.warn("WebView error: ", nativeEvent)
    setIsLoading(false)
    setHasError(true)

    // Parse error message to show user-friendly text
    const errorDesc = nativeEvent.description || ""
    let friendlyMessage = `Unable to load ${appName}`

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
      friendlyMessage = `Unable to connect to ${appName}. Please try again later.`
    } else if (errorDesc.includes("ERR_SSL") || errorDesc.includes("ERR_CERT")) {
      friendlyMessage = "Security error. Please check your device's date and time settings."
    } else if (errorDesc) {
      // For any other errors, just show a generic message without the technical error
      friendlyMessage = `Unable to load ${appName}. Please try again.`
    }

    setTokenError(friendlyMessage)
  }

  // Render loading state while fetching token
  if (isLoadingToken) {
    return (
      <View style={[styles.container, {backgroundColor: theme2.backgroundColor}]}>
        <LoadingOverlay message={`Preparing secure access to ${appName}...`} />
      </View>
    )
  }

  // Render error state if token generation failed
  if (tokenError && !isLoadingToken) {
    return (
      <View style={[styles.container, {backgroundColor: theme2.backgroundColor}]}>
        <InternetConnectionFallbackComponent
          retry={() => {
            // Reset state and retry token generation
            setTokenError(null)
            setRetryTrigger(prev => prev + 1) // Trigger useEffect to retry
          }}
          message={tokenError}
        />
      </View>
    )
  }

  // Render error state if WebView loading failed after token success
  if (hasError) {
    return (
      <View style={[styles.container, {backgroundColor: theme2.backgroundColor}]}>
        <InternetConnectionFallbackComponent
          retry={() => {
            setHasError(false)
            setTokenError(null)
            if (webViewRef.current) {
              webViewRef.current.reload()
            }
          }}
          message={tokenError || `Unable to load ${appName}. Please check your connection and try again.`}
        />
      </View>
    )
  }

  // Render WebView only when finalUrl is ready
  return (
    <Screen preset="fixed" safeAreaEdges={[]}>
      <Header
        title={appName}
        titleMode="center"
        leftIcon="caretLeft"
        onLeftPress={() => goBack()}
        rightIcon="settings"
        rightIconColor={theme.colors.icon}
        onRightPress={() => {
          push("/applet/settings", {
            packageName: packageName as string,
            appName: appName as string,
            fromWebView: "true",
          })
        }}
        style={{height: 44}}
        containerStyle={{paddingTop: 0}}
      />
      <View style={styles.container}>
        {finalUrl ? (
          <WebView
            ref={webViewRef}
            source={{uri: finalUrl}} // Use the final URL with the token
            style={styles.webView}
            onLoadStart={handleLoadStart}
            onLoadEnd={handleLoadEnd}
            onError={handleError}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            startInLoadingState={true} // Keep this true for WebView's own loading indicator
            renderLoading={() => (
              // Show loading overlay while WebView itself loads
              <LoadingOverlay message={`Loading ${appName}...`} />
            )}
            // Disable zooming and scaling
            scalesPageToFit={false}
            scrollEnabled={true}
            bounces={false}
            // iOS specific props to disable zoom
            automaticallyAdjustContentInsets={false}
            contentInsetAdjustmentBehavior="never"
            // Inject meta viewport tag to prevent zooming
            injectedJavaScript={`
              const meta = document.createElement('meta');
              meta.setAttribute('name', 'viewport');
              meta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
              document.getElementsByTagName('head')[0].appendChild(meta);
              true;
            `}
          />
        ) : (
          // This state should ideally not be reached if isLoadingToken handles it,
          // but added as a fallback.
          <LoadingOverlay message="Preparing..." />
        )}
        {/* Show loading overlay specifically for the WebView loading phase */}
        {/* {isLoading && finalUrl && (
           <LoadingOverlay message={`Loading ${appName}...`} isDarkTheme={isDarkTheme} />
        )} */}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  errorText: {
    marginTop: -40,
    paddingHorizontal: 20,
    textAlign: "center",
  },
  webView: {
    flex: 1,
  },
})
