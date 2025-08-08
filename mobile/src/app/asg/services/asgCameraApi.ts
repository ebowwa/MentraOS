/**
 * ASG Camera Server API Client
 * Provides methods to interact with the AsgCameraServer Java APIs
 */

import {PhotoInfo, GalleryResponse, ServerStatus, HealthResponse} from "../types"

export class AsgCameraApiClient {
  private baseUrl: string
  private port: number
  private lastRequestTime: number = 0
  private requestQueue: Array<() => Promise<any>> = []
  private isProcessingQueue: boolean = false

  constructor(serverUrl?: string, port: number = 8089) {
    this.port = port
    this.baseUrl = serverUrl || `http://localhost:${port}`
    console.log(`[ASG Camera API] Client initialized with server: ${this.baseUrl}`)
  }

  /**
   * Set the server URL and port
   */
  setServer(serverUrl: string, port?: number) {
    const newUrl = `http://${serverUrl.replace(/^https?:\/\//, "")}`
    const newPort = port || this.port

    // Only update if the URL or port actually changed
    if (this.baseUrl !== newUrl || this.port !== newPort) {
      const oldUrl = this.baseUrl
      this.baseUrl = newUrl
      this.port = newPort
      console.log(`[ASG Camera API] Server changed from ${oldUrl} to ${this.baseUrl}`)
    }
  }

  /**
   * Get the current server URL
   */
  getServerUrl(): string {
    return this.baseUrl
  }

