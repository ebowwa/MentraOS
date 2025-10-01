import {useState, useCallback} from "react"
import {View, TouchableOpacity, Platform, ScrollView, Image, ViewStyle, ImageStyle} from "react-native"
import {Text} from "@/components/ignite"
import {useFocusEffect} from "@react-navigation/native"
import Icon from "react-native-vector-icons/FontAwesome"
import {getGlassesImage} from "@/utils/getGlassesImage"
import {useAppTheme} from "@/utils/useAppTheme"
import {router} from "expo-router"
import {Screen} from "@/components/ignite/Screen"
import {Header} from "@/components/ignite"
import {ThemedStyle} from "@/theme"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import Svg, {Defs, RadialGradient, Rect, Stop} from "react-native-svg"
import {useSettingsStore, SETTINGS_KEYS} from "@/stores/settings"

export default function SelectGlassesModelScreen() {
  const [isOnboarding, setIsOnboarding] = useState(false)
  const {theme, themed} = useAppTheme()
  const {push} = useNavigationHistory()

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

  // Check onboarding status when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      const checkOnboardingStatus = async () => {
        const onboardingCompleted = await useSettingsStore.getState().loadSetting(SETTINGS_KEYS.onboarding_completed)
        console.log("ONBOARDING COMPLETED IN SELECTGLASSESMODELSCREEN???: " + onboardingCompleted)
        setIsOnboarding(!onboardingCompleted)
      }

      checkOnboardingStatus()
    }, []),
  )

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
            <Stop
              offset="0"
              stopColor={theme.isDark ? theme.colors.palette.primary500 : theme.colors.palette.primary300}
            />
            <Stop
              offset="1"
              stopColor={theme.isDark ? theme.colors.palette.primary200 : theme.colors.palette.primary100}
            />
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
          if (isOnboarding) {
            router.back()
          } else {
            router.replace({pathname: "/(tabs)/home"})
          }
        }}
      />
      <ScrollView style={{marginRight: -theme.spacing.md, paddingRight: theme.spacing.md}}>
        {/** RENDER EACH GLASSES OPTION */}
        {glassesOptions
          .filter(glasses => {
            // Hide simulated glasses during onboarding (users get there via "I don't have glasses yet")
            if (isOnboarding && glasses.modelName === "Simulated Glasses") {
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
              <View style={styles.settingTextContainer}>
                <Text
                  style={[
                    styles.label,
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

  backgroundColor: colors.background,
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

const styles = {
  settingTextContainer: {
    flex: 1,
    paddingLeft: 20,
    paddingRight: 10,
  },
  label: {
    fontSize: 18, // bigger text size
    fontWeight: "600",
    flexWrap: "wrap",
  },
}
