// GlassesPairingGuides.tsx

import {useAppTheme} from "@/utils/useAppTheme"
import React from "react"
import {View, Text, StyleSheet, Image, TouchableOpacity, Linking} from "react-native"
import FontAwesome from "react-native-vector-icons/FontAwesome"
import {Button} from "@/components/ignite"
import {translate} from "@/i18n"
import {showAlert} from "@/utils/AlertUtils"
import {Spacer} from "./Spacer"

// 2) Declare each guide component with the correct prop type
export function EvenRealitiesG1PairingGuide() {
  const {theme} = useAppTheme()
  const textColor = theme.isDark ? "white" : "black"

  return (
    <View style={styles.guideContainer}>
      <Text style={[styles.guideTitle, {color: textColor}]}>Even Realities G1</Text>
      <Text style={[styles.guideStep, {color: textColor}]}>
        1. Disconnect your G1 from within the Even Realities app, or uninstall the Even Realities app
      </Text>
      <Text style={[styles.guideStep, {color: textColor}]}>
        2. Place your G1 in the charging case with the lid open.
      </Text>

      <Image
        source={require("../../../assets/glasses/g1.png")}
        style={{...styles.guideImage, width: "60%", alignSelf: "center"}}
      />

      <FontAwesome name="arrow-down" size={36} color={textColor} style={{alignSelf: "center", marginTop: -36}} />

      <Image source={require("../../../assets/guide/image_g1_pair.png")} style={styles.guideImage} />
    </View>
  )
}

export function VuzixZ100PairingGuide() {
  const {theme} = useAppTheme()
  const textColor = theme.isDark ? "white" : "black"

  return (
    <View style={styles.guideContainer}>
      <Text style={[styles.guideTitle, {color: textColor}]}>Vuzix Z100</Text>
      <Text style={[styles.guideStep, {color: textColor}]}>1. Make sure your Z100 is fully charged and turned on.</Text>
      <Text style={[styles.guideStep, {color: textColor}]}>
        2. Pair your Z100 with your device using the Vuzix Connect app.
      </Text>
    </View>
  )
}

export function MentraMach1PairingGuide() {
  const {theme} = useAppTheme()
  const textColor = theme.isDark ? "white" : "black"

  return (
    <View style={styles.guideContainer}>
      <Text style={[styles.guideTitle, {color: textColor}]}>Mentra Mach1</Text>
      <Text style={[styles.guideStep, {color: textColor}]}>
        1. Make sure your Mach1 is fully charged and turned on.
      </Text>
      <Text style={[styles.guideStep, {color: textColor}]}>
        2. Pair your Mach1 with your device using the Vuzix Connect app.
      </Text>
    </View>
  )
}

export function MentraLivePairingGuide() {
  const {theme} = useAppTheme()

  return (
    <View style={styles.guideContainer}>
      <View style={{flex: 1, justifyContent: "space-between", flexDirection: "column"}}>
        {/* <ScrollView style={{}} nestedScrollEnabled={true}> */}
        <Text style={[styles.guideTitle, {color: theme.colors.text}]}>Mentra Live [Beta]</Text>

        {/* <Text style={[styles.guideStep, {color: theme.colors.text}]}>
        1. Make sure your Mentra Live is fully charged and turned on.
        </Text>
        <Text style={[styles.guideStep, {color: theme.colors.text}]}>
        2. Make sure your Mentra Live is not already paired to a different device.
        </Text> */}

        {/* Product image would go here */}
        <Image
          source={require("../../../assets/glasses/mentra_live.png")}
          style={styles.guideImage}
          // Fallback if image doesn't exist
          onError={e => console.log("Image failed to load")}
        />
        {/* Feature highlights */}
        <View style={styles.featuresContainer}>
          <View style={[styles.featuresRow]}>
            <View style={styles.featureItem}>
              <FontAwesome name="camera" size={24} color={theme.colors.text} />
              <Text style={[styles.featureText, {color: theme.colors.text}]}>Camera</Text>
            </View>
            <View style={styles.featureItem}>
              <FontAwesome name="microphone" size={24} color={theme.colors.text} />
              <Text style={[styles.featureText, {color: theme.colors.text}]}>Microphone</Text>
            </View>
          </View>
          <View style={[styles.featuresRow]}>
            <View style={styles.featureItem}>
              <FontAwesome name="volume-up" size={24} color={theme.colors.text} />
              <Text style={[styles.featureText, {color: theme.colors.text}]}>Speakers</Text>
            </View>
            <View style={styles.featureItem}>
              <FontAwesome name="bluetooth" size={24} color={theme.colors.text} />
              <Text style={[styles.featureText, {color: theme.colors.text}]}>Bluetooth</Text>
            </View>
          </View>
        </View>

        {/* Marketing description */}
        <Text style={[styles.guideDescription, {color: theme.colors.text}]}>
          Mentra Live brings the power of computer vision to your everyday life. With a camera that sees what you see,
          you can build and run AI apps that recognize objects, translate text, remember faces, and more. Perfect for
          developers creating the next generation of augmented reality experiences.
        </Text>
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
            }}
          >
            <Text style={[styles.buyButtonText, {color: theme.colors.background}]}>{translate("pairing:preorderNow")} · $219</Text>
            <Text style={[styles.shippingText, {color: theme.colors.background, opacity: 0.8}]}>{translate("pairing:preorderNowShipMessage")}</Text>
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
      <Text style={[styles.guideTitle, {color: textColor}]}>Audio Wearable</Text>
      <Text style={[styles.guideStep, {color: textColor}]}>
        1. Make sure your Audio Wearable is fully charged and turned on.
      </Text>
      <Text style={[styles.guideStep, {color: textColor}]}>
        2. Enable Bluetooth pairing mode on your Audio Wearable.
      </Text>
      <Text style={[styles.guideStep, {color: textColor}]}>
        3. Note: Audio Wearables don't have displays. All visual information will be converted to speech.
      </Text>
      <Text style={[styles.guideDescription, {color: textColor}]}>
        Audio Wearables are smart glasses without displays. They use text-to-speech to provide information that would
        normally be shown visually. This makes them ideal for audio-only applications or for users who prefer auditory
        feedback.
      </Text>
    </View>
  )
}

export function VirtualWearablePairingGuide() {
  const {theme} = useAppTheme()
  return (
    <View style={styles.guideContainer}>
      <Text style={[styles.guideTitle, {color: theme.colors.text}]}>Simulated Glasses</Text>
      <Text style={[styles.guideStep, {color: theme.colors.text}]}>
        The Simulated Glasses allows you to run AugmentOS without physical smart glasses.
      </Text>
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
    width: "90%",
  },
  guideTitle: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 10,
  },
  marketingBanner: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 15,
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
    marginTop: 20,
    marginBottom: 20,
    lineHeight: 20,
  },
  guideImage: {
    width: "100%",
    height: 180,
    resizeMode: "contain",
    marginVertical: 15,
  },
  featuresContainer: {
    flexDirection: "column",
    alignItems: "center",
    borderRadius: 16,
    padding: 12,
    paddingLeft: 36,
  },
  featuresRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    marginBottom: 12,
    flex: 1,
  },
  featureText: {
    marginLeft: 10,
    fontSize: 14,
    fontWeight: "500",
  },
  buySection: {
    marginTop: 20,
  },
  preorderButton: {
    minHeight: 44,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
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
