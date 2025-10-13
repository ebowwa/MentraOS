import {View, TouchableOpacity, Platform, ScrollView, Image, ViewStyle, ImageStyle, TextStyle} from "react-native"
import {Text} from "@/components/ignite"
import Icon from "react-native-vector-icons/FontAwesome"
import {getGlassesImage} from "@/utils/getGlassesImage"
import {useAppTheme} from "@/utils/useAppTheme"
import {Screen} from "@/components/ignite/Screen"
import {Header} from "@/components/ignite"
import {ThemedStyle} from "@/theme"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import Svg, {Defs, RadialGradient, Rect, Stop} from "react-native-svg"
import {SETTINGS_KEYS, useSetting} from "@/stores/settings"

export default function SelectGlassesModelScreen() {
  const [hasOnboarded, _setHasOnboarded] = useSetting(SETTINGS_KEYS.onboarding_completed)
  const {theme, themed} = useAppTheme()
  const {push, replace, goBack} = useNavigationHistory()

  // Platform-specific glasses options
  const glassesOptions =
    Platform.OS === "ios"
      ? [
          {modelName: "Simulated Glasses", key: "Simulated Glasses"},
          {modelName: "Even Realities G1", key: "evenrealities_g1"},
          {modelName: "Mentra Live", key: "mentra_live"},
          // {modelName: "Mentra Nex", key: "mentra_nex"},
          {modelName: "Mentra Mach1", key: "mentra_mach1"},
          {modelName: "Vuzix Z100", key: "vuzix-z100"},
          //{modelName: "Brilliant Labs Frame", key: "frame"},
        ]
      : [
          // Android:
          {modelName: "Simulated Glasses", key: "Simulated Glasses"},
          {modelName: "Even Realities G1", key: "evenrealities_g1"},
          {modelName: "Mentra Live", key: "mentra_live"},
          // {modelName: "Mentra Nex", key: "mentra_nex"},
          {modelName: "Mentra Mach1", key: "mentra_mach1"},
          {modelName: "Vuzix Z100", key: "vuzix-z100"},
          // {modelName: "Brilliant Labs Frame", key: "frame"},
        ]

  const triggerGlassesPairingGuide = async (glassesModelName: string) => {
    // No need for Bluetooth permissions anymore as we're using direct communication
    console.log("TRIGGERING SEARCH SCREEN FOR: " + glassesModelName)
    push("/pairing/prep", {glassesModelName: glassesModelName})
  }

  const radialGradient = (size: number, rotation: number) => {
    const strokeWidth = theme.spacing.xxxs
    const halfStroke = strokeWidth / 2
    return (
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient
            id="grad"
            cx="0.0762"
            cy="0.9529"
            rx="1.0228"
            ry="0.9978"
            gradientUnits="objectBoundingBox"
            gradientTransform={`rotate(${rotation} 10 10)`}>
            <Stop offset="0" stopColor={theme.colors.tint} />
            <Stop offset="1" stopColor={theme.colors.accent} />
          </RadialGradient>
        </Defs>
        <Rect
          x={halfStroke}
          y={halfStroke}
          width={size - strokeWidth}
          height={size - strokeWidth}
          rx={theme.borderRadius.md - 2}
          ry={theme.borderRadius.md - 2}
          fill="url(#grad)"
          stroke={theme.colors.border}
          strokeWidth={strokeWidth}
        />
      </Svg>
    )
  }

  return (
    <Screen preset="fixed" style={{paddingHorizontal: theme.spacing.md}} safeAreaEdges={["bottom"]}>
      <Header
        titleTx="pairing:selectModel"
        leftIcon="caretLeft"
        onLeftPress={() => {
          if (!hasOnboarded) {
            goBack()
          } else {
            replace("/(tabs)/home")
          }
        }}
      />
      <ScrollView style={{marginRight: -theme.spacing.md, paddingRight: theme.spacing.md}}>
        {/** RENDER EACH GLASSES OPTION */}
        {glassesOptions
          .filter(glasses => {
            // Hide simulated glasses during onboarding (users get there via "I don't have glasses yet")
            if (!hasOnboarded && glasses.modelName === "Simulated Glasses") {
              return false
            }
            return true
          })
          .map(glasses => (
            <TouchableOpacity
              key={glasses.key}
              style={themed($settingItem)}
              onPress={() => {
                triggerGlassesPairingGuide(glasses.modelName)
              }}>
              <View
                style={{
                  position: "relative",
                  marginLeft: -theme.spacing.xxxs,
                  marginTop: -theme.spacing.xxxs,
                  marginBottom: -theme.spacing.xxxs,
                }}>
                {radialGradient(100 + theme.spacing.xxxs * 2, Math.round(Math.random() * 360))}
                <Image source={getGlassesImage(glasses.modelName)} style={themed($glassesImage)} />
              </View>
              <View style={themed($settingTextContainer)}>
                <Text
                  style={[
                    themed($label),
                    {
                      color: theme.colors.text,
                      fontWeight: "600",
                    },
                  ]}>
                  {glasses.modelName}
                </Text>
              </View>
              <Icon name="angle-right" size={24} color={theme.colors.text} />
            </TouchableOpacity>
          ))}
      </ScrollView>
    </Screen>
  )
}

const $settingItem: ThemedStyle<ViewStyle> = ({colors, spacing, borderRadius}) => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  paddingRight: spacing.lg,

  // Larger margin to separate each card
  marginVertical: 8,

  // Rounded corners
  borderRadius: borderRadius.md,

  borderWidth: spacing.xxxs,
  borderColor: colors.border,

  // More subtle shadow for iOS
  shadowColor: "#000",
  shadowOpacity: 0.08,
  shadowRadius: 3,
  shadowOffset: {width: 0, height: 1},

  // More subtle elevation for Android
  elevation: 2,

  backgroundColor: colors.backgroundAlt,
})

const $glassesImage: ThemedStyle<ImageStyle> = ({spacing}) => ({
  width: 80,
  height: 80,
  resizeMode: "contain",
  marginRight: 10,
  position: "absolute",
  padding: spacing.sm,
  top: 10,
  left: 10,
})

const $label: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: spacing.lg,
  fontWeight: "600",
  flexWrap: "wrap",
  color: colors.text,
})

const $settingTextContainer: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  paddingLeft: 20,
  paddingRight: 10,
})
