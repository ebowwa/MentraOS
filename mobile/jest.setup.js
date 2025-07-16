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
  isBluetoothEnabled: jest.fn(),
  startDiscovery: jest.fn(),
  cancelDiscovery: jest.fn(),
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

// Silence the warning: Animated: `useNativeDriver` is not supported
global.__reanimatedWorkletInit = jest.fn()
