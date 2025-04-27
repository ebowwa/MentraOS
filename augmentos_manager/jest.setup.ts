import 'react-native-gesture-handler/jestSetup';
import { Platform } from 'react-native';


jest.mock('react-native-ble-manager', () => ({
    start: jest.fn(),
    scan: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
    checkState: jest.fn(),
    getConnectedPeripherals: jest.fn(),
    getDiscoveredPeripherals: jest.fn(),
    stopScan: jest.fn(),
    enableBluetooth: jest.fn(),
}));

jest.mock('react-native-image-picker', () => ({
    launchImageLibrary: jest.fn(),
    launchCamera: jest.fn(),
}));

jest.mock('react-native-bluetooth-classic', () => ({
    requestEnable: jest.fn(),
    isEnabled: jest.fn(),
    startDiscovery: jest.fn(),
    cancelDiscovery: jest.fn(),
    connectToDevice: jest.fn(),
    disconnectFromDevice: jest.fn(),
    writeToDevice: jest.fn(),
    onDeviceDisconnected: jest.fn(),
}));

jest.mock('react-native-camera', () => ({
    RNCamera: 'RNCamera',
}));

jest.mock('react-native-linear-gradient', () => 'LinearGradient');

jest.mock('react-native-webview', () => 'WebView');

jest.mock('react-native-safe-area-context', () => ({
    SafeAreaProvider: 'SafeAreaProvider',
    SafeAreaView: 'SafeAreaView',
    useSafeAreaInsets: jest.fn(),
}));
