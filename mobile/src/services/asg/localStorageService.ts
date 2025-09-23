/**
 * Local Storage Service for ASG Gallery
 * Manages downloaded files and sync state
 */

import AsyncStorage from "@react-native-async-storage/async-storage"
import RNFS from "react-native-fs"
import {PhotoInfo} from "../../types/asg"

export interface DownloadedFile {
  name: string
  filePath: string // Path to file on filesystem
  size: number
  modified: number
  mime_type: string
  is_video: boolean
  thumbnailPath?: string // Path to thumbnail file
  downloaded_at: number
  glassesModel?: string // Model of glasses that captured this media
}

export interface SyncState {
  last_sync_time: number
  client_id: string
  total_downloaded: number
  total_size: number
}

export class LocalStorageService {
  private static instance: LocalStorageService
  private readonly DOWNLOADED_FILES_KEY = "asg_downloaded_files"
  private readonly SYNC_STATE_KEY = "asg_sync_state"
  private readonly CLIENT_ID_KEY = "asg_client_id"
  private readonly ASG_PHOTOS_DIR = `${RNFS.DocumentDirectoryPath}/MentraPhotos`
  private readonly ASG_THUMBNAILS_DIR = `${RNFS.DocumentDirectoryPath}/MentraPhotos/thumbnails`

  private constructor() {
    this.initializeDirectories()
  }

  static getInstance(): LocalStorageService {
    if (!LocalStorageService.instance) {
      LocalStorageService.instance = new LocalStorageService()
    }
    return LocalStorageService.instance
  }

  /**
   * Initialize ASG photo directories
   */
  private async initializeDirectories(): Promise<void> {
    try {
      // Create main photos directory if it doesn't exist
      const photoDirExists = await RNFS.exists(this.ASG_PHOTOS_DIR)
      if (!photoDirExists) {
        await RNFS.mkdir(this.ASG_PHOTOS_DIR)
        console.log(`[LocalStorage] Created Mentra photos directory: ${this.ASG_PHOTOS_DIR}`)
      }

      // Create thumbnails directory if it doesn't exist
      const thumbDirExists = await RNFS.exists(this.ASG_THUMBNAILS_DIR)
      if (!thumbDirExists) {
        await RNFS.mkdir(this.ASG_THUMBNAILS_DIR)
        console.log(`[LocalStorage] Created Mentra thumbnails directory: ${this.ASG_THUMBNAILS_DIR}`)
      }
    } catch (error) {
      console.error("[LocalStorage] Error initializing directories:", error)
    }
  }

  /**
   * Get the full file path for a photo
   */
  getPhotoFilePath(filename: string): string {
    return `${this.ASG_PHOTOS_DIR}/${filename}`
  }

  /**
   * Get the full file path for a thumbnail
   */
  getThumbnailFilePath(filename: string): string {
    return `${this.ASG_THUMBNAILS_DIR}/${filename}_thumb.jpg`
  }

