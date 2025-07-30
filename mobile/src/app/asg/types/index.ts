/**
 * Type definitions for the ASG package
 */

export interface PhotoInfo {
  name: string
  url: string
  download: string
  size: number
  modified: string
}

export interface GalleryResponse {
  status: "success" | "error"
  data: {
    photos: PhotoInfo[]
  }
}

export interface ServerStatus {
  status: string
  uptime: number
  version: string
  timestamp: string
}

export interface HealthResponse {
  status: "healthy" | "unhealthy"
  timestamp: string
  version: string
}

export interface GalleryEvent {
  type: "photo_added" | "photo_deleted" | "gallery_updated"
  photo?: PhotoInfo
  timestamp: string
}
