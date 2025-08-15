// GlassesPairingGuides.tsx

import {useAppTheme} from "@/utils/useAppTheme"
import React, {useEffect} from "react"
import {
  View,
  StyleSheet,
  Image,
  TouchableOpacity,
  Linking,
  ImageStyle,
  ViewStyle,
  TextStyle,
  Platform,
} from "react-native"
import {Text} from "@/components/ignite"
import {translate} from "@/i18n"
import {showAlert} from "@/utils/AlertUtils"
import {Spacer} from "./Spacer"
import {GlassesFeatureList} from "@/components/glasses/GlassesFeatureList"
import {MaterialCommunityIcons} from "@expo/vector-icons"
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated"
import {ThemedStyle} from "@/theme"

export function MentraNextGlassesPairingGuide() {
  const {theme, themed} = useAppTheme()

  // Animation values
  const glassesOpacity = useSharedValue(1)
  const glassesTranslateY = useSharedValue(0)
  const glassesScale = useSharedValue(1)
  const caseOpacity = useSharedValue(1)
  const arrowOpacity = useSharedValue(0)
  const finalImageOpacity = useSharedValue(0)

  // Start animation sequence when component mounts
  // useEffect(() => {
  //   const startAnimation = () => {
  //     // Step 1: Show the case
  //     caseOpacity.value = withTiming(1, {duration: 800})

  //     // Step 2: Show arrow after case appears
  //     arrowOpacity.value = withDelay(1000, withTiming(1, {duration: 500}))

  //     // Step 3: Animate glasses moving down and scaling
  //     glassesTranslateY.value = withDelay(
  //       1500,
  //       withTiming(120, {
  //         duration: 1200,
  //         easing: Easing.out(Easing.cubic),
  //       }),
  //     )

  //     glassesScale.value = withDelay(
  //       1500,
  //       withTiming(0.7, {
  //         duration: 1200,
  //         easing: Easing.out(Easing.cubic),
  //       }),
  //     )

  //     // Step 4: Fade out glasses and arrow, show final image
  //     glassesOpacity.value = withDelay(2700, withTiming(0, {duration: 400}))
  //     arrowOpacity.value = withDelay(2700, withTiming(0, {duration: 400}))
  //     finalImageOpacity.value = withDelay(3100, withTiming(1, {duration: 600}))
  //   }

  //   // Start animation after a short delay
  //   const timer = setTimeout(startAnimation, 500)
  //   return () => clearTimeout(timer)
  // }, [])

  useEffect(() => {
    const resetValues = () => {
      glassesOpacity.value = 1
      glassesTranslateY.value = 0
      glassesScale.value = 1
      caseOpacity.value = 1
      arrowOpacity.value = 0
      finalImageOpacity.value = 0
    }

    const startAnimation = () => {
      // Reset all values to initial state
      resetValues()

      // Step 1: Show the case
      // caseOpacity.value = withTiming(1, {duration: 800})

      // Step 3: Animate glasses moving down and scaling
      glassesTranslateY.value = withDelay(
        500,
        withTiming(160, {
          duration: 1800,
          easing: Easing.out(Easing.cubic),
        }),
      )

      glassesScale.value = withDelay(
        500,
        withTiming(0.7, {
          duration: 1200,
          easing: Easing.out(Easing.cubic),
        }),
      )

      // Step 4: Fade out glasses and arrow, show final image
      glassesOpacity.value = withDelay(1000, withTiming(0, {duration: 400}))

      // Step 5: Show final image briefly, then restart
      finalImageOpacity.value = withDelay(
        1000,
        withTiming(1, {duration: 600}, finished => {
          if (finished) {
            // // Hold the final state for 1.5 seconds, then restart
            finalImageOpacity.value = withDelay(
              1000,
              withTiming(0, {duration: 400}, finished => {
                if (finished) {
                  runOnJS(startAnimation)()
                }
              }),
            )
            glassesTranslateY.value = 0
            glassesScale.value = 1
            glassesOpacity.value = withDelay(1000, withTiming(1, {duration: 400}))
          }
        }),
      )
    }

    // short delay before starting the animation
    const timer = setTimeout(startAnimation, 300)
    return () => clearTimeout(timer)
  }, [])

  const animatedGlassesStyle = useAnimatedStyle(() => ({
    opacity: glassesOpacity.value,
    transform: [{translateY: glassesTranslateY.value}, {scale: glassesScale.value}],
  }))

  const animatedCaseStyle = useAnimatedStyle(() => ({
    opacity: caseOpacity.value,
  }))

  const animatedArrowStyle = useAnimatedStyle(() => ({
    opacity: arrowOpacity.value,
  }))

  const animatedFinalImageStyle = useAnimatedStyle(() => ({
    opacity: finalImageOpacity.value,
  }))

  return (
    <View style={themed($guideContainer)}>
      <Text
        text="1. Disconnect your MentraNex from within the MentraNex app, or uninstall the MentraNex app"
        style={themed($guideStep)}
      />
      <Text text="2. Place your MentraNex in the charging case with the lid open." style={themed($guideStep)} />

      <View style={themed($animationContainer)}>
        {/* Glasses Image - Animated */}
        <Animated.View style={[themed($glassesContainer), animatedGlassesStyle]}>
          <Image source={require("../../../assets/glasses/g1.png")} style={themed($glassesImage)} />
        </Animated.View>

        {/* Case Image - Fades in */}
        <Animated.View style={[themed($caseContainer), animatedCaseStyle]}>
          <Image source={require("../../../assets/guide/image_g1_case_closed.png")} style={themed($caseImage)} />
        </Animated.View>

        {/* Arrow - Appears and disappears */}
        <Animated.View style={[themed($arrowContainer), animatedArrowStyle]}>
          <MaterialCommunityIcons name="arrow-down" size={36} color={theme.colors.text} />
        </Animated.View>

        {/* Final paired image - Fades in at the end */}
        <Animated.View style={[themed($caseContainer), animatedFinalImageStyle]}>
          <Image source={require("../../../assets/guide/image_g1_pair.png")} style={themed($caseImage)} />
        </Animated.View>
      </View>
    </View>
  )
}