  /**
   * Initialize client ID if not exists
   */
  async initializeClientId(): Promise<string> {
    try {
      let clientId = await AsyncStorage.getItem(this.CLIENT_ID_KEY)
      if (!clientId) {
        clientId = `mobile_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        await AsyncStorage.setItem(this.CLIENT_ID_KEY, clientId)
      }
      return clientId
    } catch (error) {
      console.error("Error initializing client ID:", error)
      throw error
    }
  }

  /**
   * Get current sync state
   */
  async getSyncState(): Promise<SyncState> {
    try {
      const clientId = await this.initializeClientId()
      const syncStateStr = await AsyncStorage.getItem(this.SYNC_STATE_KEY)

      if (syncStateStr) {
        const syncState = JSON.parse(syncStateStr)
        return {...syncState, client_id: clientId}
      }

      return {
        last_sync_time: 0,
        client_id: clientId,
        total_downloaded: 0,
        total_size: 0,
      }
    } catch (error) {
      console.error("Error getting sync state:", error)
      const clientId = await this.initializeClientId()
      return {
        last_sync_time: 0,
        client_id: clientId,
        total_downloaded: 0,
        total_size: 0,
      }
    }
  }

  /**
   * Update sync state
   */
  async updateSyncState(updates: Partial<SyncState>): Promise<void> {
    try {
      const currentState = await this.getSyncState()
      const newState = {...currentState, ...updates}
      await AsyncStorage.setItem(this.SYNC_STATE_KEY, JSON.stringify(newState))
    } catch (error) {
      console.error("Error updating sync state:", error)
      throw error
    }
  }

  /**
   * Save downloaded file (only metadata, file should already be written to filesystem)
   */
  async saveDownloadedFile(file: DownloadedFile): Promise<void> {
    try {
      const files = await this.getDownloadedFiles()
      // Store relative paths to handle iOS app container changes between launches
      // Convert absolute paths to relative (remove DocumentDirectoryPath prefix)
      const docPath = RNFS.DocumentDirectoryPath
      const relativePath = file.filePath.startsWith(docPath)
        ? file.filePath.substring(docPath.length + 1) // +1 for the slash
        : file.filePath
      const relativeThumbnailPath = file.thumbnailPath
        ? file.thumbnailPath.startsWith(docPath)
          ? file.thumbnailPath.substring(docPath.length + 1)
          : file.thumbnailPath
        : undefined

      files[file.name] = {
        ...file,
        // Store relative paths instead of absolute
        filePath: relativePath,
        thumbnailPath: relativeThumbnailPath,
      }
      await AsyncStorage.setItem(this.DOWNLOADED_FILES_KEY, JSON.stringify(files))
      console.log(`[LocalStorage] Saved metadata for ${file.name} with relative path: ${relativePath}`)
    } catch (error) {
      console.error("Error saving downloaded file metadata:", error)
      throw error
    }
  }

  /**
   * Get all downloaded files
   */
  async getDownloadedFiles(): Promise<Record<string, DownloadedFile>> {
    try {
      const filesStr = await AsyncStorage.getItem(this.DOWNLOADED_FILES_KEY)
      if (!filesStr) return {}

      const files = JSON.parse(filesStr)
      const reconstructedFiles: Record<string, DownloadedFile> = {}
      const docPath = RNFS.DocumentDirectoryPath

      // Reconstruct absolute paths from relative paths
      for (const [name, file] of Object.entries(files as Record<string, DownloadedFile>)) {
        // Check if path is already absolute (legacy data) or relative
        const absolutePath = file.filePath.startsWith("/")
          ? file.filePath // Already absolute (legacy data)
          : `${docPath}/${file.filePath}` // Relative path, prepend DocumentDirectoryPath

        const absoluteThumbnailPath = file.thumbnailPath
          ? file.thumbnailPath.startsWith("/")
            ? file.thumbnailPath // Already absolute (legacy data)
            : `${docPath}/${file.thumbnailPath}` // Relative path
          : undefined

        reconstructedFiles[name] = {
          ...file,
          filePath: absolutePath,
          thumbnailPath: absoluteThumbnailPath,
        }
      }

      return reconstructedFiles
    } catch (error) {
      console.error("Error getting downloaded files:", error)
      return {}
    }
  }

  /**
   * Get downloaded file by name
   */
  async getDownloadedFile(fileName: string): Promise<DownloadedFile | null> {
    try {
      const files = await this.getDownloadedFiles()
      return files[fileName] || null
    } catch (error) {
      console.error("Error getting downloaded file:", error)
      return null
    }
  }

  /**
   * Delete downloaded file (both metadata and actual files)
   */
  async deleteDownloadedFile(fileName: string): Promise<boolean> {
    try {
      const files = await this.getDownloadedFiles()
      if (files[fileName]) {
        const file = files[fileName]

        // Delete actual file from filesystem
        if (file.filePath && (await RNFS.exists(file.filePath))) {
          await RNFS.unlink(file.filePath)
          console.log(`[LocalStorage] Deleted file: ${file.filePath}`)
        }

        // Delete thumbnail if exists
        if (file.thumbnailPath && (await RNFS.exists(file.thumbnailPath))) {
          await RNFS.unlink(file.thumbnailPath)
          console.log(`[LocalStorage] Deleted thumbnail: ${file.thumbnailPath}`)
        }

        // Delete metadata - need to get raw data to maintain relative paths
        const filesStr = await AsyncStorage.getItem(this.DOWNLOADED_FILES_KEY)
        const rawFiles = filesStr ? JSON.parse(filesStr) : {}
        delete rawFiles[fileName]
        await AsyncStorage.setItem(this.DOWNLOADED_FILES_KEY, JSON.stringify(rawFiles))
        return true
      }
      return false
    } catch (error) {
      console.error("Error deleting downloaded file:", error)
      return false
    }
  }

  /**
   * Convert PhotoInfo to DownloadedFile (assumes files are already saved to filesystem)
   */
  convertToDownloadedFile(
    photoInfo: PhotoInfo,
    filePath: string,
    thumbnailPath?: string,
    glassesModel?: string,
  ): DownloadedFile {
    return {
      name: photoInfo.name,
      filePath: filePath,
      size: photoInfo.size,
      modified: new Date(photoInfo.modified).getTime(),
      mime_type: photoInfo.mime_type || (photoInfo.is_video ? "video/mp4" : "image/jpeg"),
      is_video: photoInfo.is_video || false,
      thumbnailPath: thumbnailPath,
      downloaded_at: Date.now(),
      glassesModel: glassesModel || photoInfo.glassesModel,
    }
  }

  /**
   * Convert DownloadedFile to PhotoInfo
   */
  convertToPhotoInfo(downloadedFile: DownloadedFile): PhotoInfo {
    // Use file:// URLs for local files
    // On iOS, ensure we have proper file:// URL format with correct number of slashes
    const fileUrl = downloadedFile.filePath.startsWith("file://")
      ? downloadedFile.filePath
      : downloadedFile.filePath.startsWith("/")
        ? `file://${downloadedFile.filePath}` // Path already has leading slash
        : `file:///${downloadedFile.filePath}` // Path needs leading slash

    const thumbnailUrl = downloadedFile.thumbnailPath
      ? downloadedFile.thumbnailPath.startsWith("file://")
        ? downloadedFile.thumbnailPath
        : downloadedFile.thumbnailPath.startsWith("/")
          ? `file://${downloadedFile.thumbnailPath}` // Path already has leading slash
          : `file:///${downloadedFile.thumbnailPath}` // Path needs leading slash
      : undefined

    return {
      name: downloadedFile.name,
      url: fileUrl,
      download: fileUrl,
      size: downloadedFile.size,
      modified: new Date(downloadedFile.modified).toISOString(),
      mime_type: downloadedFile.mime_type,
      is_video: downloadedFile.is_video,
      thumbnail_data: undefined,
      downloaded_at: downloadedFile.downloaded_at,
      filePath: downloadedFile.filePath,
      glassesModel: downloadedFile.glassesModel,
      thumbnailPath: thumbnailUrl, // Use the file:// URL version for thumbnailPath
    }
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<{
    total_files: number
    total_size: number
    last_sync: number
  }> {
    try {
      const files = await this.getDownloadedFiles()
      const syncState = await this.getSyncState()

      const totalSize = Object.values(files).reduce((sum, file) => sum + file.size, 0)

      return {
        total_files: Object.keys(files).length,
        total_size: totalSize,
        last_sync: syncState.last_sync_time,
      }
    } catch (error) {
      console.error("Error getting storage stats:", error)
      return {
        total_files: 0,
        total_size: 0,
        last_sync: 0,
      }
    }
  }

  /**
   * Clear all downloaded files (both metadata and actual files)
   */
  async clearAllFiles(): Promise<void> {
    try {
      // Get all files before clearing
      const files = await this.getDownloadedFiles()

      // Delete each file from filesystem
      for (const fileName in files) {
        const file = files[fileName]
        if (file.filePath && (await RNFS.exists(file.filePath))) {
          await RNFS.unlink(file.filePath)
        }
        if (file.thumbnailPath && (await RNFS.exists(file.thumbnailPath))) {
          await RNFS.unlink(file.thumbnailPath)
        }
      }

      // Clear metadata
      await AsyncStorage.removeItem(this.DOWNLOADED_FILES_KEY)
      console.log("[LocalStorage] Cleared all downloaded files")
    } catch (error) {
      console.error("Error clearing all files:", error)
      throw error
    }
  }
}

export const localStorageService = LocalStorageService.getInstance()
