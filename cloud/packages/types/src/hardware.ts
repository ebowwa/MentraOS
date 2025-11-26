/**
 * @mentra/types - Hardware capability types
 */

import { evenRealitiesG1 } from "./capabilities/even-realities-g1"
import { mentraLive } from "./capabilities/mentra-live"
import { simulatedGlasses } from "./capabilities/simulated-glasses"
import { vuzixZ100 } from "./capabilities/vuzix-z100"
import { DeviceTypes, HardwareRequirementLevel, HardwareType } from "./enums"

/**
 * Hardware requirement for an app
 * Specifies what hardware components an app needs
 */
export interface HardwareRequirement {
  type: HardwareType
  level: HardwareRequirementLevel
  description?: string // Why this hardware is needed
}

export interface CameraCapabilities {
  resolution?: { width: number; height: number };
  hasHDR?: boolean;
  hasFocus?: boolean;
  video: {
    canRecord: boolean;
    canStream: boolean;
    supportedStreamTypes?: string[];
    supportedResolutions?: { width: number; height: number }[];
  };
}

export interface DisplayCapabilities {
  count?: number;
  isColor?: boolean;
  color?: string; // e.g., "green", "full_color", "pallet"
  canDisplayBitmap?: boolean;
  resolution?: { width: number; height: number };
  fieldOfView?: { horizontal?: number; vertical?: number };
  maxTextLines?: number;
  adjustBrightness?: boolean;
}

export interface MicrophoneCapabilities {
  count?: number;
  hasVAD?: boolean; // Voice Activity Detection
}

export interface SpeakerCapabilities {
  count?: number;
  isPrivate?: boolean; // e.g., bone conduction
}

export interface IMUCapabilities {
  axisCount?: number;
  hasAccelerometer?: boolean;
  hasCompass?: boolean;
  hasGyroscope?: boolean;
}

export interface ButtonCapabilities {
  count?: number;
  buttons?: {
    type: "press" | "swipe1d" | "swipe2d";
    events: string[]; // e.g., "press", "double_press", "long_press", "swipe_up", "swipe_down"
    isCapacitive?: boolean;
  }[];
}

export interface LightCapabilities {
  count?: number;
  lights?: {
    id: string; // Unique identifier for the LED (e.g., "privacy", "user_feedback")
    purpose: "privacy" | "user_feedback" | "general"; // LED purpose/function
    isFullColor: boolean;
    color?: string; // e.g., "white", "rgb"
    position?: "front_facing" | "user_facing" | "side" | "unknown"; // LED physical position
  }[];
}

export interface PowerCapabilities {
  hasExternalBattery: boolean; // e.g., a case or puck
}

export interface Capabilities {
  modelName: string;

  // Camera capabilities
  hasCamera: boolean;
  camera: CameraCapabilities | null;

  // Display capabilities
  hasDisplay: boolean;
  display: DisplayCapabilities | null;

  // Microphone capabilities
  hasMicrophone: boolean;
  microphone: MicrophoneCapabilities | null;

  // Speaker capabilities
  hasSpeaker: boolean;
  speaker: SpeakerCapabilities | null;

  // IMU capabilities
  hasIMU: boolean;
  imu: IMUCapabilities | null;

  // Button capabilities
  hasButton: boolean;
  button: ButtonCapabilities | null;

  // Light capabilities
  hasLight: boolean;
  light: LightCapabilities | null;

  // Power capabilities
  power: PowerCapabilities;

  // WiFi capabilities
  hasWifi: boolean;
}

/**
 * Hardware capability profiles for supported glasses models
 * Key: model_name string (e.g., "Even Realities G1", "Mentra Live")
 * Value: Capabilities object defining device features
 */
export const HARDWARE_CAPABILITIES: Record<string, Capabilities> = {
  [evenRealitiesG1.modelName]: evenRealitiesG1 as unknown as Capabilities,
  [mentraLive.modelName]: mentraLive as unknown as Capabilities,
  [simulatedGlasses.modelName]: simulatedGlasses as unknown as Capabilities,
  [vuzixZ100.modelName]: vuzixZ100 as unknown as Capabilities,
}

export const getModelCapabilities = (deviceType: DeviceTypes): Capabilities => {
  let modelName = deviceType as string
  if (!HARDWARE_CAPABILITIES[modelName]) {
    return HARDWARE_CAPABILITIES[simulatedGlasses.modelName]
  }
  return HARDWARE_CAPABILITIES[modelName]
}

// export * from "./capabilities"
export { simulatedGlasses, evenRealitiesG1, mentraLive, vuzixZ100 }
