import React, {useEffect, useRef} from "react"
import {View, Text, StyleSheet, TouchableOpacity, Animated} from "react-native"
import coreCommunicator from "@/bridge/CoreCommunicator"
import {useStatus} from "@/contexts/AugmentOSStatusProvider"
import {useGlassesMirror} from "@/contexts/GlassesMirrorContext"
import GlassesDisplayMirror from "./GlassesDisplayMirror"
import {useAppTheme} from "@/utils/useAppTheme"

export default function ConnectedSimulatedGlassesInfo() {
  const fadeAnim = useRef(new Animated.Value(0)).current
  const scaleAnim = useRef(new Animated.Value(0.8)).current
  const {status} = useStatus()
  const {events} = useGlassesMirror()

  // Get the last event to display in the mirror
  const lastEvent = events.length > 0 ? events[events.length - 1] : null

  useEffect(() => {
    // Start animations
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 60,
        useNativeDriver: true,
      }),
    ]).start()

    // Cleanup function
    return () => {
      fadeAnim.stopAnimation()
      scaleAnim.stopAnimation()
    }
  }, [])

  const sendDisconnectWearable = async () => {
    console.log("Disconnecting simulated wearable")
    try {
      await coreCommunicator.sendDisconnectWearable()
      await coreCommunicator.sendForgetSmartGlasses()
    } catch (error) {
      console.error("Error disconnecting simulated wearable:", error)
    }
  }

  const {theme} = useAppTheme()

  return (
    <View style={styles.connectedContent}>
      {/* Mirror Display Area - Takes up all available space above bottom bar */}
      <Animated.View
        style={[
          styles.mirrorWrapper,
          {
            opacity: fadeAnim,
            transform: [{scale: scaleAnim}],
          },
        ]}>
        <GlassesDisplayMirror layout={lastEvent?.layout} fallbackMessage="Simulated Glasses Display" />
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  bottomBar: {
    alignItems: "center",
    backgroundColor: "#6750A414",
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 10,
    width: "100%",
  },
  connectedContent: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    marginBottom: 0,
  },
  deviceInfoContainer: {
    borderRadius: 10,
    display: "flex",
    flexDirection: "column",
    height: 230,
    justifyContent: "space-between",
    marginTop: 16,
    paddingBottom: 0,
    paddingHorizontal: 10,
    paddingTop: 10,
    width: "100%", // Increased space above component to match ConnectedDeviceInfo
  },
  disconnectButton: {
    alignItems: "center",
    backgroundColor: "#E24A24",
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  disconnectText: {
    color: "#fff",
    fontFamily: "Montserrat-Regular",
    fontSize: 12,
    fontWeight: "500",
  },
  mirrorContainer: {
    height: "100%",
    padding: 0,
    width: "100%",
  },
  mirrorWrapper: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    marginBottom: 0,
    width: "100%",
  },
  simulatedGlassesText: {
    fontFamily: "Montserrat-Bold",
    fontSize: 16,
    fontWeight: "bold",
  },
})
