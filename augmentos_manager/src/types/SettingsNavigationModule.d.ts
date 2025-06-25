declare module 'react-native' {
  interface NativeModulesStatic {
    SettingsNavigationModule: {
      openBluetoothSettings(): Promise<boolean>
      openLocationSettings(): Promise<boolean>
      showLocationServicesDialog(): Promise<boolean>
      openAppSettings(): Promise<boolean>
    }
  }
} 