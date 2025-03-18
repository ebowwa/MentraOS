import { Alert, Platform } from "react-native";
import { request, check, PERMISSIONS, Permission, RESULTS } from 'react-native-permissions';

export const displayPermissionDeniedWarning = () => {
  return new Promise((resolve) => {
    Alert.alert(
      'Permissions Required',
      'Some permissions were denied. Please go to Settings and enable all required permissions for the app to function properly.',
      [
        {
          text: 'OK',
          style: 'default',
          onPress: () => resolve(true)
        },
      ]
    );
  });
};

export const requestGrantPermissions = async () => {
  let perms = getPermissions();
  let allGranted = true;
  for (let i = 0; i < perms.length; i++) {
    let status = await request(perms[i]);
    if (status !== RESULTS.GRANTED) {
      allGranted = false;
    }
  }
  if (!allGranted) {
    await displayPermissionDeniedWarning();
  }
  return allGranted;
};

export const doesHaveAllPermissions = async () => {
  let perms = getPermissions();
  let allGranted = true;
  for (let i = 0; i < perms.length; i++) {
    console.log('Checking permission:', perms[i]);
    let status = await check(perms[i]);
    if (status !== RESULTS.GRANTED) {
      allGranted = false;
      console.log('Permission not granted:', perms[i]);
    }
  }
  return allGranted;
};

export const getPermissions = (): Permission[] => {

  let list = [];
  if (Platform.OS === 'ios') {
    list = [PERMISSIONS.IOS.LOCATION_WHEN_IN_USE,
    PERMISSIONS.IOS.CALENDARS,
    PERMISSIONS.IOS.MICROPHONE,
    PERMISSIONS.IOS.LOCATION_ALWAYS,
    PERMISSIONS.IOS.LOCATION_WHEN_IN_USE,
    ];
  } else if (Platform.OS === 'android') {
    if (Platform.Version < 29) {
      list.push(PERMISSIONS.ANDROID.WRITE_EXTERNAL_STORAGE);
    }

    if (Platform.Version >= 23) {
      list.push(PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION);
    }
    // Android 11 (API 30) needs legacy Bluetooth permissions
    // TODO: Add these back in
    // if (Platform.Version >= 30 && Platform.Version < 31) {
    //   list.push(PERMISSIONS.ANDROID.BLUETOOTH);
    //   list.push(PERMISSIONS.ANDROID.BLUETOOTH_ADMIN);
    // }
    if (Platform.Version >= 31) {
      list.push(PERMISSIONS.ANDROID.BLUETOOTH_SCAN);
      list.push(PERMISSIONS.ANDROID.BLUETOOTH_CONNECT);
      list.push(PERMISSIONS.ANDROID.BLUETOOTH_ADVERTISE);
    }
    if (Platform.Version >= 33) {
      // list.push(PERMISSIONS.ANDROID.POST_NOTIFICATIONS);
    } else {
      list.push(PERMISSIONS.ANDROID.READ_EXTERNAL_STORAGE);
    }

    list.push(PERMISSIONS.ANDROID.READ_CALENDAR);
    list.push(PERMISSIONS.ANDROID.WRITE_CALENDAR);
    list.push(PERMISSIONS.ANDROID.RECORD_AUDIO);
  }
  return list as Permission[];
}