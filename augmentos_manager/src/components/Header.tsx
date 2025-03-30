import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Alert, AppState } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { checkNotificationAccessSpecialPermission, checkAndRequestNotificationAccessSpecialPermission } from '../utils/NotificationServiceUtils';

interface HeaderProps {
  isDarkTheme: boolean;
  navigation: any;
}

const Header: React.FC<HeaderProps> = ({ isDarkTheme, navigation }) => {
  const [isDropdownVisible, setDropdownVisible] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(true);
  const [hasNotificationListenerPermission, setHasNotificationListenerPermission] = useState(true);
  const [appState, setAppState] = useState(AppState.currentState);

  // Check notification listener permission when component mounts
  // and when app comes back to foreground
  useEffect(() => {
    const checkPermission = async () => {
      if (Platform.OS === 'android') {
        const hasPermission = await checkNotificationAccessSpecialPermission();
        setHasNotificationListenerPermission(hasPermission);
      }
    };

    // Check permission on component mount
    checkPermission();
    
    // Set up AppState listener to check permission when app comes back to foreground
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appState.match(/inactive|background/) && nextAppState === 'active') {
        // App has come to the foreground
        console.log('App has come to foreground, checking notification permission');
        checkPermission();
      }
      setAppState(nextAppState);
    });

    // Clean up subscription
    return () => {
      subscription.remove();
    };
  }, [appState]);

  const handleLogout = () => {
    setIsLoggedIn(false);
    setDropdownVisible(false);
    if (navigation) {
      navigation.navigate('Intro');
    } else {
      console.error('Navigation prop is undefined');
    }
  };

  const handleProfileSettings = () => {
    if (navigation) {
      navigation.navigate('ProfileSettings');
    } else {
      console.error('Navigation prop is undefined');
    }
  };

  const handleNotificationAlert = () => {
    Alert.alert(
      'Notification Access Required',
      'AugmentOS needs permission to read your notifications to display them on your smart glasses. This enhances your experience by mirroring phone notifications to your glasses.',
      [
        {
          text: 'Enable Notifications',
          onPress: () => checkAndRequestNotificationAccessSpecialPermission(),
        },
        {
          text: 'Not Now',
          style: 'cancel',
        },
      ]
    );
  };

  const textColor = isDarkTheme ? '#FFFFFF' : '#000000';
  const dropdownBackgroundColor = isDarkTheme ? '#333333' : '#FFFFFF';
  const shadowColor = isDarkTheme ? '#FFFFFF' : '#000000';

  return (
    <View style={styles.headerContainer}>
      <Text style={[styles.title, { color: textColor }]} numberOfLines={1}>
        AugmentOS
      </Text>
      
      {Platform.OS === 'android' && !hasNotificationListenerPermission && (
        <TouchableOpacity
          style={styles.alertIconContainer}
          onPress={handleNotificationAlert}
        >
          <Icon name="notifications-off" size={24} color="#FF3B30" />
          <View style={styles.alertDot} />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginLeft: 8,
    zIndex: 1,
    minHeight: 60,
    ...Platform.select({
      ios: {
        paddingTop: 16,
      },
      android: {
        paddingTop: 16,
      },
    }),
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: 'Montserrat-Bold',
  },
  dropdown: {
    position: 'absolute',
    top: 70,
    right: 16,
    borderRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
    padding: 8,
    zIndex: 2,
  },
  dropdownItem: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  dropdownItemText: {
    fontSize: 16,
    fontFamily: 'Montserrat-Regular',
  },
  alertIconContainer: {
    position: 'relative',
    padding: 8,
  },
  alertDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF3B30',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
});

export default Header;
