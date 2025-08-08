/**
 * Local Storage Service for ASG Gallery
 * Manages downloaded files and sync state
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import { PhotoInfo } from '../types'

export interface DownloadedFile {
  name: string
  data: string // base64 encoded file data
  size: number
  modified: number
  mime_type: string
  is_video: boolean
  thumbnail_data?: string
  downloaded_at: number
}

export interface SyncState {
  last_sync_time: number
  client_id: string
  total_downloaded: number
  total_size: number
}

export class LocalStorageService {
  private static instance: LocalStorageService
  private readonly DOWNLOADED_FILES_KEY = 'asg_downloaded_files'
  private readonly SYNC_STATE_KEY = 'asg_sync_state'
  private readonly CLIENT_ID_KEY = 'asg_client_id'

  private constructor() {}

  static getInstance(): LocalStorageService {
    if (!LocalStorageService.instance) {
      LocalStorageService.instance = new LocalStorageService()
    }
    return LocalStorageService.instance
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
      console.error('Error initializing client ID:', error)
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
        return { ...syncState, client_id: clientId }
      }

      return {
        last_sync_time: 0,
        client_id: clientId,
        total_downloaded: 0,
        total_size: 0,
      }
    } catch (error) {
      console.error('Error getting sync state:', error)
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
      const newState = { ...currentState, ...updates }
      await AsyncStorage.setItem(this.SYNC_STATE_KEY, JSON.stringify(newState))
    } catch (error) {
      console.error('Error updating sync state:', error)
      throw error
    }
  }

  /**
   * Save downloaded file
   */
  async saveDownloadedFile(file: DownloadedFile): Promise<void> {
    try {
      const files = await this.getDownloadedFiles()
      files[file.name] = file
      await AsyncStorage.setItem(this.DOWNLOADED_FILES_KEY, JSON.stringify(files))
    } catch (error) {
      console.error('Error saving downloaded file:', error)
      throw error
    }
  }

  /**
   * Get all downloaded files
   */
  async getDownloadedFiles(): Promise<Record<string, DownloadedFile>> {
    try {
      const filesStr = await AsyncStorage.getItem(this.DOWNLOADED_FILES_KEY)
      return filesStr ? JSON.parse(filesStr) : {}
    } catch (error) {
      console.error('Error getting downloaded files:', error)
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
      console.error('Error getting downloaded file:', error)
      return null
    }
  }

  /**
   * Delete downloaded file
   */
  async deleteDownloadedFile(fileName: string): Promise<boolean> {
    try {
      const files = await this.getDownloadedFiles()
      if (files[fileName]) {
        delete files[fileName]
        await AsyncStorage.setItem(this.DOWNLOADED_FILES_KEY, JSON.stringify(files))
        return true
      }
      return false
    } catch (error) {
      console.error('Error deleting downloaded file:', error)
      return false
    }
  }

  /**
   * Convert PhotoInfo to DownloadedFile
   */
  convertToDownloadedFile(photoInfo: PhotoInfo, fileData: string, thumbnailData?: string): DownloadedFile {
    return {
      name: photoInfo.name,
      data: fileData,
      size: photoInfo.size,
      modified: new Date(photoInfo.modified).getTime(),
      mime_type: photoInfo.is_video ? 'video/mp4' : 'image/jpeg',
      is_video: photoInfo.is_video || false,
      thumbnail_data: thumbnailData,
      downloaded_at: Date.now(),
    }
  }

  /**
   * Convert DownloadedFile to PhotoInfo
   */
  convertToPhotoInfo(downloadedFile: DownloadedFile): PhotoInfo {
    return {
      name: downloadedFile.name,
      url: `data:${downloadedFile.mime_type};base64,${downloadedFile.data}`,
      download: `data:${downloadedFile.mime_type};base64,${downloadedFile.data}`,
      size: downloadedFile.size,
      modified: new Date(downloadedFile.modified).toISOString(),
      is_video: downloadedFile.is_video,
      thumbnail_data: downloadedFile.thumbnail_data,
      downloaded_at: downloadedFile.downloaded_at,
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
      console.error('Error getting storage stats:', error)
      return {
        total_files: 0,
        total_size: 0,
        last_sync: 0,
      }
    }
  }

  /**
   * Clear all downloaded files
   */
  async clearAllFiles(): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.DOWNLOADED_FILES_KEY)
    } catch (error) {
      console.error('Error clearing all files:', error)
      throw error
    }
  }
}

export const localStorageService = LocalStorageService.getInstance()
