import AsyncStorage from "@react-native-async-storage/async-storage"

export interface GallerySettings {
  autoSaveToCameraRoll: boolean
}

export class GallerySettingsService {
  private static instance: GallerySettingsService
  private readonly SETTINGS_KEY = "gallery_settings"
  private readonly DEFAULT_SETTINGS: GallerySettings = {
    autoSaveToCameraRoll: true, // Default ON
  }

  private constructor() {}

  static getInstance(): GallerySettingsService {
    if (!GallerySettingsService.instance) {
      GallerySettingsService.instance = new GallerySettingsService()
    }
    return GallerySettingsService.instance
  }

  async getSettings(): Promise<GallerySettings> {
    try {
      const stored = await AsyncStorage.getItem(this.SETTINGS_KEY)
      if (stored) {
        return {...this.DEFAULT_SETTINGS, ...JSON.parse(stored)}
      }
      return this.DEFAULT_SETTINGS
    } catch (error) {
      console.error("[GallerySettings] Error loading settings:", error)
      return this.DEFAULT_SETTINGS
    }
  }

  async updateSettings(settings: Partial<GallerySettings>): Promise<void> {
    try {
      const current = await this.getSettings()
      const updated = {...current, ...settings}
      await AsyncStorage.setItem(this.SETTINGS_KEY, JSON.stringify(updated))
      console.log("[GallerySettings] Settings updated:", updated)
    } catch (error) {
      console.error("[GallerySettings] Error saving settings:", error)
    }
  }

  async getAutoSaveToCameraRoll(): Promise<boolean> {
    const settings = await this.getSettings()
    return settings.autoSaveToCameraRoll
  }

  async setAutoSaveToCameraRoll(enabled: boolean): Promise<void> {
    await this.updateSettings({autoSaveToCameraRoll: enabled})
  }
}

export const gallerySettingsService = GallerySettingsService.getInstance()
