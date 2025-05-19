import React, { useState, useRef, useEffect } from "react"
import {
  View,
  TextInput,
  TouchableOpacity,
  Animated,
  ImageStyle,
  TextStyle,
  ViewStyle,
  Dimensions,
} from "react-native"
import { Button, Screen, Text } from "@/components"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"
import { ThemedStyle } from "@/theme"
import { useAppTheme } from "@/utils/useAppTheme"
import LinearGradient from "react-native-linear-gradient"
import { FontAwesome } from "@expo/vector-icons"
import GoogleIcon from "assets/icons/GoogleIcon"
import AppleIcon from "assets/icons/AppleIcon"

interface IntroScreenProps {
  navigation: any
}

export default function IntroScreen({ navigation }: IntroScreenProps) {
  const [isSigningUp, setIsSigningUp] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  const { theme, themed } = useAppTheme()
  const $bottomContainerInsets = useSafeAreaInsetsStyle(["bottom"])

  const opacity = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(20)).current
  const formScale = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start()
  }, [opacity, translateY])

  useEffect(() => {
    if (isSigningUp) {
      Animated.spring(formScale, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }).start()
    } else {
      formScale.setValue(0)
    }
  }, [formScale, isSigningUp])

  const handleGoogleSignIn = async () => {
    try {
      // Implement Google sign in logic
      console.log("Google sign in")
      // After successful sign in
      navigation.replace("Home")
    } catch (error) {
      console.error("Google sign in failed:", error)
    }
  }

  const handleAppleSignIn = async () => {
    try {
      // Implement Apple sign in logic
      console.log("Apple sign in")
      // After successful sign in
      navigation.replace("Home")
    } catch (error) {
      console.error("Apple sign in failed:", error)
    }
  }

  const handleEmailSignUp = async () => {
    try {
      // Implement email sign up logic
      console.log("Email sign up:", { email, password })
      // After successful sign up and sign in
      navigation.replace("Home")
    } catch (error) {
      console.error("Email sign up failed:", error)
    }
  }

  const handleEmailSignIn = async () => {
    try {
      // Implement email sign in logic
      console.log("Email sign in:", { email, password })
      // After successful sign in
      navigation.replace("Home")
    } catch (error) {
      console.error("Email sign in failed:", error)
    }
  }

  return (
    <Screen
      preset="fixed"
      safeAreaEdges={["top"]}
      contentContainerStyle={themed($container)}
      backgroundColor={theme.colors.palette.neutral100}
    >
      <LinearGradient
        colors={[theme.colors.palette.neutral100, theme.colors.background]}
        style={themed($gradientContainer)}
      >
        <View style={themed($topContainer)}>
          <Animated.View style={[{ opacity, transform: [{ translateY }] }]}>
            <Text text="AugmentOS" preset="heading" style={themed($title)} />
            <Text
              text="The future of smart glasses starts here."
              preset="subheading"
              style={themed($subtitle)}
            />
          </Animated.View>

          <Animated.View
            style={[themed($contentContainer), { opacity, transform: [{ translateY }] }]}
          >
            {isSigningUp ? (
              <Animated.View
                style={[themed($formContainer), { transform: [{ scale: formScale }] }]}
              >
                <View style={themed($inputGroup)}>
                  <Text text="Email" preset="formLabel" style={themed($inputLabel)} />
                  <View style={themed($inputContainer)}>
                    <FontAwesome name="envelope" size={16} color={theme.colors.text} />
                    <TextInput
                      style={themed($input)}
                      placeholder="you@example.com"
                      value={email}
                      onChangeText={setEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      placeholderTextColor={theme.colors.textDim}
                    />
                  </View>
                </View>

                <View style={themed($inputGroup)}>
                  <Text text="Password" preset="formLabel" style={themed($inputLabel)} />
                  <View style={themed($inputContainer)}>
                    <FontAwesome name="lock" size={16} color={theme.colors.text} />
                    <TextInput
                      style={themed($input)}
                      placeholder="Enter your password"
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry
                      placeholderTextColor={theme.colors.textDim}
                    />
                  </View>
                </View>

                <Button style={themed($primaryButton)} onPress={handleEmailSignUp}>
                  <Text tx="login:login" style={themed($primaryButtonText)} weight="bold" />
                </Button>

                <Button style={themed($primaryButton)} onPress={handleEmailSignIn}>
                  <Text tx="login:signup.email" style={themed($primaryButtonText)} weight="bold" />
                </Button>

                <TouchableOpacity
                  style={themed($ghostButton)}
                  onPress={() => setIsSigningUp(false)}
                >
                  <FontAwesome name="arrow-left" size={16} color={theme.colors.textDim} />
                  <Text
                    tx="login:signup.back"
                    style={themed($ghostButtonText)}
                    weight="medium"
                  />
                </TouchableOpacity>
              </Animated.View>
            ) : (
              <View style={themed($signInOptions)}>
                <TouchableOpacity
                  style={[themed($socialButton), themed($googleButton)]}
                  onPress={handleGoogleSignIn}
                >
                  <View style={themed($socialIconContainer)}>
                    <GoogleIcon />
                  </View>
                  <Text tx="login:signup.google" style={themed($socialButtonText)} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[themed($socialButton), themed($appleButton)]}
                  onPress={handleAppleSignIn}
                >
                  <View style={themed($socialIconContainer)}>
                    <AppleIcon />
                  </View>
                  <Text
                    tx="login:signup.apple"
                    style={[themed($socialButtonText), themed($appleButtonText)]}
                  />
                </TouchableOpacity>

                <View style={themed($dividerContainer)}>
                  <View style={themed($divider)} />
                  <Text tx="login:or" style={themed($dividerText)} />
                  <View style={themed($divider)} />
                </View>

                <Button style={themed($emailButton)} onPress={() => setIsSigningUp(true)}>
                  <FontAwesome name="envelope" size={16} color="white" style={{ marginRight: 32 }} />
                  <Text tx="login:continue.email" style={themed($emailButtonText)} weight="bold" />
                </Button>
              </View>
            )}
          </Animated.View>
        </View>

        <View style={[themed($bottomContainer), $bottomContainerInsets]}>
          <Animated.View style={{ opacity }}>
            <Text
              text="By continuing, you agree to our Terms of Service and Privacy Policy"
              size="xs"
              style={themed($termsText)}
            />
          </Animated.View>
        </View>
      </LinearGradient>
    </Screen>
  )
}

