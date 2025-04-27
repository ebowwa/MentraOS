import 'react-native-gesture-handler/jestSetup';
import { Platform } from 'react-native';

// Mock para NativeEventEmitter
interface MockNativeEventEmitter {
    addListener: jest.Mock;
    removeListener: jest.Mock;
    removeAllListeners: jest.Mock;
    emit: jest.Mock;
}

jest.mock('react-native/Libraries/EventEmitter/NativeEventEmitter', () => {
    return class NativeEventEmitter implements MockNativeEventEmitter {
        addListener: jest.Mock;
        removeListener: jest.Mock;
        removeAllListeners: jest.Mock;
        emit: jest.Mock;

        constructor() {
            this.addListener = jest.fn();
            this.removeListener = jest.fn();
            this.removeAllListeners = jest.fn();
            this.emit = jest.fn();
        }
    };
});

// Mock para Reanimated
jest.mock('react-native-reanimated', () => {
    const Reanimated = require('react-native-reanimated/mock');
    Reanimated.default.call = () => { };
    return Reanimated;
});

// Mock para Animated
jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper');

// Mock para AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
}));

// Mock para Permissions
jest.mock('react-native-permissions', () => ({
    PERMISSIONS: {
        IOS: {
            BLUETOOTH_PERIPHERAL: 'ios.permission.BLUETOOTH_PERIPHERAL',
            LOCATION_WHEN_IN_USE: 'ios.permission.LOCATION_WHEN_IN_USE',
        },
        ANDROID: {
            ACCESS_FINE_LOCATION: 'android.permission.ACCESS_FINE_LOCATION',
            BLUETOOTH_SCAN: 'android.permission.BLUETOOTH_SCAN',
            BLUETOOTH_CONNECT: 'android.permission.BLUETOOTH_CONNECT',
        },
    },
    RESULTS: {
        GRANTED: 'granted',
        DENIED: 'denied',
        BLOCKED: 'blocked',
        UNAVAILABLE: 'unavailable',
    },
    check: jest.fn().mockResolvedValue('granted'),
    request: jest.fn().mockResolvedValue('granted'),
}));

// Mock para Vector Icons
jest.mock('react-native-vector-icons/MaterialIcons', () => 'MaterialIcons');

// Mock para Config
jest.mock('react-native-config', () => ({
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-key',
    INTENSE_LOGGING: 'true',
}));

// Mock para React Native
jest.mock('react-native', () => {
    const rn = jest.requireActual('react-native');
    return {
        ...rn,
        Platform: {
            ...rn.Platform,
            OS: 'ios',
        },
        NativeModules: {
            ...rn.NativeModules,
            CoreCommsService: {
                addListener: jest.fn(),
                removeListeners: jest.fn(),
            },
            AOSModule: {},
            I18nManager: {
                isRTL: false,
                doLeftAndRightSwapInRTL: true,
                allowRTL: () => { },
                forceRTL: () => { },
                swapLeftAndRightSwapInRTL: () => { },
            },
            StatusBarManager: {
                HEIGHT: 20,
                setColor: jest.fn(),
                setStyle: jest.fn(),
                setHidden: jest.fn(),
                setNetworkActivityIndicatorVisible: jest.fn(),
                setBackgroundColor: jest.fn(),
                setTranslucent: jest.fn(),
            },
            AlertManager: {
                alertWithArgs: jest.fn(),
            },
            PushNotificationManager: {
                presentLocalNotification: jest.fn(),
                scheduleLocalNotification: jest.fn(),
                cancelAllLocalNotifications: jest.fn(),
                removeAllDeliveredNotifications: jest.fn(),
                getDeliveredNotifications: jest.fn(),
                removeDeliveredNotifications: jest.fn(),
                setApplicationIconBadgeNumber: jest.fn(),
                getApplicationIconBadgeNumber: jest.fn(),
                cancelLocalNotifications: jest.fn(),
                getScheduledLocalNotifications: jest.fn(),
                requestPermissions: jest.fn(),
                abandonPermissions: jest.fn(),
                checkPermissions: jest.fn(),
                getInitialNotification: jest.fn(),
            },
        },
    };
});

