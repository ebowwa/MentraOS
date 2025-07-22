export type GlassesFeature = "camera" | "speakers" | "microphone" | "display" | "binocular" | "wifi" | "imu"

export type MicType = "none" | "sco" | "custom"

export interface GlassesFeatureSet {
  camera: boolean
  speakers: boolean
  display: boolean
  binocular: boolean
  wifi: boolean
  imu: boolean
  micTypes: MicType[]
}

export const glassesFeatures: Record<string, GlassesFeatureSet> = {
  "Even Realities G1": {
    camera: false,
    speakers: false,
    display: true,
    binocular: true,
    wifi: false,
    imu: true,
    micTypes: ["custom"],
  },
  "Vuzix Z100": {
    camera: false,
    speakers: false,
    display: true,
    binocular: false,
    wifi: false,
    imu: false,
    micTypes: ["none"],
  },
  "Mentra Live": {
    camera: true,
    speakers: true,
    display: false,
    binocular: false,
    wifi: true,
    imu: false,
    micTypes: ["sco"],
  },
  "Mentra Mach1": {
    camera: false,
    speakers: false,
    display: true,
    binocular: false,
    wifi: false,
    imu: false,
    micTypes: ["none"],
  },
  "Audio Wearable": {
    camera: false,
    speakers: true,
    display: false,
    binocular: false,
    wifi: false,
    imu: false,
    micTypes: ["sco"],
  },
  "Simulated Glasses": {
    camera: true,
    speakers: true,
    display: true,
    binocular: false,
    wifi: false,
    imu: false,
    micTypes: ["sco"],
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
