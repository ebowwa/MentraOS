import AsyncStorage from "@react-native-async-storage/async-storage"
import {SETTINGS_KEYS} from "./SettingsHelper"

export interface NotificationAppPreference {
  packageName: string
  appName: string
  enabled: boolean
  lastUpdated: number
}

export interface NotificationApp {
  packageName: string
  appName: string
  icon?: string
  category: string
  firstSeen: number
  lastSeen: number
  notificationCount: number
  enabled?: boolean
}

/**
 * Utility class for managing notification preferences
 */
export class NotificationPreferences {
  /**
   * Get app-specific notification preferences
   */
  static async getAppPreferences(): Promise<Record<string, NotificationAppPreference>> {
    try {
      const prefsJson = await AsyncStorage.getItem(SETTINGS_KEYS.notification_app_preferences)
      return prefsJson ? JSON.parse(prefsJson) : {}
    } catch (error) {
      console.error("Error getting app preferences:", error)
      return {}
    }
  }

  /**
   * Set preference for a specific app
   */
  static async setAppPreference(packageName: string, appName: string, enabled: boolean): Promise<void> {
    try {
      const preferences = await this.getAppPreferences()
      preferences[packageName] = {
        packageName,
        appName,
        enabled,
        lastUpdated: Date.now(),
      }

      await AsyncStorage.setItem(SETTINGS_KEYS.notification_app_preferences, JSON.stringify(preferences))

      // Also store a simple app name -> blocked mapping for Android to read easily
      const simpleBlacklist: Record<string, boolean> = {}
      Object.values(preferences).forEach(pref => {
        if (pref.packageName.startsWith("manual.")) {
          simpleBlacklist[pref.appName] = !pref.enabled // blocked = !enabled
        }
      })

      await AsyncStorage.setItem("SIMPLE_NOTIFICATION_BLACKLIST", JSON.stringify(simpleBlacklist))
      console.log("📋 Updated simple blacklist:", simpleBlacklist)
    } catch (error) {
      console.error("Error setting app preference:", error)
    }
  }

  /**
   * Check if notifications are enabled for a specific app
   */
  static async isAppEnabled(packageName: string): Promise<boolean> {
    try {
      const preferences = await this.getAppPreferences()
      const appPref = preferences[packageName]

      // If no preference set, default to enabled
      return appPref ? appPref.enabled : true
    } catch (error) {
      console.error("Error checking app preference:", error)
      return true // Default to enabled on error
    }
  }

  /**
   * Completely remove an app preference
   */
  static async removeAppPreference(packageName: string): Promise<void> {
    try {
      const preferences = await this.getAppPreferences()
      delete preferences[packageName]

      await AsyncStorage.setItem(SETTINGS_KEYS.notification_app_preferences, JSON.stringify(preferences))
    } catch (error) {
      console.error("Error removing app preference:", error)
    }
  }

  /**
   * Bulk update multiple app preferences
   */
  static async bulkUpdateAppPreferences(
    updates: Array<{packageName: string; appName: string; enabled: boolean}>,
  ): Promise<void> {
    try {
      const preferences = await this.getAppPreferences()

      updates.forEach(update => {
        preferences[update.packageName] = {
          packageName: update.packageName,
          appName: update.appName,
          enabled: update.enabled,
          lastUpdated: Date.now(),
        }
      })

      await AsyncStorage.setItem(SETTINGS_KEYS.notification_app_preferences, JSON.stringify(preferences))
    } catch (error) {
      console.error("Error bulk updating app preferences:", error)
    }
  }

  /**
   * Reset all preferences to default (all enabled)
   */
  static async resetToDefaults(): Promise<void> {
    try {
      await AsyncStorage.removeItem(SETTINGS_KEYS.notification_app_preferences)
    } catch (error) {
      console.error("Error resetting preferences:", error)
    }
  }

  /**
   * Get enabled apps count
   */
  static async getEnabledAppsCount(): Promise<number> {
    try {
      const preferences = await this.getAppPreferences()
      return Object.values(preferences).filter(pref => pref.enabled).length
    } catch (error) {
      console.error("Error getting enabled apps count:", error)
      return 0
    }
  }

  /**
   * Get disabled apps count
   */
  static async getDisabledAppsCount(): Promise<number> {
    try {
      const preferences = await this.getAppPreferences()
      return Object.values(preferences).filter(pref => !pref.enabled).length
    } catch (error) {
      console.error("Error getting disabled apps count:", error)
      return 0
    }
  }

  /**
   * Export preferences for backup/sync
   */
  static async exportPreferences(): Promise<{apps: Record<string, NotificationAppPreference>}> {
    return {
      apps: await this.getAppPreferences(),
    }
  }

  /**
   * Import preferences from backup/sync
   */
  static async importPreferences(data: {apps: Record<string, NotificationAppPreference>}): Promise<void> {
    try {
      await AsyncStorage.setItem(SETTINGS_KEYS.notification_app_preferences, JSON.stringify(data.apps))
    } catch (error) {
      console.error("Error importing preferences:", error)
    }
  }
}
