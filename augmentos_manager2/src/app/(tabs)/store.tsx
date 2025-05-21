import React, {useRef, useState, useEffect} from "react"
import {View, StyleSheet, Text} from "react-native"
import {WebView} from "react-native-webview"
import LoadingOverlay from "@/components/misc/LoadingOverlay"
import InternetConnectionFallbackComponent from "@/components/misc/InternetConnectionFallbackComponent"
import {SafeAreaView} from "react-native-safe-area-context"
import {NativeStackScreenProps} from "@react-navigation/native-stack"
import {RootStackParamList} from "@/components/misc/types"
import FontAwesome from "react-native-vector-icons/FontAwesome"
import BackendServerComms from "@/backend_comms/BackendServerComms"
import showAlert from "@/utils/AlertUtils"
import {useAppTheme} from "@/utils/useAppTheme"
import {router, useLocalSearchParams, usePathname} from "expo-router"
import {Header, Screen} from "@/components/ignite"

export default function AppWebView() {
  const {theme, themed} = useAppTheme()
  const route = usePathname()

  // TODO: fix this
  var { packageName, appName, fromSettings, webviewURL, fromSettings }: any = useLocalSearchParams()
  webviewURL = webviewURL
  appName = appName || "App"
  packageName = packageName
  fromSettings = fromSettings === true

  const [isLoading, setIsLoading] = useState(true) // For WebView loading itself
  const [hasError, setHasError] = useState(false)
  const webViewRef = useRef<WebView>(null)

  const [finalUrl, setFinalUrl] = useState<string | null>(null)
  const [isLoadingToken, setIsLoadingToken] = useState(true)
  const [tokenError, setTokenError] = useState<string | null>(null)

  // Set up the header with settings button if we came from app settings
  // useEffect(() => {
  //   if (fromSettings && packageName) {
  //     navigation.setOptions({
  //       headerRight: () => (
  //         <View style={{ marginRight: 8 }}>
  //           <FontAwesome.Button
  //             name="cog"
  //             size={22}
  //             color={isDarkTheme ? '#FFFFFF' : '#000000'}
  //             backgroundColor="transparent"
  //             underlayColor="transparent"
  //             onPress={() => {
  //               navigation.replace('AppSettings', {
  //                 packageName,
  //                 appName,
  //                 fromWebView: true
  //               });
  //             }}
  //             style={{ padding: 0, margin: 0 }}
  //             iconStyle={{ marginRight: 0 }}
  //           />
  //         </View>
  //       )
  //     });
  //   }
  // }, [navigation, fromSettings, packageName, appName, isDarkTheme]);

  function determineCloudUrl(): string | undefined {
    const cloudHostName =
      process.env.CLOUD_PUBLIC_HOST_NAME || process.env.CLOUD_HOST_NAME || process.env.AUGMENTOS_HOST
    if (
      cloudHostName &&
      cloudHostName.trim() !== "prod.augmentos.cloud" &&
      cloudHostName.trim() !== "cloud" &&
      cloudHostName.includes(".")
    ) {
      console.log(`For TPA webview token verification, using cloud host name: ${cloudHostName}`)
      return `https://${cloudHostName}`
    }
    return undefined
  }

  // Fetch temporary token on mount
  useEffect(() => {
    const generateTokenAndSetUrl = async () => {
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
        const backendComms = BackendServerComms.getInstance()
        const tempToken = await backendComms.generateWebviewToken(packageName)
        const cloudApiUrl = determineCloudUrl()

        // Construct final URL
        const url = new URL(webviewURL)
        url.searchParams.set("aos_temp_token", tempToken)
        if (cloudApiUrl) {
          const checksum = await backendComms.hashWithApiKey(cloudApiUrl, packageName)
          url.searchParams.set("cloudApiUrl", cloudApiUrl)
          url.searchParams.set("cloudApiUrlChecksum", checksum)
        }

        setFinalUrl(url.toString())
        console.log(`Constructed final webview URL: ${url.toString()}`)
      } catch (error: any) {
        console.error("Error generating webview token:", error)
        setTokenError(`Failed to prepare secure access: ${error.message}`)
        showAlert(
          "Authentication Error",
          `Could not securely connect to ${appName}. Please try again later. Details: ${error.message}`,
          [{text: "OK", onPress: () => navigation.goBack()}], // Option to go back
        )
      } finally {
        setIsLoadingToken(false)
      }
    }

    generateTokenAndSetUrl()
  }, [packageName, webviewURL, appName]) // Dependencies

  // Handle WebView loading events
  const handleLoadStart = () => setIsLoading(true)
  const handleLoadEnd = () => setIsLoading(false)
  const handleError = (syntheticEvent: any) => {
    // Use any for syntheticEvent
    const {nativeEvent} = syntheticEvent
    console.warn("WebView error: ", nativeEvent)
    setIsLoading(false)
    setHasError(true)
    setTokenError(`Failed to load ${appName}: ${nativeEvent.description}`) // Show WebView load error
  }

  // Render loading state while fetching token
  if (isLoadingToken) {
    return (
      <View style={[styles.container, {backgroundColor: theme.colors.background}]}>
        <LoadingOverlay message={`Preparing secure access to ${appName}...`} isDarkTheme={theme.isDark} />
      </View>
    )
  }

  // Render error state if token generation failed
  if (tokenError) {
    return (
      <Screen preset="fixed" style={{flex: 1, justifyContent: "center", alignItems: "center"}}>
        <InternetConnectionFallbackComponent
          retry={() => {
            /* Implement retry logic if desired, e.g., refetch token */
          }}
        />
        <Text style={[styles.errorText, {color: theme.colors.text}]}>{tokenError}</Text>
      </Screen>
    )
  }

  // Render error state if WebView loading failed after token success
  if (hasError) {
    return (
      <Screen preset="fixed" style={{flex: 1, justifyContent: "center", alignItems: "center"}}>
        <InternetConnectionFallbackComponent
          retry={() => {
            setHasError(false)
            // Optionally re-trigger token generation or just reload
            if (webViewRef.current) {
              webViewRef.current.reload()
            }
          }}
        />
        <Text style={[styles.errorText, {color: theme.colors.text}]}>{tokenError || `Failed to load ${appName}`}</Text>
      </Screen>
    )
  }

  // Render WebView only when finalUrl is ready
  return (
    <Screen safeAreaEdges={["top"]}>
      <Header
        RightActionComponent={
          fromSettings &&
          packageName && (
            <View style={{marginRight: 8}}>
              <FontAwesome.Button
                name="cog"
                size={22}
                color={theme.isDark ? "#FFFFFF" : "#000000"}
                backgroundColor="transparent"
                underlayColor="transparent"
                onPress={() => {
                  // router.replace('AppSettings', {
                  //   packageName,
                  //   appName,
                  //   fromWebView: true
                  // });
                }}
                style={{padding: 0, margin: 0}}
                iconStyle={{marginRight: 0}}
              />
            </View>
          )
        }
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
              <LoadingOverlay message={`Loading ${appName}...`} isDarkTheme={theme.isDark} />
            )}
          />
        ) : (
          // This state should ideally not be reached if isLoadingToken handles it,
          // but added as a fallback.
          <LoadingOverlay message="Preparing..." isDarkTheme={theme.isDark} />
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
  webView: {
    flex: 1,
  },
  errorText: {
    textAlign: "center",
    paddingHorizontal: 20,
    marginBottom: 64,
  },
})
