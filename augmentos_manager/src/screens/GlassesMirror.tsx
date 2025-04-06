import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import NavigationBar from '../components/NavigationBar';
import GlassesDisplayMirror from '../components/GlassesDisplayMirror';
import { useStatus } from '../providers/AugmentOSStatusProvider';
import { useGlassesMirror } from '../providers/GlassesMirrorContext';
import { NavigationProps } from '../components/types';

interface GlassesMirrorProps {
  isDarkTheme: boolean;
}


const GlassesMirror: React.FC<GlassesMirrorProps> = ({ isDarkTheme }) => {
  const { status } = useStatus();
  const { events } = useGlassesMirror(); // From context
  const navigation = useNavigation<NavigationProps>();

  // Helper to check if we have a glasses model name
  const isGlassesConnected = !!status.glasses_info?.model_name;
  
  // Get only the last event
  const lastEvent = events.length > 0 ? events[events.length - 1] : null;
  
  // Function to navigate to fullscreen mode
  const navigateToFullScreen = () => {
    navigation.navigate('GlassesMirrorFullscreen');
  };

  return (
    <View
      style={[
        styles.container,
        isDarkTheme ? styles.darkContainer : styles.lightContainer,
      ]}
    >
      {/* Regular mode - with fixed layout */ }
        <View style={styles.regularContainer}>
          {/* Header */}
          <View
            style={[
              styles.titleContainer,
              isDarkTheme ? styles.titleContainerDark : styles.titleContainerLight,
            ]}
          >
            <Text
              style={[
                styles.title,
                isDarkTheme ? styles.titleTextDark : styles.titleTextLight,
              ]}
            >
              Glasses Mirror
            </Text>
            
            {isGlassesConnected && lastEvent && (
              <TouchableOpacity
                style={styles.fullscreenButton}
                onPress={navigateToFullScreen}
              >
                <Text style={styles.fullscreenButtonText}>
                  Enter Fullscreen
                </Text>
              </TouchableOpacity>
            )}
          </View>
          
          {/* Content */}
          <View style={styles.contentWrapper}>
            {isGlassesConnected ? (
              <View style={styles.contentContainer}>
                {lastEvent ? (
                  <GlassesDisplayMirror 
                    layout={lastEvent.layout} 
                    fallbackMessage="Unknown layout data"
                  />
                ) : (
                  <View style={styles.fallbackContainer}>
                    <Text style={[isDarkTheme ? styles.darkText : styles.lightText, styles.fallbackText]}>
                      No display events available
                    </Text>
                  </View>
                )}
              </View>
            ) : (
              <View style={styles.fallbackContainer}>
                <Text style={[isDarkTheme ? styles.darkText : styles.lightText, styles.fallbackText]}>
                  Connect glasses to use the Glasses Mirror
                </Text>
              </View>
            )}
          </View>
          
          {/* Navigation bar at the bottom */}
          <View style={styles.navbarWrapper}>
            <NavigationBar isDarkTheme={isDarkTheme} toggleTheme={() => {}} />
          </View>
        </View>
      
    </View>
  );
};


const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 0,
  },
  darkContainer: {
    backgroundColor: '#121212',
  },
  lightContainer: {
    backgroundColor: '#f8f9fa',
  },
  // Regular layout container with proper stacking
  regularContainer: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  titleContainer: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 60, // Match the Header.tsx height
    ...Platform.select({
      ios: {
        paddingTop: 16,
      },
      android: {
        paddingTop: 16,
      },
    }),
  },
  titleContainerDark: {
    backgroundColor: '#333333',
  },
  titleContainerLight: {
    backgroundColor: '#ffffff',
  },
  contentWrapper: {
    flex: 1,
    paddingBottom: 0,
  },
  navbarWrapper: {
    width: '100%',
    height: 64, // Fixed height for the navbar
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: 'Montserrat-Bold',
    textAlign: 'left',
    flex: 1,
  },
  titleTextDark: {
    color: '#ffffff',
    fontFamily: 'Montserrat-Bold',
  },
  titleTextLight: {
    color: '#000000',
    fontFamily: 'Montserrat-Bold',
  },
  darkText: {
    color: '#ffffff',
    fontFamily: 'Montserrat-Regular',
  },
  lightText: {
    color: '#000000',
    fontFamily: 'Montserrat-Regular',
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenDisplayContainer: {
    padding: 0,
    backgroundColor: 'transparent',
  },
  // Fallback
  fallbackContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fallbackText: {
    fontSize: 16,
    textAlign: 'center',
    marginHorizontal: 20,
  },
  // Fullscreen mode styles
  fullscreenButton: {
    backgroundColor: '#4c8bf5',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignSelf: 'center',
  },
  fullscreenButtonText: {
    color: 'white',
    fontSize: 14,
    fontFamily: 'Montserrat-Bold',
  },
});

export default GlassesMirror;