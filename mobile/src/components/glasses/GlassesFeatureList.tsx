import {View, Text, StyleSheet} from "react-native"
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons"
import {useAppTheme} from "@/utils/useAppTheme"
import {DeviceTypes, getModelCapabilities} from "../../../../cloud/packages/types/src"

interface GlassesFeatureListProps {
  glassesModel: string
}

export type GlassesFeature = "camera" | "microphone" | "speakers" | "display"

export const featureLabels: Record<GlassesFeature, string> = {
  camera: "Camera",
  microphone: "Microphone",
  speakers: "Speakers",
  display: "Display",
}

export function GlassesFeatureList({glassesModel}: GlassesFeatureListProps) {
  const {theme} = useAppTheme()
  const capabilities = getModelCapabilities(glassesModel as DeviceTypes)

  if (!capabilities) {
    console.warn(`No capabilities defined for glasses model: ${glassesModel}`)
    return null
  }

  const featureOrder: GlassesFeature[] = ["camera", "microphone", "speakers", "display"]

  const getFeatureValue = (feature: GlassesFeature): boolean => {
    switch (feature) {
      case "camera":
        return capabilities.hasCamera
      case "microphone":
        return capabilities.hasMicrophone
      case "speakers":
        return capabilities.hasSpeaker
      case "display":
        return capabilities.hasDisplay
      default:
        return false
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.featureRow}>
        {featureOrder.slice(0, 2).map(feature => (
          <View key={feature} style={styles.featureItem}>
            <MaterialCommunityIcons
              name={getFeatureValue(feature) ? "check" : "close"}
              size={24}
              color={theme.colors.text}
              style={styles.icon}
            />
            <Text style={[styles.featureText, {color: theme.colors.text}]}>{featureLabels[feature]}</Text>
          </View>
        ))}
      </View>
      <View style={styles.featureRow}>
        {featureOrder.slice(2, 4).map(feature => (
          <View key={feature} style={styles.featureItem}>
            <MaterialCommunityIcons
              name={getFeatureValue(feature) ? "check" : "close"}
              size={24}
              color={theme.colors.text}
              style={styles.icon}
            />
            <Text style={[styles.featureText, {color: theme.colors.text}]}>{featureLabels[feature]}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 20,
  },
  featureItem: {
    alignItems: "center",
    flexDirection: "row",
    flex: 1,
  },
  featureRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginVertical: 6,
  },
  featureText: {
    fontSize: 14,
    fontWeight: "500",
  },
  icon: {
    marginRight: 10,
  },
})