export function EvenRealitiesG1PairingGuide() {
  const {theme, themed} = useAppTheme()

  // Animation values
  const glassesOpacity = useSharedValue(1)
  const glassesTranslateY = useSharedValue(0)
  const glassesScale = useSharedValue(1)
  const caseOpacity = useSharedValue(1)
  const arrowOpacity = useSharedValue(0)
  const finalImageOpacity = useSharedValue(0)

  // Start animation sequence when component mounts
  // useEffect(() => {
  //   const startAnimation = () => {
  //     // Step 1: Show the case
  //     caseOpacity.value = withTiming(1, {duration: 800})

  //     // Step 2: Show arrow after case appears
  //     arrowOpacity.value = withDelay(1000, withTiming(1, {duration: 500}))

  //     // Step 3: Animate glasses moving down and scaling
  //     glassesTranslateY.value = withDelay(
  //       1500,
  //       withTiming(120, {
  //         duration: 1200,
  //         easing: Easing.out(Easing.cubic),
  //       }),
  //     )

  //     glassesScale.value = withDelay(
  //       1500,
  //       withTiming(0.7, {
  //         duration: 1200,
  //         easing: Easing.out(Easing.cubic),
  //       }),
  //     )

  //     // Step 4: Fade out glasses and arrow, show final image
  //     glassesOpacity.value = withDelay(2700, withTiming(0, {duration: 400}))
  //     arrowOpacity.value = withDelay(2700, withTiming(0, {duration: 400}))
  //     finalImageOpacity.value = withDelay(3100, withTiming(1, {duration: 600}))
  //   }

  //   // Start animation after a short delay
  //   const timer = setTimeout(startAnimation, 500)
  //   return () => clearTimeout(timer)
  // }, [])

  useEffect(() => {
    const resetValues = () => {
      glassesOpacity.value = 1
      glassesTranslateY.value = 0
      glassesScale.value = 1
      caseOpacity.value = 1
      arrowOpacity.value = 0
      finalImageOpacity.value = 0
    }

    const startAnimation = () => {
      // Reset all values to initial state
      resetValues()

      // Step 1: Show the case
      // caseOpacity.value = withTiming(1, {duration: 800})

      // Step 3: Animate glasses moving down and scaling
      glassesTranslateY.value = withDelay(
        500,
        withTiming(160, {
          duration: 1800,
          easing: Easing.out(Easing.cubic),
        }),
      )

      glassesScale.value = withDelay(
        500,
        withTiming(0.7, {
          duration: 1200,
          easing: Easing.out(Easing.cubic),
        }),
      )

      // Step 4: Fade out glasses and arrow, show final image
      glassesOpacity.value = withDelay(1000, withTiming(0, {duration: 400}))

      // Step 5: Show final image briefly, then restart
      finalImageOpacity.value = withDelay(
        1000,
        withTiming(1, {duration: 600}, finished => {
          if (finished) {
            // // Hold the final state for 1.5 seconds, then restart
            finalImageOpacity.value = withDelay(
              1000,
              withTiming(0, {duration: 400}, finished => {
                if (finished) {
                  runOnJS(startAnimation)()
                }
              }),
            )
            glassesTranslateY.value = 0
            glassesScale.value = 1
            glassesOpacity.value = withDelay(1000, withTiming(1, {duration: 400}))
          }
        }),
      )
    }

    // short delay before starting the animation
    const timer = setTimeout(startAnimation, 300)
    return () => clearTimeout(timer)
  }, [])

  const animatedGlassesStyle = useAnimatedStyle(() => ({
    opacity: glassesOpacity.value,
    transform: [{translateY: glassesTranslateY.value}, {scale: glassesScale.value}],
  }))

  const animatedCaseStyle = useAnimatedStyle(() => ({
    opacity: caseOpacity.value,
  }))

  const animatedArrowStyle = useAnimatedStyle(() => ({
    opacity: arrowOpacity.value,
  }))

  const animatedFinalImageStyle = useAnimatedStyle(() => ({
    opacity: finalImageOpacity.value,
  }))

  return (
    <View style={themed($guideContainer)}>
      <Text
        text="1. Disconnect your G1 from within the Even Realities app, or uninstall the Even Realities app"
        style={themed($guideStep)}
      />
      <Text text="2. Place your G1 in the charging case with the lid open." style={themed($guideStep)} />

      <View style={themed($animationContainer)}>
        {/* Glasses Image - Animated */}
        <Animated.View style={[themed($glassesContainer), animatedGlassesStyle]}>
          <Image source={require("../../../assets/glasses/g1.png")} style={themed($glassesImage)} />
        </Animated.View>

        {/* Case Image - Fades in */}
        <Animated.View style={[themed($caseContainer), animatedCaseStyle]}>
          <Image source={require("../../../assets/guide/image_g1_case_closed.png")} style={themed($caseImage)} />
        </Animated.View>

        {/* Arrow - Appears and disappears */}
        <Animated.View style={[themed($arrowContainer), animatedArrowStyle]}>
          <MaterialCommunityIcons name="arrow-down" size={36} color={theme.colors.text} />
        </Animated.View>

        {/* Final paired image - Fades in at the end */}
        <Animated.View style={[themed($caseContainer), animatedFinalImageStyle]}>
          <Image source={require("../../../assets/guide/image_g1_pair.png")} style={themed($caseImage)} />
        </Animated.View>
      </View>
    </View>
  )
}