  /**
   * Rate limiting helper - ensures minimum delay between requests
   */
  private async rateLimit(): Promise<void> {
    const now = Date.now()
    const timeSinceLastRequest = now - this.lastRequestTime
    const minDelay = 500 // 500ms minimum delay between requests

    if (timeSinceLastRequest < minDelay) {
      const delay = minDelay - timeSinceLastRequest
      console.log(`[ASG Camera API] Rate limiting: waiting ${delay}ms`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }

    this.lastRequestTime = Date.now()
  }

  /**
   * Make a request to the ASG Camera Server with rate limiting and retry logic
   */
  private async makeRequest<T>(endpoint: string, options?: RequestInit, retries: number = 2): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    const method = options?.method || "GET"

    console.log(`[ASG Camera API] ${method} ${url}`)
    console.log(`[ASG Camera API] Request options:`, {
      method,
      headers: options?.headers,
      body: options?.body ? "Present" : "None",
    })

    const startTime = Date.now()

    try {
      // Apply rate limiting only for non-GET requests
      if (method !== "GET") {
        await this.rateLimit()
      }

      // Prepare headers - don't set Content-Type for GET requests
      const headers: Record<string, string> = {}
      if (method !== "GET") {
        headers["Content-Type"] = "application/json"
      }
      if (options?.headers) {
        Object.assign(headers, options.headers)
      }

      const response = await fetch(url, {
        headers,
        ...options,
      })

      const duration = Date.now() - startTime
      console.log(`[ASG Camera API] Response received in ${duration}ms:`, {
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get("content-type"),
        contentLength: response.headers.get("content-length"),
      })

      if (!response.ok) {
        console.error(`[ASG Camera API] HTTP Error ${response.status}: ${response.statusText}`)

        // Handle rate limiting with retry
        if (response.status === 429 && retries > 0) {
          const retryDelay = Math.pow(2, 3 - retries) * 1000 // Exponential backoff: 1s, 2s
          console.log(`[ASG Camera API] Rate limited, retrying in ${retryDelay}ms (${retries} retries left)`)
          await new Promise(resolve => setTimeout(resolve, retryDelay))
          return this.makeRequest<T>(endpoint, options, retries - 1)
        }

        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      // Handle different response types
      const contentType = response.headers.get("content-type")

      if (contentType?.includes("application/json")) {
        const data = await response.json()
        console.log(`[ASG Camera API] JSON Response:`, data)
        return data
      } else if (contentType?.includes("image/")) {
        // For image responses, return the blob
        const blob = await response.blob()
        console.log(`[ASG Camera API] Image Response:`, {
          size: blob.size,
          type: blob.type,
        })
        return blob as T
      } else {
        // For text responses
        const text = await response.text()
        console.log(`[ASG Camera API] Text Response:`, text.substring(0, 200) + (text.length > 200 ? "..." : ""))
        return text as T
      }
    } catch (error) {
      const duration = Date.now() - startTime
      console.error(`[ASG Camera API] Error (${endpoint}) after ${duration}ms:`, error)
      throw error
    }
  }

  /**
   * Take a picture using the ASG camera
   */
  async takePicture(): Promise<{message: string}> {
    console.log(`[ASG Camera API] Taking picture...`)
    return this.makeRequest<{message: string}>("/api/take-picture", {
      method: "POST",
    })
  }

  /**
   * Get the latest photo as a blob
   */
  async getLatestPhoto(): Promise<Blob> {
    console.log(`[ASG Camera API] Getting latest photo...`)
    return this.makeRequest<Blob>("/api/latest-photo")
  }

  /**
   * Get the latest photo as a data URL
   */
  async getLatestPhotoAsDataUrl(): Promise<string> {
    console.log(`[ASG Camera API] Getting latest photo as data URL...`)
    const blob = await this.getLatestPhoto()
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }

  /**
   * Get gallery photos from the server
   */
  async getGallery(): Promise<GalleryResponse> {
    console.log(`[ASG Camera API] Getting gallery...`)

    // Use browser-like headers since we know the browser works
    try {
      console.log(`[ASG Camera API] Trying endpoint: /api/gallery`)
      const response = await fetch(`${this.baseUrl}/api/gallery`, {
        method: "GET",
        headers: {
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
          "Accept-Encoding": "gzip, deflate",
          "Connection": "keep-alive",
          "Upgrade-Insecure-Requests": "1",
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        },
        signal: AbortSignal.timeout(10000), // 10 second timeout
      })

      console.log(`[ASG Camera API] Response status: ${response.status}`)

      if (!response.ok) {
        throw new Error(`Gallery endpoint returned: ${response.status}`)
      }

      const responseText = await response.text()
      console.log(`[ASG Camera API] Raw response:`, responseText.substring(0, 1000))

      let data: any
      try {
        data = JSON.parse(responseText)
      } catch (parseError) {
        console.log(`[ASG Camera API] Failed to parse JSON:`, parseError)
        throw new Error("Invalid JSON response from gallery endpoint")
      }

      // Handle the exact response format we see from browser
      if (data && data.status === "success" && data.data?.photos) {
        console.log(`[ASG Camera API] Found ${data.data.photos.length} photos`)

        // Map photos to ensure proper URL construction
        const photos = data.data.photos.map((photo: any) => ({
          ...photo,
          url: this.constructPhotoUrl(photo.url || photo.name),
          download: this.constructDownloadUrl(photo.download || photo.name),
        }))

        return {
          status: "success",
          data: {photos},
        }
      } else {
        console.log(`[ASG Camera API] Invalid response structure:`, data)
        throw new Error("Invalid response structure from gallery endpoint")
      }
    } catch (error) {
      console.log(`[ASG Camera API] Gallery request failed:`, error)
      throw error
    }
  }

  /**
   * Get the gallery photos array with proper URL construction
   */
  async getGalleryPhotos(): Promise<PhotoInfo[]> {
    console.log(`[ASG Camera API] Getting gallery photos...`)
    try {
      const response = await this.getGallery()
      console.log(`[ASG Camera API] Gallery response:`, response)

      if (!response.data || !response.data.photos) {
        console.warn(`[ASG Camera API] Invalid gallery response structure:`, response)
        return []
      }

      const photos = response.data.photos
      console.log(`[ASG Camera API] Found ${photos.length} photos`)

      // Ensure each photo has proper URLs
      const processedPhotos = photos.map(photo => ({
        ...photo,
        url: this.constructPhotoUrl(photo.name),
        download: this.constructDownloadUrl(photo.name),
      }))

      console.log(`[ASG Camera API] Processed photos:`, processedPhotos)
      return processedPhotos
    } catch (error) {
      console.error(`[ASG Camera API] Error getting gallery photos:`, error)
      throw error
    }
  }

  /**
   * Discover available endpoints on the server
   */
  async discoverEndpoints(): Promise<string[]> {
    const availableEndpoints: string[] = []
    const testEndpoints = [
      "/",
      "/api",
      "/api/health",
      "/api/status",
      "/api/gallery",
      "/gallery",
      "/api/photos",
      "/photos",
      "/api/images",
      "/images",
      "/api/take-picture",
      "/api/latest-photo",
    ]

    console.log(`[ASG Camera API] Discovering available endpoints...`)

    for (const endpoint of testEndpoints) {
      try {
        console.log(`[ASG Camera API] Testing endpoint: ${endpoint}`)
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
          method: "HEAD",
          headers: {
            "Accept": "*/*",
            "User-Agent": "MentraOS-Mobile/1.0",
          },
          signal: AbortSignal.timeout(5000),
        })

        if (response.ok) {
          availableEndpoints.push(endpoint)
          console.log(`[ASG Camera API] Found endpoint: ${endpoint} (${response.status})`)
        } else {
          console.log(`[ASG Camera API] Endpoint ${endpoint} returned: ${response.status}`)
        }
      } catch (error) {
        console.log(`[ASG Camera API] Endpoint ${endpoint} failed:`, error)
        // For /api/gallery specifically, let's try a GET request to see if it's a HEAD request issue
        if (endpoint === "/api/gallery") {
          try {
            console.log(`[ASG Camera API] Trying GET request for /api/gallery...`)
            const getResponse = await fetch(`${this.baseUrl}${endpoint}`, {
              method: "GET",
              headers: {
                "Accept": "application/json",
                "User-Agent": "MentraOS-Mobile/1.0",
              },
              signal: AbortSignal.timeout(5000),
            })
            console.log(`[ASG Camera API] GET /api/gallery status: ${getResponse.status}`)
            if (getResponse.ok) {
              console.log(`[ASG Camera API] GET /api/gallery works! Adding to available endpoints`)
              availableEndpoints.push(endpoint)
            }
          } catch (getError) {
            console.log(`[ASG Camera API] GET /api/gallery also failed:`, getError)
          }
        }
      }
    }

