import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

interface MessageModalProps {
  visible: boolean;
  title: string;
  message: string;
  buttonText?: string;
  onButtonPress?: () => void;
  onDismiss?: () => void;
  isDarkTheme?: boolean;
  iconName?: string;
  iconSize?: number;
  iconColor?: string;
}

const MessageModal: React.FC<MessageModalProps> = ({
  visible,
  title,
  message,
  buttonText = 'I understand',
  onButtonPress,
  onDismiss,
  isDarkTheme = false,
  iconName = 'information-outline',
  iconSize = 40,
  iconColor,
}) => {
  const handleButtonPress = () => {
    if (onButtonPress) {
      onButtonPress();
    }
    if (onDismiss) {
      onDismiss();
    }
  };

  const defaultIconColor = iconColor || (isDarkTheme ? '#FFFFFF' : '#2196F3');

  return (
    <Modal
      transparent={true}
      visible={visible}
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={styles.modalOverlay}>
        <View style={[
          styles.modalContent,
          isDarkTheme ? styles.modalContentDark : styles.modalContentLight
        ]}>
          {iconName && (
            <Icon 
              name={iconName} 
              size={iconSize} 
              color={defaultIconColor} 
            />
          )}
          <Text style={[
            styles.modalTitle,
            isDarkTheme ? styles.lightText : styles.darkText
          ]}>
            {title}
          </Text>
          <Text style={[
            styles.modalDescription,
            isDarkTheme ? styles.lightSubtext : styles.darkSubtext
          ]}>
            {message}
          </Text>
          <TouchableOpacity 
            style={styles.modalButton}
            onPress={handleButtonPress}
          >
            <Text style={styles.modalButtonText}>{buttonText}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '85%',
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
  },
  modalContentLight: {
    backgroundColor: '#FFFFFF',
  },
  modalContentDark: {
    backgroundColor: '#1c1c1c',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  modalDescription: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  modalButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  lightText: {
    color: '#FFFFFF',
  },
  darkText: {
    color: '#1a1a1a',
  },
  lightSubtext: {
    color: '#e0e0e0',
  },
  darkSubtext: {
    color: '#4a4a4a',
  },
});

export default MessageModal;