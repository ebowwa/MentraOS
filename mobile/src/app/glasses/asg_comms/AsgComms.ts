/**
 * ASG Camera Server API Client
 * Provides methods to interact with the AsgCameraServer Java APIs
 */

export interface PhotoInfo {
  name: string
  size: number
  modified: string
  url: string
  download: string
}

export interface GalleryResponse {
  status: string
  data: {
    photos: PhotoInfo[]
  }
}

export interface ServerStatus {
  server: string
  port: number
  uptime: number
  cache_size: number
  photo_directory: string
  server_url: string
  total_photos: number
}

export interface HealthResponse {
  status: string
  timestamp: number
}

export class AsgCameraApiClient {
  private baseUrl: string
  private port: number

  constructor(serverUrl?: string, port: number = 8089) {
    this.port = port
    this.baseUrl = serverUrl || `http://localhost:${port}`
    console.log(`[ASG Camera API] Client initialized with server: ${this.baseUrl}`)
  }

  /**
   * Set the server URL and port
   */
  setServer(serverUrl: string, port?: number) {
    const oldUrl = this.baseUrl
    this.baseUrl = serverUrl
    if (port) this.port = port
    console.log(`[ASG Camera API] Server changed from ${oldUrl} to ${this.baseUrl}`)
  }

  /**
   * Get the current server URL
   */
  getServerUrl(): string {
    return this.baseUrl
  }

  /**
   * Make a request to the ASG Camera Server
   */
  private async makeRequest<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    const method = options?.method || 'GET'
    
    console.log(`[ASG Camera API] ${method} ${url}`)
    console.log(`[ASG Camera API] Request options:`, {
      method,
      headers: options?.headers,
      body: options?.body ? 'Present' : 'None'
    })
    
    const startTime = Date.now()
    
    try {
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
        ...options,
      })

      const duration = Date.now() - startTime
      console.log(`[ASG Camera API] Response received in ${duration}ms:`, {
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get('content-type'),
        contentLength: response.headers.get('content-length')
      })

      if (!response.ok) {
        console.error(`[ASG Camera API] HTTP Error ${response.status}: ${response.statusText}`)
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      // Handle different response types
      const contentType = response.headers.get('content-type')
      
      if (contentType?.includes('application/json')) {
        const data = await response.json()
        console.log(`[ASG Camera API] JSON Response:`, data)
        return data
      } else if (contentType?.includes('image/')) {
        // For image responses, return the blob
        const blob = await response.blob()
        console.log(`[ASG Camera API] Image Response:`, {
          size: blob.size,
          type: blob.type
        })
        return blob as T
      } else {
        // For text responses
        const text = await response.text()
        console.log(`[ASG Camera API] Text Response:`, text.substring(0, 200) + (text.length > 200 ? '...' : ''))
        return text as T
      }
    } catch (error) {
      const duration = Date.now() - startTime
      console.error(`[ASG Camera API] Error (${endpoint}) after ${duration}ms:`, error)
      throw error
    }
  }

  /**
   * Request to take a picture
   * POST /api/take-picture
   */
  async takePicture(): Promise<{ message: string }> {
    console.log(`[ASG Camera API] Taking picture...`)
    const result = await this.makeRequest<{ message: string }>('/api/take-picture', {
      method: 'POST',
    })
    console.log(`[ASG Camera API] Picture taken successfully:`, result)
    return result
  }

  /**
   * Get the latest photo as a blob
   * GET /api/latest-photo
   */
  async getLatestPhoto(): Promise<Blob> {
    return this.makeRequest<Blob>('/api/latest-photo')
  }

  /**
   * Get the latest photo as a data URL
   * GET /api/latest-photo
   */
  async getLatestPhotoAsDataUrl(): Promise<string> {
    const blob = await this.getLatestPhoto()
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }

  /**
   * Get the photo gallery listing
   * GET /api/gallery
   */
  async getGallery(): Promise<GalleryResponse> {
    return this.makeRequest<GalleryResponse>('/api/gallery')
  }

  /**
   * Get the photo gallery listing and return just the photos array
   * GET /api/gallery
   */
  async getGalleryPhotos(): Promise<PhotoInfo[]> {
    console.log(`[ASG Camera API] Fetching gallery photos...`)
    const response = await this.makeRequest<GalleryResponse>('/api/gallery')
    const photos = response.data.photos
    console.log(`[ASG Camera API] Gallery loaded: ${photos.length} photos found`)
    return photos
  }

  /**
   * Get a specific photo by filename
   * GET /api/photo?file={filename}
   */
  async getPhoto(filename: string): Promise<Blob> {
    console.log(`[ASG Camera API] Fetching photo: ${filename}`)
    const blob = await this.makeRequest<Blob>(`/api/download?file=${encodeURIComponent(filename)}`)
    console.log(`[ASG Camera API] Photo loaded: ${filename} (${blob.size} bytes)`)
    return blob
  }

  /**
   * Get a specific photo as a data URL
   * GET /api/photo?file={filename}
   */
  async getPhotoAsDataUrl(filename: string): Promise<string> {
    const blob = await this.getPhoto(filename)
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }

  /**
   * Download a photo (for React Native - returns the download URL)
   * GET /api/download?file={filename}
   */
  async downloadPhoto(filename: string): Promise<string> {
    const url = `${this.baseUrl}/api/download?file=${encodeURIComponent(filename)}`
    console.log(`[ASG Camera API] Download URL for ${filename}: ${url}`)
    return url
  }

  /**
   * Get server status information
   * GET /api/status
   */
  async getStatus(): Promise<ServerStatus> {
    console.log(`[ASG Camera API] Fetching server status...`)
    const status = await this.makeRequest<ServerStatus>('/api/status')
    console.log(`[ASG Camera API] Server status:`, status)
    return status
  }

  /**
   * Get server health check
   * GET /api/health
   */
  async getHealth(): Promise<HealthResponse> {
    console.log(`[ASG Camera API] Checking server health...`)
    const health = await this.makeRequest<HealthResponse>('/api/health')
    console.log(`[ASG Camera API] Server health:`, health)
    return health
  }

  /**
   * Get the server index page
   * GET /
   */
  async getIndexPage(): Promise<string> {
    return this.makeRequest<string>('/')
  }

  /**
   * Check if the server is reachable
   */
  async isServerReachable(): Promise<boolean> {
    console.log(`[ASG Camera API] Checking if server is reachable...`)
    try {
      await this.getHealth()
      console.log(`[ASG Camera API] Server is reachable`)
      return true
    } catch (error) {
      console.log(`[ASG Camera API] Server is not reachable:`, error)
      return false
    }
  }

  /**
   * Get server information including connection status
   */
  async getServerInfo(): Promise<{
    reachable: boolean
    status?: ServerStatus
    health?: HealthResponse
    error?: string
  }> {
    console.log(`[ASG Camera API] Getting comprehensive server info...`)
    try {
      const [status, health] = await Promise.all([
        this.getStatus(),
        this.getHealth(),
      ])
      
      const info = {
        reachable: true,
        status,
        health,
      }
      console.log(`[ASG Camera API] Server info retrieved successfully:`, info)
      return info
    } catch (error) {
      const errorInfo = {
        reachable: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
      console.log(`[ASG Camera API] Failed to get server info:`, errorInfo)
      return errorInfo
    }
  }
}

// Export a default instance
export const asgCameraApi = new AsgCameraApiClient() 