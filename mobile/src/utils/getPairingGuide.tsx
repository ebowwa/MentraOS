import {View} from "react-native"
import {
  AudioWearablePairingGuide,
  BrilliantLabsFramePairingGuide,
  EvenRealitiesG1PairingGuide,
  MentraNextGlassesPairingGuide,
  MentraLivePairingGuide,
  VirtualWearablePairingGuide,
} from "@/components/misc/GlassesPairingGuides"

/**
 * Returns the appropriate pairing guide component based on the glasses model name
 * @param glassesModelName The name of the glasses model
 * @returns The corresponding pairing guide component
 */
export const getPairingGuide = (glassesModelName: string) => {
  switch (glassesModelName) {
    case "Even Realities G1":
      return <EvenRealitiesG1PairingGuide />
    case "Mentra Nex":
      return <MentraNextGlassesPairingGuide />
    case "Mentra Live":
      return <MentraLivePairingGuide />
    case "Audio Wearable":
      return <AudioWearablePairingGuide />
    case "Simulated Glasses":
      return <VirtualWearablePairingGuide />
    case "Brilliant Labs Frame":
      return <BrilliantLabsFramePairingGuide />
    default:
      return <View />
  }
}