const $guideContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  marginTop: spacing.lg,
  width: "100%",
  alignSelf: "center",
})

const $guideStep: ThemedStyle<TextStyle> = ({colors, spacing, typography}) => ({
  fontSize: 16,
  marginBottom: spacing.sm,
  color: colors.text,
  fontFamily: typography.primary.normal,
})

const $animationContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  height: 400,
  marginVertical: spacing.lg,
  position: "relative",
  alignItems: "center",
  justifyContent: "center",
})

const $glassesContainer: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  top: 0,
  zIndex: 3,
  alignItems: "center",
  width: "100%",
})

const $glassesImage: ThemedStyle<ImageStyle> = () => ({
  width: 200,
  height: 100,
  resizeMode: "contain",
})

const $caseContainer: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  bottom: 50,
  zIndex: 1,
  alignItems: "center",
  width: "100%",
})

const $caseImage: ThemedStyle<ImageStyle> = () => ({
  width: 250,
  height: 150,
  resizeMode: "contain",
})

const $arrowContainer: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  top: "45%",
  zIndex: 2,
  alignItems: "center",
  width: "100%",
})

const $finalImageContainer: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  bottom: 0,
  zIndex: 4,
  alignItems: "center",
  width: "100%",
})

const $finalImage: ThemedStyle<ImageStyle> = () => ({
  width: "100%",
  height: 200,
  resizeMode: "contain",
})

