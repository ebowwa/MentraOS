import {useAppTheme} from "@/utils/useAppTheme"
import {View, TouchableOpacity, ScrollView, Modal} from "react-native"
import {Text} from "@/components/ignite"
import MaterialIcons from "react-native-vector-icons/MaterialIcons"

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
      return [
        "Make sure your Mentra Live is fully charged",
        "Check that your Mentra Live is in pairing mode",
        "Ensure no other app is currently connected to your glasses",
        "Try restarting your glasses",
        "Check that your phone's Bluetooth is enabled",
      ]
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
  const {theme} = useAppTheme()

  const tips = getModelSpecificTips(glassesModelName)

  return (
    <Modal visible={isVisible} animationType="slide" transparent onRequestClose={onClose}>
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          flex: 1,
          backgroundColor: theme.colors.modalOverlay,
          justifyContent: "center",
          alignItems: "center",
        }}>
        <View
          style={{
            borderRadius: 16,
            elevation: 5,
            maxHeight: "80%",
            padding: theme.spacing.lg,
            shadowColor: "#000",
            shadowOffset: {
              width: 0,
              height: 2,
            },
            shadowOpacity: 0.3,
            shadowRadius: 10,
            width: "85%",
            backgroundColor: theme.colors.background,
          }}>
          <View
            style={{
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "space-between",
              marginBottom: theme.spacing.md,
            }}>
            <Text
              style={{
                flex: 1,
                fontFamily: "Montserrat-Bold",
                fontSize: 20,
                fontWeight: "bold",
                color: theme.colors.text,
              }}>
              Troubleshooting {glassesModelName}
            </Text>
            <TouchableOpacity onPress={onClose} style={{padding: theme.spacing.xs}}>
              <MaterialIcons name="close" size={24} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          <Text
            style={{
              fontFamily: "Montserrat-Regular",
              fontSize: 16,
              marginBottom: theme.spacing.md,
              color: theme.colors.text,
            }}>
            Having trouble pairing your glasses? Try these tips:
          </Text>

          <ScrollView style={{marginBottom: theme.spacing.lg, maxHeight: 350}}>
            {tips.map((tip, index) => (
              <View
                key={index}
                style={{
                  alignItems: "flex-start",
                  borderRadius: 8,
                  flexDirection: "row",
                  marginBottom: theme.spacing.sm,
                  padding: theme.spacing.sm,
                  backgroundColor: theme.colors.backgroundAlt,
                }}>
                <Text
                  style={{
                    fontFamily: "Montserrat-Bold",
                    fontSize: 16,
                    fontWeight: "bold",
                    marginRight: theme.spacing.sm,
                    minWidth: 20,
                    color: theme.colors.primary,
                  }}>
                  {index + 1}
                </Text>
                <Text
                  style={{
                    flex: 1,
                    fontFamily: "Montserrat-Regular",
                    fontSize: 15,
                    color: theme.colors.text,
                  }}>
                  {tip}
                </Text>
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity
            style={{
              alignItems: "center",
              borderRadius: 8,
              justifyContent: "center",
              padding: theme.spacing.md,
              backgroundColor: theme.colors.primary,
            }}
            onPress={onClose}>
            <Text
              style={{
                color: theme.colors.palette.white,
                fontFamily: "Montserrat-Bold",
                fontSize: 16,
                fontWeight: "bold",
              }}>
              Got it, thanks!
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

export default GlassesTroubleshootingModal
