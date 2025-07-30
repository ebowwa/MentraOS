import {save, load} from "@/utils/storage/storage"
import { reportError } from "@/utils/reporting"

export interface WifiCredential {
  ssid: string
  password: string
  lastConnected?: number
  autoConnect?: boolean
}

export interface WifiCredentialsData {
  credentials: WifiCredential[]
  version: string
}

class WifiCredentialsService {
  private static readonly STORAGE_KEY = "wifi_credentials"
  private static readonly VERSION = "1.0"
  private static readonly MAX_CREDENTIALS = 50 // Prevent unlimited storage

  /**
   * Save WiFi credentials securely
   */
  static async saveCredentials(ssid: string, password: string, autoConnect: boolean = true): Promise<boolean> {
    try {
      const existingData = this.loadCredentialsData()
      const existingIndex = existingData.credentials.findIndex(cred => cred.ssid === ssid)

      const newCredential: WifiCredential = {
        ssid,
        password,
        lastConnected: Date.now(),
        autoConnect,
      }

      if (existingIndex >= 0) {
        // Update existing credential
        existingData.credentials[existingIndex] = newCredential
      } else {
        // Add new credential, maintaining max limit
        existingData.credentials.unshift(newCredential)
        if (existingData.credentials.length > this.MAX_CREDENTIALS) {
          existingData.credentials = existingData.credentials.slice(0, this.MAX_CREDENTIALS)
        }
      }

      // Sort by last connected (most recent first)
      existingData.credentials.sort((a, b) => (b.lastConnected || 0) - (a.lastConnected || 0))

      return save(this.STORAGE_KEY, existingData)
    } catch (error) {
      console.error("Error saving WiFi credentials:", error)
      reportError("Error saving WiFi credentials", 'wifi.credentials', 'save_credentials', error instanceof Error ? error : new Error(String(error)), { ssid })
      return false
    }
  }

  /**
   * Get password for a specific SSID
   */
  static getPassword(ssid: string): string | null {
    try {
      const data = this.loadCredentialsData()
      const credential = data.credentials.find(cred => cred.ssid === ssid)
      return credential?.password || null
    } catch (error) {
      console.error("Error getting WiFi password:", error)
      reportError("Error getting WiFi password", 'wifi.credentials', 'get_password', error instanceof Error ? error : new Error(String(error)), { ssid })
      return null
    }
  }

  /**
   * Get all saved credentials
   */
  static getAllCredentials(): WifiCredential[] {
    try {
      const data = this.loadCredentialsData()
      return data.credentials
    } catch (error) {
      console.error("Error getting all WiFi credentials:", error)
      reportError("Error getting all WiFi credentials", 'wifi.credentials', 'get_all_credentials', error instanceof Error ? error : new Error(String(error)))
      return []
    }
  }

  /**
   * Check if we have credentials for a specific SSID
   */
  static hasCredentials(ssid: string): boolean {
    return this.getPassword(ssid) !== null
  }

  /**
   * Remove credentials for a specific SSID
   */
  static removeCredentials(ssid: string): boolean {
    try {
      console.log("343243243$%^&*21321 removeCredentials", ssid)
      const data = this.loadCredentialsData()
      data.credentials = data.credentials.filter(cred => cred.ssid !== ssid)
      console.log("321321 removed credentials", data)
      return save(this.STORAGE_KEY, data)
    } catch (error) {
      console.error("Error removing WiFi credentials:", error)
      reportError("Error removing WiFi credentials", 'wifi.credentials', 'remove_credentials', error instanceof Error ? error : new Error(String(error)), { ssid })
      return false
    }
  }

  /**
   * Clear all saved credentials
   */
  static clearAllCredentials(): boolean {
    try {
      return save(this.STORAGE_KEY, this.getDefaultData())
    } catch (error) {
      console.error("Error clearing WiFi credentials:", error)
      reportError("Error clearing WiFi credentials", 'wifi.credentials', 'clear_credentials', error instanceof Error ? error : new Error(String(error)))
      return false
    }
  }

  /**
   * Update last connected time for a credential
   */
  static updateLastConnected(ssid: string): boolean {
    try {
      const data = this.loadCredentialsData()
      const credential = data.credentials.find(cred => cred.ssid === ssid)
      if (credential) {
        credential.lastConnected = Date.now()
        // Re-sort by last connected
        data.credentials.sort((a, b) => (b.lastConnected || 0) - (a.lastConnected || 0))
        return save(this.STORAGE_KEY, data)
      }
      return false
    } catch (error) {
      console.error("Error updating last connected time:", error)
      reportError("Error updating last connected time", 'wifi.credentials', 'update_last_connected', error instanceof Error ? error : new Error(String(error)), { ssid })
      return false
    }
  }

  /**
   * Get recently connected networks (last 30 days)
   */
  static getRecentNetworks(): WifiCredential[] {
    try {
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
      const data = this.loadCredentialsData()
      return data.credentials.filter(cred => (cred.lastConnected || 0) > thirtyDaysAgo)
    } catch (error) {
      console.error("Error getting recent networks:", error)
      reportError("Error getting recent networks", 'wifi.credentials', 'get_recent_networks', error instanceof Error ? error : new Error(String(error)))
      return []
    }
  }

  /**
   * Load credentials data from storage
   */
  private static loadCredentialsData(): WifiCredentialsData {
    const data = load<WifiCredentialsData>(this.STORAGE_KEY)
    if (!data || data.version !== this.VERSION) {
      return this.getDefaultData()
    }
    return data
  }

  /**
   * Get default data structure
   */
  private static getDefaultData(): WifiCredentialsData {
    return {
      credentials: [],
      version: this.VERSION,
    }
  }
}

export default WifiCredentialsService