// Mock para TurboModules
jest.mock('react-native/Libraries/TurboModule/TurboModuleRegistry', () => ({
    get: (name: string) => {
        switch (name) {
            case 'SettingsManager':
                return {
                    settings: {
                        AppleLocale: 'en_US',
                        AppleLanguages: ['en-US', 'en'],
                    },
                };
            case 'PlatformConstants':
                return {
                    getConstants: () => ({
                        forceTouchAvailable: false,
                        interfaceIdiom: 'phone',
                        osVersion: '15.0',
                        systemName: 'iOS',
                        isTesting: true,
                        reactNativeVersion: {
                            major: 0,
                            minor: 75,
                            patch: 4,
                        },
                    }),
                };
            case 'DeviceInfo':
                return {
                    getConstants: () => ({
                        Dimensions: {
                            window: {
                                width: 375,
                                height: 812,
                            },
                            screen: {
                                width: 375,
                                height: 812,
                            },
                        },
                    }),
                };
            case 'SoundManager':
                return {
                    playTouchSound: jest.fn(),
                };
            case 'SourceCode':
                return {
                    getConstants: () => ({
                        scriptURL: 'http://localhost:8081/index.bundle?platform=ios&dev=true&minify=false',
                    }),
                };
            case 'ImageLoader':
                return {
                    getSize: jest.fn(),
                    prefetchImage: jest.fn(),
                    abortRequest: jest.fn(),
                    queryCache: jest.fn(),
                };
            case 'KeyboardObserver':
                return {
                    addListener: jest.fn(),
                    removeListeners: jest.fn(),
                };
            case 'DevSettings':
                return {
                    reload: jest.fn(),
                    setHotLoadingEnabled: jest.fn(),
                    setIsDebuggingRemotely: jest.fn(),
                    setLiveReloadEnabled: jest.fn(),
                    setProfilingEnabled: jest.fn(),
                    toggleElementInspector: jest.fn(),
                    addMenuItem: jest.fn(),
                    setIsShakeToShowDevMenuEnabled: jest.fn(),
                };
            default:
                return null;
        }
    },
    getEnforcing: (name: string) => {
        switch (name) {
            case 'SettingsManager':
                return {
                    settings: {
                        AppleLocale: 'en_US',
                        AppleLanguages: ['en-US', 'en'],
                    },
                };
            case 'PlatformConstants':
                return {
                    getConstants: () => ({
                        forceTouchAvailable: false,
                        interfaceIdiom: 'phone',
                        osVersion: '15.0',
                        systemName: 'iOS',
                        isTesting: true,
                        reactNativeVersion: {
                            major: 0,
                            minor: 75,
                            patch: 4,
                        },
                    }),
                };
            case 'DeviceInfo':
                return {
                    getConstants: () => ({
                        Dimensions: {
                            window: {
                                width: 375,
                                height: 812,
                            },
                            screen: {
                                width: 375,
                                height: 812,
                            },
                        },
                    }),
                };
            case 'SoundManager':
                return {
                    playTouchSound: jest.fn(),
                };
            case 'SourceCode':
                return {
                    getConstants: () => ({
                        scriptURL: 'http://localhost:8081/index.bundle?platform=ios&dev=true&minify=false',
                    }),
                };
            case 'ImageLoader':
                return {
                    getSize: jest.fn(),
                    prefetchImage: jest.fn(),
                    abortRequest: jest.fn(),
                    queryCache: jest.fn(),
                };
            case 'KeyboardObserver':
                return {
                    addListener: jest.fn(),
                    removeListeners: jest.fn(),
                };
            case 'DevSettings':
                return {
                    reload: jest.fn(),
                    setHotLoadingEnabled: jest.fn(),
                    setIsDebuggingRemotely: jest.fn(),
                    setLiveReloadEnabled: jest.fn(),
                    setProfilingEnabled: jest.fn(),
                    toggleElementInspector: jest.fn(),
                    addMenuItem: jest.fn(),
                    setIsShakeToShowDevMenuEnabled: jest.fn(),
                };
            default:
                throw new Error(`TurboModule ${name} not found`);
        }
    },
}));

// Mock para BleManager
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

// Mock para Image Picker
jest.mock('react-native-image-picker', () => ({
    launchImageLibrary: jest.fn(),
    launchCamera: jest.fn(),
}));

// Mock para Bluetooth Classic
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

// Mock para Camera
jest.mock('react-native-camera', () => ({
    RNCamera: 'RNCamera',
}));

// Mock para Linear Gradient
jest.mock('react-native-linear-gradient', () => 'LinearGradient');

// Mock para WebView
jest.mock('react-native-webview', () => 'WebView');

// Mock para Safe Area Context
jest.mock('react-native-safe-area-context', () => ({
    SafeAreaProvider: 'SafeAreaProvider',
    SafeAreaView: 'SafeAreaView',
    useSafeAreaInsets: jest.fn(),
}));
