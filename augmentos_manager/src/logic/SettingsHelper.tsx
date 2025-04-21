import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const CLOUD_URL = process.env.CLOUD_HOST_NAME || 'cloud';

const saveSetting = async (key: string, value: any): Promise<void> => {
  try {
    // Save to AsyncStorage first
    await AsyncStorage.setItem(key, JSON.stringify(value));

    // Then try to save to cloud
    const coreToken = await AsyncStorage.getItem('core_token');
    if (!coreToken) {
      return;
    }

    const settings = { [key]: value };
    await axios.post(`http://${CLOUD_URL}/api/augmentos-settings`, settings, {
      headers: { Authorization: `Bearer ${coreToken}` }
    });
  } catch (error) {
    console.error(`Failed to save setting (${key}):`, error);
  }
};

const loadSetting = async (key: string, defaultValue: any) => {
  try {
    // First try to get from AsyncStorage
    const jsonValue = await AsyncStorage.getItem(key);
    if (jsonValue !== null) {
      return JSON.parse(jsonValue);
    }

    // If not in AsyncStorage, try to get from cloud
    const coreToken = await AsyncStorage.getItem('core_token');
    if (!coreToken) {
      return defaultValue;
    }

    const response = await axios.get(`http://${CLOUD_URL}/api/augmentos-settings`, {
      headers: { Authorization: `Bearer ${coreToken}` }
    });

    if (response.data.success && response.data.settings) {
      const value = response.data.settings[key];
      if (value !== undefined) {
        // Cache the value in AsyncStorage
        await AsyncStorage.setItem(key, JSON.stringify(value));
        return value;
      }
    }

    return defaultValue;
  } catch (error) {
    console.error(`Failed to load setting (${key}):`, error);
    return defaultValue;
  }
};

export { saveSetting, loadSetting };
