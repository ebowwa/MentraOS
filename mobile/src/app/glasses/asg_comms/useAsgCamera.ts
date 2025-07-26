import { useState, useCallback, useEffect } from 'react'
import { asgCameraApi, type PhotoInfo, type GalleryResponse, type ServerStatus } from './AsgComms'

export interface UseAsgCameraOptions {
  serverUrl?: string
  port?: number
  autoConnect?: boolean
}

export interface UseAsgCameraReturn {
  // Server connection
  isConnected: boolean
  isConnecting: boolean
  serverInfo?: ServerStatus
  connectError?: string
  
  // Gallery
  photos: PhotoInfo[]
  isLoadingGallery: boolean
  galleryError?: string
  
  // Latest photo
  latestPhotoUrl?: string
  isLoadingLatestPhoto: boolean
  latestPhotoError?: string
  
  // Actions
  connect: () => Promise<void>
  disconnect: () => void
  refreshGallery: () => Promise<void>
  takePicture: () => Promise<void>
  getLatestPhoto: () => Promise<void>
  downloadPhoto: (filename: string) => Promise<void>
  
  // Utility
  setServer: (url: string, port?: number) => void
}

export function useAsgCamera(options: UseAsgCameraOptions = {}): UseAsgCameraReturn {
  const { serverUrl, port = 8089, autoConnect = true } = options
  
  // Server connection state
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [serverInfo, setServerInfo] = useState<ServerStatus>()
  const [connectError, setConnectError] = useState<string>()
  
  // Gallery state
  const [photos, setPhotos] = useState<PhotoInfo[]>([])
  const [isLoadingGallery, setIsLoadingGallery] = useState(false)
  const [galleryError, setGalleryError] = useState<string>()
  
  // Latest photo state
  const [latestPhotoUrl, setLatestPhotoUrl] = useState<string>()
  const [isLoadingLatestPhoto, setIsLoadingLatestPhoto] = useState(false)
  const [latestPhotoError, setLatestPhotoError] = useState<string>()
  
  // Set server URL and port
  const setServer = useCallback((url: string, newPort?: number) => {
    asgCameraApi.setServer(url, newPort)
    setIsConnected(false)
    setServerInfo(undefined)
    setConnectError(undefined)
  }, [])
  
  // Connect to server
  const connect = useCallback(async () => {
    setIsConnecting(true)
    setConnectError(undefined)
    
    try {
      const info = await asgCameraApi.getServerInfo()
      
      if (info.reachable) {
        setIsConnected(true)
        setServerInfo(info.status)
        setConnectError(undefined)
      } else {
        setIsConnected(false)
        setServerInfo(undefined)
        setConnectError(info.error || 'Server not reachable')
      }
    } catch (error) {
      setIsConnected(false)
      setServerInfo(undefined)
      setConnectError(error instanceof Error ? error.message : 'Connection failed')
    } finally {
      setIsConnecting(false)
    }
  }, [])
  
  // Disconnect from server
  const disconnect = useCallback(() => {
    setIsConnected(false)
    setServerInfo(undefined)
    setConnectError(undefined)
    setPhotos([])
    setLatestPhotoUrl(undefined)
  }, [])
  
  // Refresh gallery
  const refreshGallery = useCallback(async () => {
    if (!isConnected) return
    
    setIsLoadingGallery(true)
    setGalleryError(undefined)
    
    try {
      const photos = await asgCameraApi.getGalleryPhotos()
      setPhotos(photos)
      setGalleryError(undefined)
    } catch (error) {
      setGalleryError(error instanceof Error ? error.message : 'Failed to load gallery')
    } finally {
      setIsLoadingGallery(false)
    }
  }, [isConnected])
  
  // Take picture
  const takePicture = useCallback(async () => {
    if (!isConnected) return
    
    try {
      await asgCameraApi.takePicture()
      // Refresh gallery after taking picture
      setTimeout(() => {
        refreshGallery()
        getLatestPhoto()
      }, 1000) // Wait a bit for the photo to be saved
    } catch (error) {
      console.error('Failed to take picture:', error)
      throw error
    }
  }, [isConnected, refreshGallery])
  
  // Get latest photo
  const getLatestPhoto = useCallback(async () => {
    if (!isConnected) return
    
    setIsLoadingLatestPhoto(true)
    setLatestPhotoError(undefined)
    
    try {
      const dataUrl = await asgCameraApi.getLatestPhotoAsDataUrl()
      setLatestPhotoUrl(dataUrl)
      setLatestPhotoError(undefined)
    } catch (error) {
      setLatestPhotoError(error instanceof Error ? error.message : 'Failed to load latest photo')
    } finally {
      setIsLoadingLatestPhoto(false)
    }
  }, [isConnected])
  
  // Download photo
  const downloadPhoto = useCallback(async (filename: string) => {
    if (!isConnected) return
    
    try {
      await asgCameraApi.downloadPhoto(filename)
    } catch (error) {
      console.error('Failed to download photo:', error)
      throw error
    }
  }, [isConnected])
  
  // Auto-connect on mount if enabled
  useEffect(() => {
    if (autoConnect && serverUrl) {
      setServer(serverUrl, port)
      connect()
    }
  }, [autoConnect, serverUrl, port, setServer, connect])
  
  // Auto-refresh gallery when connected
  useEffect(() => {
    if (isConnected) {
      refreshGallery()
    }
  }, [isConnected, refreshGallery])
  
  return {
    // Server connection
    isConnected,
    isConnecting,
    serverInfo,
    connectError,
    
    // Gallery
    photos,
    isLoadingGallery,
    galleryError,
    
    // Latest photo
    latestPhotoUrl,
    isLoadingLatestPhoto,
    latestPhotoError,
    
    // Actions
    connect,
    disconnect,
    refreshGallery,
    takePicture,
    getLatestPhoto,
    downloadPhoto,
    
    // Utility
    setServer,
  }
} 