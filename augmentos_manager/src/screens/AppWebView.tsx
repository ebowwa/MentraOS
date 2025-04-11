import React, { useRef, useState, useLayoutEffect } from 'react';
import { View, StyleSheet, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import { WebView } from 'react-native-webview';
import { useStatus } from '../providers/AugmentOSStatusProvider';
import LoadingOverlay from '../components/LoadingOverlay';
import InternetConnectionFallbackComponent from '../components/InternetConnectionFallbackComponent';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../components/types';
import FontAwesome from 'react-native-vector-icons/FontAwesome';

type AppWebViewProps = NativeStackScreenProps<RootStackParamList, 'AppWebView'> & {
  isDarkTheme: boolean;
  toggleTheme: () => void;
};

const AppWebView: React.FC<AppWebViewProps> = ({ route, navigation, isDarkTheme, toggleTheme }) => {
  const webviewURL = route.params?.webviewURL;
  const appName = route.params?.appName || 'App';
  const packageName = route.params?.packageName;
  const fromSettings = route.params?.fromSettings === true;
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const webViewRef = useRef(null);

  // Set up the header with settings button if we came from app settings
  useLayoutEffect(() => {
    if (fromSettings && packageName) {
      navigation.setOptions({
        headerRight: () => (
          <View style={{ marginRight: 8 }}>
            <FontAwesome.Button
              name="cog"
              size={22}
              color={isDarkTheme ? '#FFFFFF' : '#000000'}
              backgroundColor="transparent"
              underlayColor="transparent"
              onPress={() => {
                navigation.replace('AppSettings', {
                  packageName,
                  appName,
                  fromWebView: true
                });
              }}
              style={{ padding: 0, margin: 0 }}
              iconStyle={{ marginRight: 0 }}
            />
          </View>
        )
      });
    }
  }, [navigation, fromSettings, packageName, appName, isDarkTheme]);

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

  // Handle WebView loading events
  const handleLoadStart = () => setIsLoading(true);
  const handleLoadEnd = () => setIsLoading(false);
  const handleError = () => {
    setIsLoading(false);
    setHasError(true);
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.backgroundColor }}>
      {hasError ? (
        <InternetConnectionFallbackComponent 
          retry={() => setHasError(false)} 
          isDarkTheme={isDarkTheme} 
        />
      ) : (
        <WebView
          ref={webViewRef}
          source={{ uri: webviewURL }}
          style={styles.webView}
          onLoadStart={handleLoadStart}
          onLoadEnd={handleLoadEnd}
          onError={handleError}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={true}
          renderLoading={() => (
            <LoadingOverlay 
              message={`Loading ${appName} website...`} 
              isDarkTheme={isDarkTheme} 
            />
          )}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  webView: {
    flex: 1,
  }
});

export default AppWebView;