import React from 'react';
import { Alert, AlertButton } from 'react-native';
import MessageModal from '../components/MessageModal';

// Global state to manage the modal
let modalRef: {
  showModal: (
    title: string,
    message: string,
    buttons?: AlertButton[],
    options?: { 
      isDarkTheme?: boolean; 
      iconName?: string;
      iconSize?: number;
      iconColor?: string;
    }
  ) => void;
} | null = null;

// Function to register the modal reference
export const setModalRef = (ref: typeof modalRef) => {
  modalRef = ref;
};

// Global component that will be rendered once at the app root
export const ModalProvider: React.FC<{ isDarkTheme?: boolean }> = ({ isDarkTheme = false }) => {
  const [visible, setVisible] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [button, setButton] = React.useState<{
    text: string;
    onPress?: () => void;
  } | null>(null);
  const [options, setOptions] = React.useState<{
    isDarkTheme?: boolean;
    iconName?: string;
    iconSize?: number;
    iconColor?: string;
  }>({ isDarkTheme });

  React.useEffect(() => {
    // Register the modal functions for global access
    setModalRef({
      showModal: (title, message, buttons = [], opts = {}) => {
        setTitle(title);
        setMessage(message);
        
        // Use the first button as the confirm button
        if (buttons.length > 0) {
          setButton({
            text: buttons[0].text || "",
            onPress: buttons[0].onPress,
          });
        } else {
          setButton({
            text: 'OK',
            onPress: undefined,
          });
        }

        // Set options with fallback to component's props
        setOptions({
          isDarkTheme: opts.isDarkTheme !== undefined ? opts.isDarkTheme : isDarkTheme,
          iconName: opts.iconName,
          iconSize: opts.iconSize,
          iconColor: opts.iconColor,
        });

        setVisible(true);
      },
    });

    return () => {
      setModalRef(null);
    };
  }, [isDarkTheme]);

  const handleDismiss = () => {
    setVisible(false);
  };

  const handleButtonPress = () => {
    setVisible(false);
    if (button?.onPress) {
      button.onPress();
    }
  };

  return (
    <MessageModal
      visible={visible}
      title={title}
      message={message}
      buttonText={button?.text || 'OK'}
      onButtonPress={handleButtonPress}
      onDismiss={handleDismiss}
      isDarkTheme={options.isDarkTheme}
      iconName={options.iconName}
      iconSize={options.iconSize}
      iconColor={options.iconColor}
    />
  );
};

// Custom alert function that can be used as a drop-in replacement for Alert.alert
export const showAlert = (
  title: string,
  message: string,
  buttons: AlertButton[] = [{ text: 'OK' }],
  options?: { 
    cancelable?: boolean; 
    onDismiss?: () => void;
    useNativeAlert?: boolean;
    isDarkTheme?: boolean;
    iconName?: string;
    iconSize?: number;
    iconColor?: string;
  }
) => {
  // Fall back to native Alert if modalRef is not set or if explicitly requested
  if (!modalRef || options?.useNativeAlert) {
    return Alert.alert(title, message, buttons, {
      cancelable: options?.cancelable,
      onDismiss: options?.onDismiss,
    });
  }

  // Use custom modal implementation
  modalRef.showModal(title, message, buttons, {
    isDarkTheme: options?.isDarkTheme,
    iconName: options?.iconName,
    iconSize: options?.iconSize,
    iconColor: options?.iconColor,
  });
};

export default showAlert;