/* 
  Use this file to describe which features a given pair of glasses supports.
*/

export type GlassesFeature =
  | "camera"
  | "speakers"
  | "microphone"
  | "display"
  | "binocular"
  | "wifi"
  | "imu"
  | "powerSavingMode"

export type MicType = "none" | "sco" | "custom"

export interface GlassesFeatureSet {
  camera: boolean // Do the glasses contain a camera?
  speakers: boolean // Do the glasses have onboard speakers?
  display: boolean // Do the glasses have a display?
  binocular: boolean // Do the glasses have 2x displays- one for each eye?
  wifi: boolean // Do the glasses connect to wifi?
  wifiSelfOtaUpdate: boolean // Do the glasses update their software automatically when connected to wifi?
  imu: boolean // Do the glasses contain an IMU?
  micTypes: MicType[] // Which types of microphone do the glasses support?
  powerSavingMode: boolean // Do the glasses have a power saving mode?
}

export const glassesFeatures: Record<string, GlassesFeatureSet> = {
  "Even Realities G1": {
    camera: false,
    speakers: false,
    display: true,
    binocular: true,
    wifi: false,
    wifiSelfOtaUpdate: false,
    imu: true,
    micTypes: ["custom"],
    powerSavingMode: true,
  },
  "Vuzix Z100": {
    camera: false,
    speakers: false,
    display: true,
    binocular: false,
    wifi: false,
    wifiSelfOtaUpdate: false,
    imu: false,
    micTypes: ["none"],
    powerSavingMode: false,
  },
  "Mentra Live": {
    camera: true,
    speakers: true,
    display: false,
    binocular: false,
    wifi: true,
    wifiSelfOtaUpdate: true,
    imu: false,
    micTypes: ["sco"],
    powerSavingMode: false,
  },
  "Mentra Mach1": {
    camera: false,
    speakers: false,
    display: true,
    binocular: false,
    wifi: false,
    wifiSelfOtaUpdate: false,
    imu: false,
    micTypes: ["none"],
    powerSavingMode: false,
  },
  "Audio Wearable": {
    camera: false,
    speakers: true,
    display: false,
    binocular: false,
    wifi: false,
    wifiSelfOtaUpdate: false,
    imu: false,
    micTypes: ["sco"],
    powerSavingMode: false,
  },
  "Simulated Glasses": {
    camera: true,
    speakers: true,
    display: true,
    binocular: false,
    wifi: false,
    wifiSelfOtaUpdate: false,
    imu: false,
    micTypes: ["sco"],
    powerSavingMode: false,
  },
}

export const featureLabels: Record<GlassesFeature, string> = {
  camera: "Camera",
  speakers: "Speakers",
  microphone: "Microphone",
  display: "Display",
  binocular: "Binocular",
  wifi: "WiFi",
  imu: "IMU",
  powerSavingMode: "Power Saving Mode",
}

// Helper functions for mic type checking
export function hasMicrophone(featureSet: GlassesFeatureSet): boolean {
  return featureSet.micTypes.length > 0 && !featureSet.micTypes.includes("none")
}

export function hasCustomMic(featureSet: GlassesFeatureSet): boolean {
  return featureSet.micTypes.includes("custom")
}

export function hasScoMic(featureSet: GlassesFeatureSet): boolean {
  return featureSet.micTypes.includes("sco")
}
