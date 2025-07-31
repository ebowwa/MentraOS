import AsyncStorage from "@react-native-async-storage/async-storage"
import { reportCritical } from "@/reporting"

const saveSetting = async (key: string, value: any): Promise<void> => {
  try {
    const jsonValue = JSON.stringify(value)
    await AsyncStorage.setItem(key, jsonValue)
  } catch (error) {
    console.error(`Failed to save setting (${key}):`, error)
    reportCritical(`Failed to save setting (${key})`, 'settings.persistence', 'save_setting', error instanceof Error ? error : new Error(String(error)), { key, value })
  }
}

const loadSetting = async (key: string, defaultValue: any) => {
  try {
    const jsonValue = await AsyncStorage.getItem(key)
    return jsonValue !== null ? JSON.parse(jsonValue) : defaultValue
  } catch (error) {
    console.error(`Failed to load setting (${key}):`, error)
    reportCritical(`Failed to load setting (${key})`, 'settings.persistence', 'load_setting', error instanceof Error ? error : new Error(String(error)), { key })
    return defaultValue
  }
}

export {saveSetting, loadSetting}
