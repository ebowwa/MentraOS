import * as MediaLibrary from "expo-media-library"

export class MediaLibraryPermissions {
  static async requestPermission(): Promise<boolean> {
    try {
      const {status} = await MediaLibrary.requestPermissionsAsync()
      return status === "granted"
    } catch (error) {
      console.error("[MediaLibrary] Error requesting permission:", error)
      return false
    }
  }

  static async checkPermission(): Promise<boolean> {
    try {
      const {status} = await MediaLibrary.getPermissionsAsync()
      return status === "granted"
    } catch (error) {
      console.error("[MediaLibrary] Error checking permission:", error)
      return false
    }
  }

  static async saveToLibrary(filePath: string): Promise<boolean> {
    try {
      const hasPermission = await this.checkPermission()
      if (!hasPermission) {
        console.warn("[MediaLibrary] No permission to save to library")
        return false
      }

      // Remove file:// prefix if present
      const cleanPath = filePath.replace("file://", "")

      await MediaLibrary.createAssetAsync(cleanPath)
      console.log(`[MediaLibrary] Saved to camera roll: ${cleanPath}`)
      return true
    } catch (error) {
      console.error("[MediaLibrary] Error saving to library:", error)
      return false
    }
  }
}