    console.log(`[ASG Camera API] Available endpoints:`, availableEndpoints)
    return availableEndpoints
  }

  /**
   * Construct a photo URL for a given filename
   */
  private constructPhotoUrl(filename: string): string {
    return `${this.baseUrl}/api/photo?file=${encodeURIComponent(filename)}`
  }

  /**
   * Construct a download URL for a given filename
   */
  private constructDownloadUrl(filename: string): string {
    return `${this.baseUrl}/api/download?file=${encodeURIComponent(filename)}`
  }

  /**
   * Get a specific photo by filename
   */
  async getPhoto(filename: string): Promise<Blob> {
    console.log(`[ASG Camera API] Getting photo: ${filename}`)
    return this.makeRequest<Blob>(`/api/photo?file=${encodeURIComponent(filename)}`)
  }

  /**
   * Get a specific photo as a data URL
   */
  async getPhotoAsDataUrl(filename: string): Promise<string> {
    console.log(`[ASG Camera API] Getting photo as data URL: ${filename}`)
    const blob = await this.getPhoto(filename)
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }

  /**
   * Download a photo (returns download URL)
   */
  async downloadPhoto(filename: string): Promise<string> {
    console.log(`[ASG Camera API] Downloading photo: ${filename}`)
    const downloadUrl = `${this.baseUrl}/api/download?file=${encodeURIComponent(filename)}`
    console.log(`[ASG Camera API] Download URL: ${downloadUrl}`)
    return downloadUrl
  }

  /**
   * Get server status information
   */
  async getStatus(): Promise<ServerStatus> {
    console.log(`[ASG Camera API] Getting server status...`)
    return this.makeRequest<ServerStatus>("/api/status")
  }

  /**
   * Get server health check
   */
  async getHealth(): Promise<HealthResponse> {
    console.log(`[ASG Camera API] Getting server health...`)
    return this.makeRequest<HealthResponse>("/api/health")
  }

  /**
   * Get the index page (for testing)
   */
  async getIndexPage(): Promise<string> {
    console.log(`[ASG Camera API] Getting index page...`)
    return this.makeRequest<string>("/")
  }

  /**
   * Check if the server is reachable (simple ping)
   */
  async isServerReachable(): Promise<boolean> {
    try {
      console.log(`[ASG Camera API] Checking server reachability...`)
      // Use a simple HEAD request to check reachability
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 3000) // 3 second timeout

      const response = await fetch(`${this.baseUrl}/api/health`, {
        method: "HEAD",
        signal: controller.signal,
      })

      clearTimeout(timeoutId)
      console.log(`[ASG Camera API] Server is reachable`)
      return response.ok
    } catch (error) {
      console.log(`[ASG Camera API] Server is not reachable:`, error)
      return false
    }
  }

  /**
   * Get comprehensive server information
   */
  async getServerInfo(): Promise<{
    reachable: boolean
    status?: ServerStatus
    health?: HealthResponse
    error?: string
  }> {
    try {
      const [status, health] = await Promise.all([this.getStatus(), this.getHealth()])

      return {
        reachable: true,
        status,
        health,
      }
    } catch (error) {
      return {
        reachable: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  /**
   * Sync with server to get changed files since last sync
   */
  async syncWithServer(clientId: string, lastSyncTime?: number, includeThumbnails: boolean = false): Promise<{
    client_id: string
    changed_files: PhotoInfo[]
    deleted_files: string[]
    server_time: number
    total_files: number
  }> {
    const params = new URLSearchParams({
      client_id: clientId,
      include_thumbnails: includeThumbnails.toString(),
    })

    if (lastSyncTime) {
      params.append('last_sync_time', lastSyncTime.toString())
    }

    const response = await this.makeRequest(`/sync?${params.toString()}`, {
      method: 'GET',
    })

    return response
  }

  /**
   * Batch sync files from server
   */
  async batchSyncFiles(files: PhotoInfo[], includeThumbnails: boolean = false): Promise<{
    downloaded: PhotoInfo[]
    failed: string[]
    total_size: number
  }> {
    const results = {
      downloaded: [] as PhotoInfo[],
      failed: [] as string[],
      total_size: 0,
    }

    // Process files in small batches to avoid overwhelming the server
    const batchSize = 3
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize)
      
      try {
        const batchPromises = batch.map(async (file) => {
          try {
            const fileData = await this.downloadFile(file.name, includeThumbnails)
            results.total_size += file.size
            return { ...file, ...fileData }
          } catch (error) {
            console.error(`Failed to download ${file.name}:`, error)
            results.failed.push(file.name)
            return null
          }
        })

        const batchResults = await Promise.all(batchPromises)
        results.downloaded.push(...batchResults.filter(Boolean) as PhotoInfo[])
        
        // Small delay between batches
        if (i + batchSize < files.length) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      } catch (error) {
        console.error(`Batch ${i / batchSize + 1} failed:`, error)
        results.failed.push(...batch.map(f => f.name))
      }
    }

    return results
  }

  /**
   * Delete files from server after successful sync
   */
  async deleteFilesFromServer(fileNames: string[]): Promise<{
    deleted: string[]
    failed: string[]
  }> {
    if (fileNames.length === 0) {
      return { deleted: [], failed: [] }
    }

    try {
      const response = await this.makeRequest('/delete', {
        method: 'POST',
        body: JSON.stringify({ files: fileNames }),
      })

      return response
    } catch (error) {
      console.error('Failed to delete files from server:', error)
      return { deleted: [], failed: fileNames }
    }
  }

  /**
   * Get sync status from server
   */
  async getSyncStatus(): Promise<{
    total_files: number
    total_size: number
    last_modified: number
  }> {
    const response = await this.makeRequest('/sync/status', {
      method: 'GET',
    })

    return response
  }
}

// Export a default instance - will be initialized with proper IP when used
export const asgCameraApi = new AsgCameraApiClient()
