/* 
  Use this file to describe which features a given pair of glasses supports.
*/

export type GlassesFeature =
  | "type"
  | "camera"
  | "speakers"
  | "microphone"
  | "display"
  | "binocular"
  | "wifi"
  | "imu"
  | "powerSavingMode"
  | "gallery"
  | "configurableButton"

export type MicType = "none" | "sco" | "custom"

export interface GlassesFeatureSet {
  type: string // The type of glasses
  camera: boolean // Do the glasses contain a camera?
  speakers: boolean // Do the glasses have onboard speakers?
  display: boolean // Do the glasses have a display?
  binocular: boolean // Do the glasses have 2x displays- one for each eye?
  wifi: boolean // Do the glasses connect to wifi?
  wifiSelfOtaUpdate: boolean // Do the glasses update their software automatically when connected to wifi?
  imu: boolean // Do the glasses contain an IMU?
  micTypes: MicType[] // Which types of microphone do the glasses support?
  powerSavingMode: boolean // Do the glasses have a power saving mode?
  gallery: boolean // Do the glasses store a photo gallery on device
  configurableButton: boolean // Does the device support button configuration?
}

export const glassesFeatures: Record<string, GlassesFeatureSet> = {
  "Mentra Nex": {
    type: "Mentra Nex",
    camera: false,
    speakers: false,
    display: true,
    binocular: true,
    wifi: false,
    imu: true,
    micTypes: ["custom"],
    powerSavingMode: true,
    gallery: false,
    configurableButton: false,
    wifiSelfOtaUpdate: false,
  },
  "Even Realities G1": {
    type: "Even Realities G1",
    camera: false,
    speakers: false,
    display: true,
    binocular: true,
    wifi: false,
    wifiSelfOtaUpdate: false,
    imu: true,
    micTypes: ["custom"],
    powerSavingMode: true,
    gallery: false,
    configurableButton: false,
  },
  "Vuzix Z100": {
    type: "Vuzix Z100",
    camera: false,
    speakers: false,
    display: true,
    binocular: false,
    wifi: false,
    wifiSelfOtaUpdate: false,
    imu: false,
    micTypes: ["none"],
    powerSavingMode: false,
    gallery: false,
    configurableButton: false,
  },
  "Mentra Live": {
    type: "Mentra Live",
    camera: true,
    speakers: true,
    display: false,
    binocular: false,
    wifi: true,
    wifiSelfOtaUpdate: true,
    imu: false,
    micTypes: ["custom"],
    powerSavingMode: false,
    gallery: true,
    configurableButton: true,
  },
  "Mentra Mach1": {
    type: "Mentra Mach1",
    camera: false,
    speakers: false,
    display: true,
    binocular: false,
    wifi: false,
    wifiSelfOtaUpdate: false,
    imu: false,
    micTypes: ["none"],
    powerSavingMode: false,
    gallery: false,
    configurableButton: false,
  },
  "Audio Wearable": {
    type: "Audio Wearable",
    camera: false,
    speakers: true,
    display: false,
    binocular: false,
    wifi: false,
    wifiSelfOtaUpdate: false,
    imu: false,
    micTypes: ["sco"],
    powerSavingMode: false,
    gallery: false,
    configurableButton: false,
  },
  "Simulated Glasses": {
    type: "Simulated Glasses",
    camera: true,
    speakers: true,
    display: true,
    binocular: false,
    wifi: false,
    wifiSelfOtaUpdate: false,
    imu: false,
    micTypes: ["sco"],
    powerSavingMode: false,
    gallery: false,
    configurableButton: false,
  },
  "Brilliant Labs Frame": {
    type: "Brilliant Labs Frame",
    camera: true,
    speakers: false, // Uses phone for audio output
    display: true,
    binocular: false,
    wifi: false,
    wifiSelfOtaUpdate: false,
    imu: true,
    micTypes: ["custom"], // Uses BLE audio streaming
    powerSavingMode: false,
    gallery: false, // v1: No on-device gallery
    configurableButton: false,
  },
}

export const featureLabels: Record<GlassesFeature, string> = {
  type: "Type",
  camera: "Camera",
  speakers: "Speakers",
  microphone: "Microphone",
  display: "Display",
  binocular: "Binocular",
  wifi: "WiFi",
  imu: "IMU",
  powerSavingMode: "Power Saving Mode",
  gallery: "Gallery",
  configurableButton: "Configurable Button",
}

// Helper functions for mic type checking
export function hasMicrophone(wearable: string | null): boolean {
  if (!wearable) {
    return false
  }
  const featureSet = glassesFeatures[wearable]
  if (!featureSet) {
    return false
  }
  return featureSet.micTypes.length > 0 && !featureSet.micTypes.includes("none")
}

export function hasCustomMic(wearable: string | null): boolean {
  if (!wearable) {
    return false
  }
  const featureSet = glassesFeatures[wearable]
  if (!featureSet) {
    return false
  }
  return featureSet.micTypes.includes("custom")
}

export function hasBrightness(wearable: string | null): boolean {
  if (!wearable) {
    return false
  }
  const featureSet = glassesFeatures[wearable]
  if (!featureSet) {
    return false
  }
  if (featureSet?.type === "Simulated Glasses") {
    return false
  }
  return featureSet.display
}

export function hasGallery(wearable: string | null): boolean {
  if (!wearable) {
    return false
  }
  const featureSet = glassesFeatures[wearable]
  if (!featureSet) {
    return false
  }
  return featureSet.gallery
}