export function MentraMach1PairingGuide() {
  const {theme} = useAppTheme()
  const textColor = theme.isDark ? "white" : "black"

  return (
    <View style={styles.guideContainer}>
      <Text text="Mentra Mach1" style={[styles.guideTitle, {color: textColor}]} />
      <Text
        text="1. Make sure your Mach1 is fully charged and turned on."
        style={[styles.guideStep, {color: textColor}]}
      />
      <Text
        text="2. Make sure your device is running the latest firmware by using the Vuzix Connect app."
        style={[styles.guideStep, {color: textColor}]}
      />
      <Text
        text="3. Put your Mentra Mach1 in pairing mode: hold the power button until you see the Bluetooth icon, then release."
        style={[styles.guideStep, {color: textColor}]}
      />
    </View>
  )
}

export function MentraLivePairingGuide() {
  const {theme} = useAppTheme()

  return (
    <View style={styles.guideContainer}>
      <View style={{justifyContent: "flex-start", flexDirection: "column"}}>
        {/* <ScrollView style={{}} nestedScrollEnabled={true}> */}
        <Text text="Mentra Live" style={[styles.guideTitle, {color: theme.colors.text}]} />

        {/* <Text style={[styles.guideStep, {color: theme.colors.text}]}>
        1. Make sure your Mentra Live is fully charged and turned on.
        </Text>
        <Text style={[styles.guideStep, {color: theme.colors.text}]}>
        2. Make sure your Mentra Live is not already paired to a different device.
        </Text> */}

        {/* Product image would go here */}
        <Image
          source={require("../../../assets/glasses/mentra_live.png")}
          style={[styles.guideImage, {marginVertical: 0}]}
          // Fallback if image doesn't exist
          onError={e => console.log("Image failed to load")}
        />

        {/* Feature list */}
        <GlassesFeatureList glassesModel="Mentra Live" />

        {/* Marketing description */}
        <Text
          text="Mentra Live brings the power of computer vision to your everyday life. With a camera that sees what you see, you can build and run AI apps that recognize objects, translate text, remember faces, and more. Perfect for developers creating the next generation of augmented reality experiences."
          style={[styles.guideDescription, {color: theme.colors.text}]}
        />
        {/* </ScrollView> */}

        <View style={styles.buySection}>
          <TouchableOpacity
            style={[styles.preorderButton, {backgroundColor: theme.colors.tint}]}
            onPress={() => {
              // Linking.openURL("https://mentra.glass/live")
              showAlert("Open External Website", "This will open mentra.glass in your web browser. Continue?", [
                {
                  text: "Cancel",
                  style: "cancel",
                },
                {
                  text: "Continue",
                  onPress: () => Linking.openURL("https://mentra.glass/live"),
                },
              ])
            }}>
            <Text
              text={`${translate("pairing:preorderNow")}`}
              style={[styles.buyButtonText, {color: theme.colors.background}]}
            />
            <Text
              tx="pairing:preorderNowShipMessage"
              style={[styles.shippingText, {color: theme.colors.background, opacity: 0.8}]}
            />
          </TouchableOpacity>
          <Spacer height={theme.spacing.md} />
        </View>
      </View>
    </View>
  )
}

