export type GlassesFeature = 'camera' | 'speakers' | 'microphone' | 'display';

export interface GlassesFeatureSet {
  camera: boolean;
  speakers: boolean;
  microphone: boolean;
  display: boolean;
}

export const glassesFeatures: Record<string, GlassesFeatureSet> = {
  'Even Realities G1': {
    camera: false,
    speakers: false,
    microphone: true,
    display: true,
  },
  'Vuzix Z100': {
    camera: false,
    speakers: false,
    microphone: false,
    display: true,
  },
  'Mentra Live': {
    camera: true,
    speakers: true,
    microphone: true,
    display: false,
  },
  'Mentra Mach1': {
    camera: false,
    speakers: false,
    microphone: false,
    display: true,
  },
  'Audio Wearable': {
    camera: false,
    speakers: true,
    microphone: true,
    display: false,
  },
  'Simulated Glasses': {
    camera: true,
    speakers: true,
    microphone: true,
    display: true,
  },
};

export const featureLabels: Record<GlassesFeature, string> = {
  camera: 'Camera',
  speakers: 'Speakers',
  microphone: 'Microphone',
  display: 'Display',
};