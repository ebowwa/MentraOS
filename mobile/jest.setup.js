/* eslint-env jest */

// Mock AsyncStorage
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
)

// Mock react-native-permissions
jest.mock("react-native-permissions", () => require("react-native-permissions/mock"))

// Mock react-native-ble-manager
jest.mock("react-native-ble-manager", () => ({
  start: jest.fn(),
  scan: jest.fn(),
  stopScan: jest.fn(),
  connect: jest.fn(),
  disconnect: jest.fn(),
  enableBluetooth: jest.fn(),
  getConnectedPeripherals: jest.fn(),
  getDiscoveredPeripherals: jest.fn(),
  checkState: jest.fn(),
  createPeripheralInfo: jest.fn(),
}))

// Mock react-native-bluetooth-classic
jest.mock("react-native-bluetooth-classic", () => ({
  isBluetoothEnabled: jest.fn(),
  requestBluetoothEnabled: jest.fn(),
  listPairedDevices: jest.fn(),
  cancelDiscovery: jest.fn(),
  pairDevice: jest.fn(),
  unpairDevice: jest.fn(),
  accept: jest.fn(),
  cancelAccept: jest.fn(),
  isBluetoothAvailable: jest.fn(),
  startDiscovery: jest.fn(),
}))

// Mock react-native-mmkv
jest.mock("react-native-mmkv", () => {
  const mockStorage = new Map([
    ["string", '"string"'],
    ["object", '{"x":1}'],
  ])

  return {
    MMKV: jest.fn().mockImplementation(() => ({
      getString: jest.fn(key => mockStorage.get(key)),
      set: jest.fn((key, value) => mockStorage.set(key, value)),
      delete: jest.fn(key => mockStorage.delete(key)),
      clearAll: jest.fn(() => mockStorage.clear()),
      getAllKeys: jest.fn(() => Array.from(mockStorage.keys())),
    })),
  }
})

// Mock react-native-localize
jest.mock("react-native-localize", () => ({
  getLocales: jest.fn(() => [
    {
      countryCode: "US",
      languageTag: "en-US",
      languageCode: "en",
      isRTL: false,
    },
  ]),
  getNumberFormatSettings: jest.fn(() => ({
    decimalSeparator: ".",
    groupingSeparator: ",",
  })),
  getCalendar: jest.fn(() => "gregorian"),
  getCountry: jest.fn(() => "US"),
  getCurrencies: jest.fn(() => ["USD", "EUR"]),
  getTemperatureUnit: jest.fn(() => "celsius"),
  getTimeZone: jest.fn(() => "America/New_York"),
  uses24HourClock: jest.fn(() => false),
  usesMetricSystem: jest.fn(() => false),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
}))

// Mock expo-audio
jest.mock("expo-audio", () => ({
  createAudioPlayer: jest.fn(() => ({
    src: null,
    play: jest.fn(),
    pause: jest.fn(),
    stop: jest.fn(),
    remove: jest.fn(),
  })),
}))

// Mock MantleBridge
jest.mock("@/bridge/MantleBridge", () => {
  const {EventEmitter} = require("events")

  class MockMantleBridge extends EventEmitter {
    static getInstance = jest.fn(() => new MockMantleBridge())
    connect = jest.fn()
    disconnect = jest.fn()
    sendMessage = jest.fn()
    cleanup = jest.fn()
  }

  return {
    default: new MockMantleBridge(),
  }
})

// Mock SocketComms to avoid complex dependency chains
jest.mock("@/managers/SocketComms", () => ({
  default: {
    getInstance: jest.fn(() => ({
      connect: jest.fn(),
      disconnect: jest.fn(),
      send_socket_message: jest.fn(),
      cleanup: jest.fn(),
    })),
  },
}))

// Mock WebSocketManager to avoid circular dependency issues
jest.mock("@/managers/WebSocketManager", () => {
  const {EventEmitter} = require("events")

  const WebSocketStatus = {
    DISCONNECTED: "disconnected",
    CONNECTING: "connecting",
    CONNECTED: "connected",
    ERROR: "error",
  }

  class MockWebSocketManager extends EventEmitter {
    connect = jest.fn()
    disconnect = jest.fn()
    isConnected = jest.fn(() => false)
    sendText = jest.fn()
    sendBinary = jest.fn()
    cleanup = jest.fn()
  }

  return {
    WebSocketStatus,
    default: new MockWebSocketManager(),
  }
})

// Silence the warning: Animated: `useNativeDriver` is not supported
global.__reanimatedWorkletInit = jest.fn()
