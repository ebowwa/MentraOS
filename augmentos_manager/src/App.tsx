import React, {useEffect, useState} from 'react';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {
  getStateFromPath,
  NavigationContainer,
  useNavigationContainerRef,
} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {StatusProvider} from './providers/AugmentOSStatusProvider';
import {AppStatusProvider} from './providers/AppStatusProvider';
import Homepage from './screens/Homepage';
import SettingsPage from './screens/SettingsPage';
// import IntroScreen from './screens/IntroScreen';
import RegisterScreen from './screens/RegisterScreen';
import ProfileSettingsPage from './screens/ProfileSettingsPage';
import GlassesMirror from './screens/GlassesMirror';
import GlassesMirrorFullscreen from './screens/GlassesMirrorFullscreen';
import NotificationListener from './components/NotificationListener';
import AppStore from './screens/AppStore';
import AppStoreNative from './screens/AppStoreNative';
import AppStoreWeb from './screens/AppStoreWebview';
import AppWebView from './screens/AppWebView';
import AppDetails from './screens/AppDetails';
import Reviews from './screens/ReviewSection';
import {Linking, StyleSheet, Text, View} from 'react-native';
import {AppStoreItem, RootStackParamList} from './components/types'; // Update path as needed
import MessageBanner from './components/MessageBanner';
import {ModalProvider} from './utils/AlertUtils';
import SelectGlassesModelScreen from './screens/SelectGlassesModelScreen';
import GlassesPairingGuideScreen from './screens/GlassesPairingGuideScreen';
import SelectGlassesBluetoothScreen from './screens/SelectGlassesBluetoothScreen';
import PhoneNotificationSettings from './screens/PhoneNotificationSettings';
import {SearchResultsProvider} from './providers/SearchResultsContext';
import AppSettings from './screens/AppSettings';
import LoginScreen from './screens/LoginScreen';
import SplashScreen from './screens/SplashScreen';
import 'react-native-url-polyfill/auto';
import {AuthProvider, useAuth} from './AuthContext';
import VerifyEmailScreen from './screens/VerifyEmail';
import PrivacySettingsScreen from './screens/PrivacySettingsScreen';
import GrantPermissionsScreen from './screens/GrantPermissionsScreen';
import ConnectingToPuckComponent from './components/ConnectingToPuckComponent';
import VersionUpdateScreen from './screens/VersionUpdateScreen';
import {GlassesMirrorProvider} from './providers/GlassesMirrorContext';
import GlassesPairingGuidePreparationScreen from './screens/GlassesPairingGuidePreparationScreen';
import ErrorReportScreen from './screens/ErrorReportScreen';
import {saveSetting} from './logic/SettingsHelper';
import WelcomePageComponent from './components/WelcomePageComponent.tsx';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import DeveloperSettingsScreen from './screens/DeveloperSettingsScreen.tsx';
import DashboardSettingsScreen from './screens/DashboardSettingsScreen.tsx';
import ScreenSettingsScreen from './screens/ScreenSettingsScreen.tsx';
import NavigationBar from './components/NavigationBar';
import Routes from './Routes.tsx';

// Assign the RootStackParamList to the navigator
const Stack = createNativeStackNavigator<RootStackParamList>();

const App: React.FC = () => {
  const [isDarkTheme, setIsDarkTheme] = useState(false);
  const [currentRouteName, setCurrentRouteName] = useState<string>('');
  const navigationRef = useNavigationContainerRef();
  const {user, loading} = useAuth();

  // Reset ignoreVersionCheck setting on app start
  useEffect(() => {
    saveSetting('ignoreVersionCheck', false);
    console.log('Reset version check ignore flag on app start');
  }, []);

  const toggleTheme = () => {
    setIsDarkTheme(prevTheme => !prevTheme);
  };

  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaProvider>
        <NotificationListener>
          <AuthProvider>
            <StatusProvider>
              <AppStatusProvider>
                <SearchResultsProvider>
                  <GlassesMirrorProvider>
                    <MessageBanner />
                    <ModalProvider isDarkTheme={isDarkTheme} />
                    <Routes isDarkTheme={isDarkTheme} toggleTheme={toggleTheme}/>
                  </GlassesMirrorProvider>
                </SearchResultsProvider>
              </AppStatusProvider>
            </StatusProvider>
          </AuthProvider>
        </NotificationListener>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  mainContainer: {
    flex: 1,
    flexDirection: 'column',
    overflow: 'hidden',
  },
  contentContainer: {
    flex: 1,
  },
});

export default App;
