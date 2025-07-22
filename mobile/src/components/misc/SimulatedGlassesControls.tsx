import React from "react"
import {View, StyleSheet, TouchableOpacity} from "react-native"
import Icon from "react-native-vector-icons/MaterialIcons"
import CoreCommunicator from "@/bridge/CoreCommunicator"

interface SimulatedGlassesControlsProps {
  theme: any
  insets: any
}

export const SimulatedGlassesControls: React.FC<SimulatedGlassesControlsProps> = ({theme, insets}) => {
  const handleHeadUp = async () => {
    console.log("SimulatedGlassesControls: Head up button pressed")
    try {
      const result = await CoreCommunicator.simulateHeadPosition("up")
      console.log("SimulatedGlassesControls: Head up command sent successfully, result:", result)
    } catch (error) {
      console.error("Failed to simulate head up:", error)
      console.error("Error details:", JSON.stringify(error))
    }
  }

  const handleHeadDown = async () => {
    console.log("SimulatedGlassesControls: Head down button pressed")
    try {
      const result = await CoreCommunicator.simulateHeadPosition("down")
      console.log("SimulatedGlassesControls: Head down command sent successfully, result:", result)
    } catch (error) {
      console.error("Failed to simulate head down:", error)
      console.error("Error details:", JSON.stringify(error))
    }
  }

  const handleButtonPress = async (pressType: "short" | "long") => {
    console.log(`SimulatedGlassesControls: Button ${pressType} press triggered`)
    try {
      const result = await CoreCommunicator.simulateButtonPress("camera", pressType)
      console.log(`SimulatedGlassesControls: Button ${pressType} press command sent successfully, result:`, result)
    } catch (error) {
      console.error("Failed to simulate button press:", error)
      console.error("Error details:", JSON.stringify(error))
    }
  }

  // Handle press in/out for detecting short vs long press
  let pressTimer: NodeJS.Timeout | null = null

  const handlePressIn = () => {
    console.log("SimulatedGlassesControls: Button press started")
    // Set a timer for long press (500ms threshold)
    pressTimer = setTimeout(() => {
      handleButtonPress("long")
      pressTimer = null
    }, 500)
  }

  const handlePressOut = () => {
    console.log("SimulatedGlassesControls: Button press ended")
    // If timer is still active, it was a short press
    if (pressTimer) {
      clearTimeout(pressTimer)
      pressTimer = null
      handleButtonPress("short")
    }
  }

  return (
    <>
      {/* Head Up button - right side, upper middle */}
      <TouchableOpacity
        onPress={handleHeadUp}
        style={[
          styles.edgeButton,
          styles.rightSide,
          {
            backgroundColor: theme.colors.palette.secondary200,
            top: insets.top + 120,
          },
        ]}>
        <Icon name="keyboard-arrow-up" size={28} color={theme.colors.icon} />
      </TouchableOpacity>

      {/* Head Down button - right side, below head up */}
      <TouchableOpacity
        onPress={handleHeadDown}
        style={[
          styles.edgeButton,
          styles.rightSide,
          {
            backgroundColor: theme.colors.palette.secondary200,
            top: insets.top + 180,
          },
        ]}>
        <Icon name="keyboard-arrow-down" size={28} color={theme.colors.icon} />
      </TouchableOpacity>

      {/* Button Press - single button for both short and long press */}
      <TouchableOpacity
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[
          styles.edgeButton,
          {
            backgroundColor: theme.colors.palette.secondary200,
            bottom: insets.bottom + 40,
            left: 20,
          },
        ]}>
        <Icon name="touch-app" size={24} color={theme.colors.icon} />
      </TouchableOpacity>
    </>
  )
}

const styles = StyleSheet.create({
  edgeButton: {
    position: "absolute",
    width: 48,
    height: 48,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 20,
  },
  rightSide: {
    right: 20,
  },
})
