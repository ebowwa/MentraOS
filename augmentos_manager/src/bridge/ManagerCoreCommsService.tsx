import { NativeModule, NativeModules } from 'react-native';

/**
 * @deprecated This service is deprecated and will be removed in a future version.
 * Please use CoreCommsService from '../bridge/CoreCommsService' instead.
 * 
 * The BluetoothService class has been replaced by CoreCommunicator.
 */
interface ManagerCoreCommsServiceInterface extends NativeModule {
  startService: () => void;
  stopService: () => void;
  isServiceRunning: () => boolean;
  addListener: (eventName: string) => void;
  removeListeners: (count: number) => void;
  sendCommandToCore: (jsonString: string) => void;
}

const { ManagerCoreCommsService } = NativeModules;

/**
 * @deprecated Use CoreCommsService from '../bridge/CoreCommsService' instead.
 */
export default ManagerCoreCommsService as ManagerCoreCommsServiceInterface;
