import React, {useEffect} from "react"
import {View, ViewStyle, TextStyle} from "react-native"
import {router, useLocalSearchParams} from "expo-router"
import {useAppTheme} from "@/utils/useAppTheme"
import {Screen, Header, Text, Button} from "@/components/ignite"
import {ThemedStyle} from "@/theme"
import Icon from "react-native-vector-icons/FontAwesome"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import Animated, {useAnimatedStyle, useSharedValue, withTiming} from "react-native-reanimated"
import {CoreCommunicator} from "@/bridge/CoreCommunicator"
import {translate} from "@/i18n/translate"
import {TxKeyPath} from "@/i18n"

export default function PairingFailureScreen() {
  const {themed, theme} = useAppTheme()
  const {clearHistory, replace, clearHistoryAndGoHome} = useNavigationHistory()

  const {error, glassesModelName}: {error: string; glassesModelName?: string} = useLocalSearchParams()

  const fadeInOpacity = useSharedValue(0)
  const slideUpTranslate = useSharedValue(50)

  const animatedContainerStyle = useAnimatedStyle(() => ({
    opacity: fadeInOpacity.value,
    transform: [{translateY: slideUpTranslate.value}],
  }))

  useEffect(() => {
    fadeInOpacity.value = withTiming(1, {duration: 800})
    slideUpTranslate.value = withTiming(0, {duration: 800})
  }, [])

  const handleRetry = () => {
    CoreCommunicator.getInstance().sendForgetSmartGlasses()
    clearHistory()
    replace("/pairing/select-glasses-model")
  }

  const handleGoHome = () => {
    clearHistoryAndGoHome()
  }

  return (
    <Screen preset="fixed" style={themed($screen)}>
      <Header />

      <Animated.View style={[themed($container), animatedContainerStyle]}>
        <View style={themed($iconContainer)}>
          <Icon name="exclamation-circle" size={80} color={theme.colors.error} />
        </View>

        <Text tx="pairing:pairingFailed" preset="heading" style={themed($title)} />

        <Text
          text={translate(error as TxKeyPath, {glassesModel: glassesModelName || "glasses"})}
          preset="default"
          style={themed($description)}
        />

        <View style={themed($buttonContainer)}>
          <Button tx="pairing:tryAgain" preset="filled" onPress={handleRetry} style={themed($button)} />

          <Button
            tx="pairing:goHome"
            preset="filled"
            onPress={handleGoHome}
            style={[themed($button), themed($secondaryButton)]}
          />
        </View>

        {/* <View style={themed($helpContainer)}>
          <Icon name="info-circle" size={16} color={theme.colors.textDim} />
          <Text
            text="Make sure your glasses are powered on and in pairing mode"
            preset="formHelper"
            style={themed($helpText)}
          />
        </View> */}
      </Animated.View>
    </Screen>
  )
}

const $screen: ThemedStyle<ViewStyle> = ({spacing}) => ({
  paddingHorizontal: spacing.md,
})

const $container: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  alignItems: "center",
  justifyContent: "center",
  paddingHorizontal: spacing.md,
})

const $iconContainer: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  padding: spacing.lg,
  borderRadius: 130,
  backgroundColor: colors.errorBackground || colors.palette.angry100,
  marginBottom: spacing.xl,
  width: 130,
  height: 130,
  alignItems: "center",
  justifyContent: "center",
})

const $title: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 28,
  fontWeight: "bold",
  marginBottom: spacing.md,
  textAlign: "center",
  color: colors.text,
})

const $description: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 16,
  textAlign: "center",
  marginBottom: spacing.xxl,
  lineHeight: 24,
  paddingHorizontal: spacing.md,
  color: colors.textDim,
})

const $buttonContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  width: "100%",
  paddingHorizontal: spacing.md,
  gap: spacing.sm,
})

const $button: ThemedStyle<ViewStyle> = () => ({
  width: "100%",
})

const $secondaryButton: ThemedStyle<ViewStyle> = ({colors}) => ({
  backgroundColor: colors.palette.neutral600,
  borderWidth: 1,
  borderColor: colors.border,
})

const $helpContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  alignItems: "center",
  marginTop: spacing.xxl,
  paddingHorizontal: spacing.lg,
  gap: spacing.xs,
})

const $helpText: ThemedStyle<TextStyle> = ({colors}) => ({
  flex: 1,
  fontSize: 13,
  textAlign: "center",
  color: colors.textDim,
})
