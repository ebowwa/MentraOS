import React, { useRef, useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, Text, ActivityIndicator, BackHandler } from 'react-native';
import { WebView } from 'react-native-webview';
import Config from 'react-native-config';
import InternetConnectionFallbackComponent from '../components/InternetConnectionFallbackComponent';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from '../components/types';
import BackendServerComms from '../backend_comms/BackendServerComms';
import { useAppStatus } from '../providers/AppStatusProvider';

// Define package name for the store webview
const STORE_PACKAGE_NAME = 'org.augmentos.store';

interface AppStoreWebProps {
  isDarkTheme: boolean;
  route?: RouteProp<RootStackParamList, 'AppStoreWeb'>;
}

const AppStoreWeb: React.FC<AppStoreWebProps> = ({ isDarkTheme, route }) => {
  const [webviewLoading, setWebviewLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const packageName = route?.params?.packageName;
  const webViewRef = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [appStoreUrl, setAppStoreUrl] = useState<string>('');
  const {refreshAppStatus} = useAppStatus();


  // Theme colors
  const theme = {
    backgroundColor: isDarkTheme ? '#1c1c1c' : '#f9f9f9',
    headerBg: isDarkTheme ? '#333333' : '#fff',
    textColor: isDarkTheme ? '#FFFFFF' : '#333333',
    secondaryTextColor: isDarkTheme ? '#aaaaaa' : '#777777',
    borderColor: isDarkTheme ? '#444444' : '#e0e0e0',
    buttonBg: isDarkTheme ? '#444444' : '#eeeeee',
    buttonTextColor: isDarkTheme ? '#ffffff' : '#333333',
    primaryColor: '#0088FF'
  };

  // Initialize the URL with a temporary token
  useEffect(() => {
    const initUrl = async () => {
      try {
        // Get the base URL for the store
        const baseUrl = Config.AUGMENTOS_APPSTORE_URL || 'https://store.augmentos.org/webview';
        
        // Generate a temporary token for the store
        const backendComms = BackendServerComms.getInstance();
        const tempToken = await backendComms.generateWebviewToken(STORE_PACKAGE_NAME);
        
        // Create the URL with the token
        const urlWithToken = new URL(baseUrl);
        urlWithToken.searchParams.append('aos_temp_token', tempToken);
        
        // Add package name if provided (for direct navigation to app details)
        if (packageName) {
          urlWithToken.pathname = `/package/${packageName}`;
        }
        
        setAppStoreUrl(urlWithToken.toString());
        setWebviewLoading(false);
      } catch (error) {
        console.error('Error generating temporary token for store:', error);
        // Fallback to using the base URL without token
        const baseUrl = Config.AUGMENTOS_APPSTORE_URL || 'https://store.augmentos.org/webview';
        const url = packageName ? `${baseUrl}/package/${packageName}` : baseUrl;
        setAppStoreUrl(url);
        setWebviewLoading(false);
      }
    };

    initUrl();
  }, [packageName]);

  // Handle WebView loading events
  const handleLoadStart = () => setWebviewLoading(true);
  const handleLoadEnd = () => setWebviewLoading(false);
  const handleError = () => {
    setWebviewLoading(false);
    setHasError(true);
  };

  // Handle Android back button press
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (webViewRef.current && canGoBack) {
          webViewRef.current.goBack();
          return true; // Prevent default back action
        }
        return false; // Allow default back action (close screen)
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);

      return () => subscription.remove(); // Cleanup listener on blur
    }, [canGoBack]) // Re-run effect if canGoBack changes
  );

  // propagate any changes in app lists when this screen is unmounted:
  useFocusEffect(
    useCallback(() => {
      return async () => {
        await refreshAppStatus();
      };
    }, []),
  );

  // Show loading state while getting the URL
  if (!appStoreUrl) {
    return (
      <View style={[styles.loadingOverlay, { backgroundColor: theme.backgroundColor }]}>
        <ActivityIndicator size="large" color={theme.primaryColor} />
        <Text style={[styles.loadingText, { color: theme.textColor }]}>
          Preparing App Store...
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      {hasError ? (
        <InternetConnectionFallbackComponent 
          retry={() => setHasError(false)} isDarkTheme={false} />
      ) : (
        <View style={styles.webViewContainer}>
          <WebView
            ref={webViewRef}
            source={{ uri: appStoreUrl }}
            style={styles.webView}
            onLoadStart={handleLoadStart}
            onLoadEnd={handleLoadEnd}
            onError={handleError}
            onNavigationStateChange={navState => setCanGoBack(navState.canGoBack)}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            startInLoadingState={true}
            renderLoading={() => (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color={theme.primaryColor} />
                <Text style={[styles.loadingText, { color: theme.textColor }]}>
                  Loading App Store...
                </Text>
              </View>
            )}
          />
          {/* {webviewLoading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color={theme.primaryColor} />
              <Text style={[styles.loadingText, { color: theme.textColor }]}>
                Loading App Store...
              </Text>
            </View>
          )} */}
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webViewContainer: {
    flex: 1,
  },
  webView: {
    flex: 1,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    fontFamily: 'Montserrat-Regular',
  },
});

export default AppStoreWeb;