export function AudioWearablePairingGuide() {
  const {theme} = useAppTheme()
  const textColor = theme.isDark ? "white" : "black"

  return (
    <View style={styles.guideContainer}>
      <Text text="Audio Wearable" style={[styles.guideTitle, {color: textColor}]} />
      <Text
        text="1. Make sure your Audio Wearable is fully charged and turned on."
        style={[styles.guideStep, {color: textColor}]}
      />
      <Text
        text="2. Enable Bluetooth pairing mode on your Audio Wearable."
        style={[styles.guideStep, {color: textColor}]}
      />
      <Text
        text="3. Note: Audio Wearables don't have displays. All visual information will be converted to speech."
        style={[styles.guideStep, {color: textColor}]}
      />
      <Text
        text="Audio Wearables are smart glasses without displays. They use text-to-speech to provide information that would normally be shown visually. This makes them ideal for audio-only applications or for users who prefer auditory feedback."
        style={[styles.guideDescription, {color: textColor}]}
      />
    </View>
  )
}

export function VuzixZ100PairingGuide() {
  const {theme} = useAppTheme()
  const textColor = theme.isDark ? "white" : "black"

  return (
    <View style={styles.guideContainer}>
      <Text text="Vuzix Z100" style={[styles.guideTitle, {color: textColor}]} />
      <Text
        text="1. Make sure your Vuzix Z100 is fully charged and turned on."
        style={[styles.guideStep, {color: textColor}]}
      />
      <Text
        text="2. Make sure your device is running the latest firmware by using the Vuzix Connect app."
        style={[styles.guideStep, {color: textColor}]}
      />
      <Text
        text="3. Put your Vuzix Z100 in pairing mode: hold the power button until you see the Bluetooth icon, then release."
        style={[styles.guideStep, {color: textColor}]}
      />
    </View>
  )
}

export function VirtualWearablePairingGuide() {
  const {theme} = useAppTheme()
  return (
    <View style={styles.guideContainer}>
      <Text text="Simulated Glasses" style={[styles.guideTitle, {color: theme.colors.text}]} />
      <Text tx="pairing:simulatedGlassesDescription" style={[styles.guideStep, {color: theme.colors.text}]} />
    </View>
  )
}

const styles = StyleSheet.create({
  // guideContainer: {
  //   marginTop: 20,
  //   width: '90%',
  // },
  // guideTitle: {
  //   fontSize: 18,
  //   fontWeight: 'bold',
  //   marginBottom: 10,
  // },
  // guideStep: {
  //   fontSize: 16,
  //   marginBottom: 8,
  // },
  // guideDescription: {
  //   fontSize: 14,
  //   marginTop: 12,
  //   marginBottom: 8,
  //   fontStyle: 'italic',
  // },
  // guideImage: {
  //   width: '100%',
  //   height: 200, // Adjust height as needed
  //   resizeMode: 'contain',
  //   marginVertical: 10,
  // },

  guideContainer: {
    marginTop: 20,
    width: "100%",
    alignSelf: "center",
  },
  guideTitle: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 10,
  },
  marketingBanner: {
    borderRadius: 8,
    marginBottom: 15,
    padding: 12,
  },
  marketingTag: {
    fontSize: 12,
    fontWeight: "bold",
    marginBottom: 5,
  },
  marketingText: {
    fontSize: 16,
    fontWeight: "500",
  },
  guideStep: {
    fontSize: 16,
    marginBottom: 8,
  },
  guideDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
    marginTop: 20,
  },
  guideImage: {
    height: 180,
    marginVertical: 15,
    resizeMode: "contain",
    width: "100%",
  },
  featuresContainer: {
    alignItems: "center",
    borderRadius: 16,
    flexDirection: "column",
    padding: 12,
    paddingLeft: 36,
  },
  featuresRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  featureItem: {
    alignItems: "center",
    alignSelf: "center",
    flexDirection: "row",
    flex: 1,
    marginBottom: 12,
  },
  featureText: {
    fontSize: 14,
    fontWeight: "500",
    marginLeft: 10,
  },
  buySection: {
    marginTop: 20,
  },
  preorderButton: {
    alignItems: "center",
    borderRadius: 30,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 12,
    width: "100%",
  },
  buyButtonText: {
    fontSize: 16,
    fontWeight: "bold",
  },
  shippingText: {
    fontSize: 12,
    marginTop: 4,
  },
})
