import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TouchableOpacity } from 'react-native';
import CoreCommunicator from '@/bridge/CoreCommunicator';
import { useAppTheme } from '@/utils/useAppTheme';

interface SimulatedGlassesControlsProps {
  style?: any;
}

export const SimulatedGlassesControls: React.FC<SimulatedGlassesControlsProps> = ({ style }) => {
  const { theme } = useAppTheme();
  const handleHeadUp = async () => {
    try {
      await CoreCommunicator.simulateHeadPosition('up');
    } catch (error) {
      console.error('Failed to simulate head up:', error);
    }
  };

  const handleHeadDown = async () => {
    try {
      await CoreCommunicator.simulateHeadPosition('down');
    } catch (error) {
      console.error('Failed to simulate head down:', error);
    }
  };

  const handleButtonPress = async (pressType: 'short' | 'long') => {
    try {
      await CoreCommunicator.simulateButtonPress('camera', pressType);
    } catch (error) {
      console.error('Failed to simulate button press:', error);
    }
  };

  return (
    <View style={[styles.container, style]}>
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Head Position</Text>
        <View style={styles.buttonRow}>
          <TouchableOpacity onPress={handleHeadUp} style={[styles.button, { backgroundColor: theme.colors.primary }]}>
            <Text style={[styles.buttonText, { color: theme.colors.textOnPrimary }]}>Head Up</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleHeadDown} style={[styles.button, { backgroundColor: theme.colors.primary }]}>
            <Text style={[styles.buttonText, { color: theme.colors.textOnPrimary }]}>Head Down</Text>
          </TouchableOpacity>
        </View>
      </View>
      
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Button Press</Text>
        <View style={styles.buttonRow}>
          <TouchableOpacity onPress={() => handleButtonPress('short')} style={[styles.button, { backgroundColor: theme.colors.primary }]}>
            <Text style={[styles.buttonText, { color: theme.colors.textOnPrimary }]}>Short Press</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleButtonPress('long')} style={[styles.button, { backgroundColor: theme.colors.primary }]}>
            <Text style={[styles.buttonText, { color: theme.colors.textOnPrimary }]}>Long Press</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderRadius: 12,
    padding: 16,
    margin: 16,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '500',
  },
});