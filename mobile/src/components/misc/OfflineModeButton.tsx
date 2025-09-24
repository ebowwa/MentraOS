import {useState} from "react"
import {View, TouchableOpacity, Modal, ViewStyle, TextStyle} from "react-native"
import {Text, Button} from "@/components/ignite"
import {useAppTheme} from "@/utils/useAppTheme"
import {ThemedStyle} from "@/theme"
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons"
import {SETTINGS_KEYS, useSetting} from "@/stores/settings"

export const OfflineModeButton: React.FC = () => {
  const [visible, setVisible] = useState(false)
  const {theme, themed} = useAppTheme()
  const [offlineMode, setOfflineMode] = useSetting(SETTINGS_KEYS.OFFLINE_MODE)

  const showModal = () => setVisible(true)
  const hideModal = () => setVisible(false)

  const handleConfirm = () => {
    setOfflineMode(!offlineMode)
    hideModal()
  }

  const handlePress = () => {
    // Show confirmation modal for both enabling and disabling offline mode
    showModal()
  }

  return (
    <View style={themed($container)}>
      <TouchableOpacity onPress={handlePress} style={themed($button)}>
        <MaterialCommunityIcons
          name={offlineMode ? "wifi-off" : "wifi"}
          size={24}
          color={offlineMode ? theme.colors.text : theme.colors.tint}
        />
      </TouchableOpacity>

      <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={hideModal}>
        <View style={themed($modalOverlay)}>
          <View style={themed($modal)}>
            <Text
              style={themed($modalTitle)}
              tx={offlineMode ? "offlineMode:disableOfflineMode" : "offlineMode:enableOfflineMode"}
            />
            <Text
              style={themed($modalText)}
              tx={offlineMode ? "offlineMode:goOnlineMessage" : "offlineMode:goOfflineMessage"}
            />
            <View style={themed($buttonRow)}>
              <Button
                preset="outlined"
                onPress={hideModal}
                tx="common:cancel"
                style={[themed($modalButton), themed($outlinedButton)]}
                textStyle={themed($modalButtonText)}
              />
              <Button
                preset="default"
                onPress={handleConfirm}
                tx={offlineMode ? "offlineMode:goOnline" : "offlineMode:goOffline"}
                style={themed($modalButton)}
                textStyle={[themed($modalButtonText), themed($modalButtonTextPrimary)]}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const $container: ThemedStyle<ViewStyle> = ({spacing}) => ({
  marginLeft: spacing.md,
  marginRight: spacing.sm,
})

const $button: ThemedStyle<ViewStyle> = ({spacing}) => ({
  padding: spacing.sm,
  borderRadius: 20,
  justifyContent: "center",
  alignItems: "center",
})

const $modalButton: ThemedStyle<ViewStyle> = ({spacing, colors}) => ({
  minWidth: 120,
  margin: 0,
  paddingVertical: spacing.sm,
  backgroundColor: colors.tint,
})

const $outlinedButton: ThemedStyle<ViewStyle> = ({colors}) => ({
  borderWidth: 1,
  borderColor: colors.border,
  backgroundColor: "transparent",
})

const $modalOverlay: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  backgroundColor: "rgba(0, 0, 0, 0.5)",
  justifyContent: "center",
  padding: spacing.lg,
})

const $modal: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.background,
  borderRadius: 8,
  padding: spacing.lg,
  shadowColor: "#000",
  shadowOffset: {width: 0, height: 2},
  shadowOpacity: 0.25,
  shadowRadius: 4,
  elevation: 5,
})

const $modalTitle: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 20,
  fontWeight: "bold",
  marginBottom: spacing.md,
  color: colors.text,
})

const $modalText: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 16,
  marginBottom: spacing.lg,
  lineHeight: 24,
  color: colors.textDim,
})

const $buttonRow: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  justifyContent: "flex-end",
  marginTop: spacing.lg,
  gap: spacing.md,
})

const $modalButtonText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 16,
  fontWeight: "600",
  textAlign: "center",
  color: colors.text,
})

const $modalButtonTextPrimary: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.background,
})
