import React, { useState } from "react"
import { View, TouchableOpacity, StyleSheet, Modal, ViewStyle } from "react-native"
import { Text, Button } from "@/components/ignite"
import { useAppTheme } from "@/utils/useAppTheme"
import { spacing } from "@/theme"
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons"

interface OfflineModeButtonProps {
  isOfflineMode: boolean
  onToggle: (isOffline: boolean) => void
}

export const OfflineModeButton: React.FC<OfflineModeButtonProps> = ({
  isOfflineMode,
  onToggle,
}) => {
  const [visible, setVisible] = useState(false)
  const { theme } = useAppTheme()
  const styles = getStyles(theme)

  const showModal = () => setVisible(true)
  const hideModal = () => setVisible(false)

  const handleConfirm = () => {
    onToggle(!isOfflineMode)
    hideModal()
  }

  const handlePress = () => {
    // Show confirmation modal for both enabling and disabling offline mode
    showModal()
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={handlePress} style={styles.button}>
        <MaterialCommunityIcons
          name={isOfflineMode ? 'wifi-off' : 'wifi'}
          size={24}
          color={isOfflineMode ? theme.colors.text : theme.colors.tint}
        />
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent={true}
        animationType="fade"
        onRequestClose={hideModal}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: theme.colors.background }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>
              {isOfflineMode ? 'Disable Offline Mode?' : 'Enable Offline Mode?'}
            </Text>
            <Text style={[styles.modalText, { color: theme.colors.textDim }]}>
              {isOfflineMode 
                ? 'Switching to online mode will close all offline-only apps and allow you to use all online apps.'
                : 'Enabling offline mode will close all running online apps. You\'ll only be able to use apps that work without an internet connection, and all other apps will be shut down.'
              }
            </Text>
            <View style={styles.buttonRow}>
              <Button
                preset="outlined"
                onPress={hideModal}
                text="Cancel"
                style={[styles.modalButton, styles.outlinedButton]}
                textStyle={styles.modalButtonText}
              />
              <Button
                preset="default"
                onPress={handleConfirm}
                text={isOfflineMode ? 'Go Online' : 'Go Offline'}
                style={styles.modalButton}
                textStyle={[styles.modalButtonText, styles.modalButtonTextPrimary]}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const getStyles = (theme: any) => StyleSheet.create({
  container: {
    marginLeft: spacing.md,
    marginRight: spacing.sm,
  },
  // Header button style
  button: {
    padding: spacing.sm,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Modal button container
  modalButton: {
    minWidth: 120,
    margin: 0,
    paddingVertical: spacing.sm,
    backgroundColor: theme.colors.tint,
  },
  // For the outlined Cancel button
  outlinedButton: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: 'transparent',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modal: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: spacing.md,
  },
  modalText: {
    fontSize: 16,
    marginBottom: spacing.lg,
    lineHeight: 24,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    color: theme.colors.text,
  },
  modalButtonTextPrimary: {
    color: theme.colors.background,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: spacing.md,
  }
})
