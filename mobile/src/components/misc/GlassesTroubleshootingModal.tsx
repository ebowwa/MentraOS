import {useAppTheme} from "@/utils/useAppTheme"
import React from "react"
import {View, Text, TouchableOpacity, ScrollView, Modal, ViewStyle, TextStyle} from "react-native"
import MaterialIcons from "react-native-vector-icons/MaterialIcons"
import {ThemedStyle} from "@/theme"

interface TroubleshootingModalProps {
  isVisible: boolean
  onClose: () => void
  glassesModelName: string
}

export const getModelSpecificTips = (model: string) => {
  switch (model) {
    case "Even Realities G1":
      return [
        "Make sure you closed the G1's left arm FIRST before putting it in the case",
        "Plug your G1 case into a charger during the pairing process",
        "Try closing the charging case and opening it again",
        "Ensure no other app is currently connected to your G1",
        "Restart your phone's Bluetooth",
        "Make sure your phone is within 3 feet of your glasses & case",
        "If your glasses were previously paired to a different phone, you must unpair/forget the glasses in your phone's Bluetooth settings before retrying the pairing process",
      ]
    case "Mentra Mach1":
    case "Vuzix Z100":
      return [
        "Make sure your glasses are turned on",
        "Check that your glasses are paired in the 'Vuzix Connect' app",
        "Try resetting your Bluetooth connection",
      ]
    case "Mentra Live":
      return ["Make sure your Mentra Live is fully charged", "Try restarting your glasses"]
    default:
      return [
        "Make sure your glasses are charged and turned on",
        "Ensure no other device is connected to your glasses",
        "Try restarting both your glasses and phone",
        "Make sure your phone is within range of your glasses",
      ]
  }
}

const GlassesTroubleshootingModal: React.FC<TroubleshootingModalProps> = ({isVisible, onClose, glassesModelName}) => {
  const {themed, theme} = useAppTheme()

  const tips = getModelSpecificTips(glassesModelName)

  return (
    <Modal visible={isVisible} animationType="slide" transparent>
      <View style={themed($modalContainer)}>
        <View style={themed($modalContent)}>
          <View style={themed($modalHeader)}>
            <Text style={themed($modalHeaderText)}>Troubleshooting {glassesModelName}</Text>
            <TouchableOpacity onPress={onClose} style={themed($closeButton)}>
              <MaterialIcons name="close" size={24} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          <Text style={themed($modalSubText)}>Having trouble pairing your glasses? Try these tips:</Text>

          <ScrollView style={themed($tipsContainer)}>
            {tips.map((tip, index) => (
              <View key={index} style={themed($tipItem)}>
                <Text style={themed($tipNumber)}>{index + 1}</Text>
                <Text style={themed($tipText)}>{tip}</Text>
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity style={themed($closeModalButton)} onPress={onClose}>
            <Text style={themed($closeModalButtonText)}>Got it, thanks!</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const $modalContainer: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  flex: 1,
  justifyContent: "center",
  backgroundColor: "rgba(0,0,0,0.7)",
})

const $modalContent: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  borderRadius: 16,
  elevation: 5,
  maxHeight: "80%",
  padding: spacing.lg,
  shadowColor: "#000",
  shadowOffset: {
    width: 0,
    height: 2,
  },
  shadowOpacity: 0.3,
  shadowRadius: 10,
  width: "85%",
  backgroundColor: colors.background,
})

const $modalHeader: ThemedStyle<ViewStyle> = ({spacing}) => ({
  alignItems: "center",
  flexDirection: "row",
  justifyContent: "space-between",
  marginBottom: spacing.md,
})

const $modalHeaderText: ThemedStyle<TextStyle> = ({colors}) => ({
  flex: 1,
  fontFamily: "Montserrat-Bold",
  fontSize: 20,
  fontWeight: "bold",
  color: colors.text,
})

const $modalSubText: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontFamily: "Montserrat-Regular",
  fontSize: 16,
  marginBottom: spacing.md,
  color: colors.text,
})

const $tipItem: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  alignItems: "flex-start",
  borderRadius: 8,
  flexDirection: "row",
  marginBottom: spacing.sm,
  padding: spacing.sm,
  backgroundColor: colors.palette.neutral200,
})

const $tipNumber: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontFamily: "Montserrat-Bold",
  fontSize: 16,
  fontWeight: "bold",
  marginRight: spacing.sm,
  minWidth: 20,
  color: colors.palette.primary500,
})

const $tipText: ThemedStyle<TextStyle> = ({colors}) => ({
  flex: 1,
  fontFamily: "Montserrat-Regular",
  fontSize: 15,
  color: colors.text,
})

const $tipsContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  marginBottom: spacing.lg,
  maxHeight: 350,
})

const $closeButton: ThemedStyle<ViewStyle> = ({spacing}) => ({
  padding: spacing.xs,
})

const $closeModalButton: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  alignItems: "center",
  borderRadius: 8,
  justifyContent: "center",
  padding: spacing.md,
  backgroundColor: colors.palette.primary500,
})

const $closeModalButtonText: ThemedStyle<TextStyle> = () => ({
  color: "#FFFFFF",
  fontFamily: "Montserrat-Bold",
  fontSize: 16,
  fontWeight: "bold",
})

export default GlassesTroubleshootingModal