// Styled components using ThemedStyle pattern
const { width } = Dimensions.get("window")

const $container: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flex: 1,
  backgroundColor: colors.background,
})

const $gradientContainer: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $topContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexShrink: 1,
  flexGrow: 1,
  flexBasis: "85%",
  justifyContent: "center",
  paddingHorizontal: spacing.lg,
})

const $bottomContainer: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexShrink: 1,
  flexGrow: 0,
  flexBasis: "15%",
  backgroundColor: colors.background,
  paddingHorizontal: spacing.lg,
  justifyContent: "center",
  alignItems: "center",
})

const $contentContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginTop: spacing.xl,
})

const $title: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  fontSize: 46,
  color: colors.text,
  textAlign: "center",
  marginBottom: spacing.xs,
})

const $subtitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  textAlign: "center",
})

const $formContainer: ThemedStyle<ViewStyle> = () => ({
  width: "100%",
})

const $inputGroup: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginBottom: spacing.md,
})

const $inputLabel: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.text,
  marginBottom: spacing.xs,
})

const $inputContainer: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  height: 48,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: 12,
  paddingHorizontal: spacing.md,
  backgroundColor: colors.background,
  shadowOffset: {
    width: 0,
    height: 1,
  },
  shadowOpacity: 0.1,
  shadowRadius: 2,
  elevation: 2,
})

const $inputIcon: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginRight: spacing.sm,
})

const $input: ThemedStyle<TextStyle> = ({ colors }) => ({
  flex: 1,
  fontSize: 16,
  color: colors.text,
})

const $signInOptions: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
})

const $socialButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  height: 44,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: spacing.xs,
  paddingHorizontal: spacing.md,
  marginBottom: spacing.xs,
  shadowOffset: {
    width: 0,
    height: 1,
  },
  shadowOpacity: 0.1,
  shadowRadius: 1,
  elevation: 1,
})

const $googleButton: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.background,
})

const $appleButton: ThemedStyle<ViewStyle> = () => ({
  backgroundColor: "black",
  borderColor: "black",
})

const $socialIconContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: 24,
  height: 24,
  justifyContent: "center",
  alignItems: "center",
  marginRight: spacing.sm,
})

const $socialButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 15,
  color: colors.text,
  flex: 1,
  textAlign: "center",
})

const $appleButtonText: ThemedStyle<TextStyle> = () => ({
  color: "white",
})

const $buttonGradient: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 12,
  padding: spacing.sm,
})

const $primaryButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  marginTop: spacing.xs,
  borderRadius: 12,
  overflow: "hidden",
  shadowOffset: {
    width: 0,
    height: 2,
  },
  shadowOpacity: 0.25,
  shadowRadius: 3.84,
  elevation: 5,
})

const $emailButton: ThemedStyle<ViewStyle> = ({ colors }) => ({
  borderRadius: 12,
  overflow: "hidden",
  shadowOffset: {
    width: 0,
    height: 2,
  },
  shadowOpacity: 0.25,
  shadowRadius: 3.84,
  elevation: 5,
})

const $primaryButtonText: ThemedStyle<TextStyle> = () => ({
  color: "white",
  fontSize: 16,
})

const $emailButtonText: ThemedStyle<TextStyle> = () => ({
  color: "white",
  fontSize: 16,
})

const $ghostButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  height: 48,
  borderRadius: 12,
  justifyContent: "center",
  alignItems: "center",
  marginTop: spacing.md,
})

const $backIcon: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginRight: spacing.xs,
})

const $emailIcon: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginRight: spacing.xs,
})

const $ghostButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  fontSize: 15,
})

const $dividerContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  marginVertical: spacing.md,
})

const $divider: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flex: 1,
  height: 1,
  backgroundColor: colors.border,
})

const $dividerText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  paddingHorizontal: spacing.md,
  color: colors.textDim,
  fontSize: 12,
  textTransform: "uppercase",
})

const $termsText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  textAlign: "center",
})
