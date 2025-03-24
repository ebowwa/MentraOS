import { NativeModule, NativeModules } from 'react-native';

interface CoreCommsServiceInterface extends NativeModule {
  startService: () => void;
  stopService: () => void;
  isServiceRunning: () => boolean;
  addListener: (eventName: string) => void;
  removeListeners: (count: number) => void;
  sendCommandToCore: (jsonString: string) => void;
}

const { CoreCommsService } = NativeModules;

export default CoreCommsService as CoreCommsServiceInterface;