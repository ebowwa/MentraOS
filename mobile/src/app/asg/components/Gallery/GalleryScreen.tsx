/**
 * Main gallery screen component
 */

import React, {useCallback, useState, useEffect, useMemo, useRef} from "react"
import {
  View,
  Text,
  BackHandler,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  ScrollView,
  FlatList,
  ViewToken,
  Clipboard,
} from "react-native"
import {useLocalSearchParams, useFocusEffect} from "expo-router"
import {useSafeAreaInsets} from "react-native-safe-area-context"
import {useAppTheme} from "@/utils/useAppTheme"
import {spacing, ThemedStyle} from "@/theme"
import {ViewStyle, TextStyle, ImageStyle} from "react-native"
import {useCoreStatus} from "@/contexts/CoreStatusProvider"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {PhotoInfo} from "../../types"
import {asgCameraApi} from "../../services/asgCameraApi"
import {localStorageService} from "../../services/localStorageService"
import {PhotoImage} from "./PhotoImage"
import {MediaViewer} from "./MediaViewer"
import {createShimmerPlaceholder} from "react-native-shimmer-placeholder"
import LinearGradient from "expo-linear-gradient"

const ShimmerPlaceholder = createShimmerPlaceholder(LinearGradient)
import showAlert from "@/utils/AlertUtils"
import {translate} from "@/i18n"
import {shareFile} from "@/utils/FileUtils"
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons"
import {useNetworkConnectivity} from "@/contexts/NetworkConnectivityProvider"
import coreCommunicator from "@/bridge/CoreCommunicator"
import WifiManager from "react-native-wifi-reborn"
import GlobalEventEmitter from "@/utils/GlobalEventEmitter"

// Gallery state machine states
enum GalleryState {
  // Initial states
  INITIALIZING = "initializing", // Just opened gallery, loading local photos
  QUERYING_GLASSES = "querying_glasses", // Sent BLE query for glasses media status

  // Decision states after query
  NO_MEDIA_ON_GLASSES = "no_media_on_glasses", // Query returned, no media to sync
  MEDIA_AVAILABLE = "media_available", // Query returned, media exists on glasses

  // Connection states
  REQUESTING_HOTSPOT = "requesting_hotspot", // Sent command to enable hotspot
  WAITING_FOR_WIFI_PROMPT = "waiting_for_wifi_prompt", // Hotspot ready, waiting for user
  USER_CANCELLED_WIFI = "user_cancelled_wifi", // User hit cancel on WiFi prompt
  CONNECTING_TO_HOTSPOT = "connecting_to_hotspot", // User accepted, connecting...

  // Connected states
  CONNECTED_LOADING = "connected_loading", // Connected, loading photo list
  READY_TO_SYNC = "ready_to_sync", // Photos loaded, can start sync
  SYNCING = "syncing", // Actively downloading photos

  // Final states
  SYNC_COMPLETE = "sync_complete", // All photos synced
  ERROR = "error", // Something went wrong

  // Edge case states
  ALREADY_ON_SAME_WIFI = "already_on_same_wifi", // Phone & glasses on same network
}

export function GalleryScreen() {
  const {status} = useCoreStatus()
  const {goBack} = useNavigationHistory()
  const {theme, themed} = useAppTheme()
  const insets = useSafeAreaInsets()

  // Responsive column calculation
  const screenWidth = Dimensions.get("window").width
  const MIN_ITEM_WIDTH = 150 // Minimum width for each photo

  // Calculate columns: 2 for phones, 3-4 for tablets
  const calculateColumns = () => {
    const availableWidth = screenWidth - spacing.lg * 2
    const columns = Math.floor(availableWidth / MIN_ITEM_WIDTH)
    return Math.max(2, Math.min(columns, 4)) // Min 2, max 4 columns
  }

  const numColumns = calculateColumns()
  const itemWidth = (screenWidth - spacing.lg * 2 - spacing.lg * (numColumns - 1)) / numColumns

  // Memoize connection values to prevent unnecessary re-renders
  const connectionInfo = useMemo(() => {
    const glassesInfo = status.glasses_info
    return {
      glassesWifiIp: glassesInfo?.glasses_wifi_local_ip,
      isWifiConnected: glassesInfo?.glasses_wifi_connected,
      isHotspotEnabled: glassesInfo?.glasses_hotspot_enabled,
      hotspotSsid: glassesInfo?.glasses_hotspot_ssid,
      hotspotPassword: glassesInfo?.glasses_hotspot_password,
      hotspotGatewayIp: glassesInfo?.glasses_hotspot_gateway_ip,
    }
  }, [
    status.glasses_info?.glasses_wifi_local_ip,
    status.glasses_info?.glasses_wifi_connected,
    status.glasses_info?.glasses_hotspot_enabled,
    status.glasses_info?.glasses_hotspot_ssid,
    status.glasses_info?.glasses_hotspot_password,
    status.glasses_info?.glasses_hotspot_gateway_ip,
  ])

  // Extract values from memoized object
  const {glassesWifiIp, isWifiConnected, isHotspotEnabled, hotspotSsid, hotspotPassword, hotspotGatewayIp} =
    connectionInfo

  // DEBUG: Log hotspot status changes
  useEffect(() => {
    console.log("[GalleryScreen] HOTSPOT DEBUG:", {
      isHotspotEnabled,
      hotspotSsid,
      hotspotPassword,
      hotspotGatewayIp,
      glassesInfo: status.glasses_info,
    })
  }, [
    connectionInfo.isHotspotEnabled,
    connectionInfo.hotspotSsid,
    connectionInfo.hotspotPassword,
    connectionInfo.hotspotGatewayIp,
  ])

  // Network connectivity
  const {networkStatus, isGalleryReachable, shouldShowWarning, getStatusMessage, checkConnectivity} =
    useNetworkConnectivity()

  // State machine for gallery flow
  const [galleryState, setGalleryState] = useState<GalleryState>(GalleryState.INITIALIZING)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Helper function to log state transitions
  const transitionToState = (newState: GalleryState) => {
    console.log(`[GalleryScreen] State transition: ${galleryState} → ${newState}`)
    setGalleryState(newState)
  }

  // Data state - these are data, not flow control
  const [totalServerCount, setTotalServerCount] = useState(0)
  const [loadedServerPhotos, setLoadedServerPhotos] = useState<Map<number, PhotoInfo>>(new Map())
  const [downloadedPhotos, setDownloadedPhotos] = useState<PhotoInfo[]>([])
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoInfo | null>(null)
  const [syncProgress, setSyncProgress] = useState<{
    current: number
    total: number
    message: string
  } | null>(null)
  const [glassesGalleryStatus, setGlassesGalleryStatus] = useState<{
    photos: number
    videos: number
    total: number
    has_content: boolean
  } | null>(null)

  // Track if we opened the hotspot (for cleanup)
  const [galleryOpenedHotspot, setGalleryOpenedHotspot] = useState(false)

  // Track loaded ranges to avoid duplicate requests
  const loadedRanges = useRef<Set<string>>(new Set())
  const loadingRanges = useRef<Set<string>>(new Set())
  const PAGE_SIZE = 20

  // Initial load - get total count and first batch
  const loadInitialPhotos = useCallback(async () => {
    // Determine the correct server IP - prioritize hotspot if enabled
    const serverIp = isHotspotEnabled && hotspotGatewayIp ? hotspotGatewayIp : glassesWifiIp
    const hasConnection = (isWifiConnected && glassesWifiIp) || (isHotspotEnabled && hotspotGatewayIp)

    if (!hasConnection || !serverIp) {
      console.log("[GalleryScreen] Glasses not connected (WiFi or hotspot)")
      setTotalServerCount(0)
      // If we were trying to load, mark as no media
      if (galleryState === GalleryState.CONNECTED_LOADING) {
        transitionToState(GalleryState.NO_MEDIA_ON_GLASSES)
      }
      return
    }

    // Transition to loading state if not already
    if (galleryState !== GalleryState.CONNECTED_LOADING && galleryState !== GalleryState.ALREADY_ON_SAME_WIFI) {
      transitionToState(GalleryState.CONNECTED_LOADING)
    }

    try {
      asgCameraApi.setServer(serverIp, 8089)

      // Get first page to know total count
      const result = await asgCameraApi.getGalleryPhotos(PAGE_SIZE, 0)

      setTotalServerCount(result.totalCount)

      // If no photos, we're done loading
      if (result.totalCount === 0) {
        console.log("[GalleryScreen] No photos on glasses")
        transitionToState(GalleryState.NO_MEDIA_ON_GLASSES)
        return
      }

      // Store loaded photos in map
      const newMap = new Map<number, PhotoInfo>()
      result.photos.forEach((photo, index) => {
        newMap.set(index, photo)
      })
      setLoadedServerPhotos(newMap)

      // Mark this range as loaded
      loadedRanges.current.add("0-19")

      // We have photos, ready to sync
      transitionToState(GalleryState.READY_TO_SYNC)
    } catch (err) {
      console.error("[GalleryScreen] Failed to load initial photos:", err)
      setTotalServerCount(0)
      setErrorMessage(err instanceof Error ? err.message : "Failed to load photos")
      transitionToState(GalleryState.ERROR)
    }
  }, [connectionInfo, galleryState])

  // Load photos for specific indices (for lazy loading)
  const loadPhotosForIndices = useCallback(
    async (indices: number[]) => {
      if (!isWifiConnected || !glassesWifiIp || indices.length === 0) return

      // Filter out already loaded indices
      const unloadedIndices = indices.filter(i => !loadedServerPhotos.has(i))
      if (unloadedIndices.length === 0) return

      // Find contiguous ranges to load
      const sortedIndices = [...unloadedIndices].sort((a, b) => a - b)
      const minIndex = sortedIndices[0]
      const maxIndex = sortedIndices[sortedIndices.length - 1]

      // Create range key
      const rangeKey = `${minIndex}-${maxIndex}`

      // Skip if already loading or loaded this range
      if (loadingRanges.current.has(rangeKey) || loadedRanges.current.has(rangeKey)) {
        return
      }

      loadingRanges.current.add(rangeKey)

      try {
        // Determine the correct server IP - prioritize hotspot if enabled
        const serverIp = isHotspotEnabled && hotspotGatewayIp ? hotspotGatewayIp : glassesWifiIp
        asgCameraApi.setServer(serverIp, 8089)

        // Load the range
        const limit = maxIndex - minIndex + 1
        const result = await asgCameraApi.getGalleryPhotos(limit, minIndex)

        // Update loaded photos map
        setLoadedServerPhotos(prev => {
          const newMap = new Map(prev)
          result.photos.forEach((photo, i) => {
            newMap.set(minIndex + i, photo)
          })
          return newMap
        })

        loadedRanges.current.add(rangeKey)
      } catch (err) {
        console.error(`[GalleryScreen] Failed to load range ${rangeKey}:`, err)
      } finally {
        loadingRanges.current.delete(rangeKey)
      }
    },
    [connectionInfo.isWifiConnected, connectionInfo.glassesWifiIp, loadedServerPhotos],
  )

  // Load downloaded photos
  const loadDownloadedPhotos = useCallback(async () => {
    try {
      const downloadedFiles = await localStorageService.getDownloadedFiles()
      const photoInfos = Object.values(downloadedFiles).map(file => localStorageService.convertToPhotoInfo(file))
      setDownloadedPhotos(photoInfos)
    } catch (err) {
      console.error("Error loading downloaded photos:", err)
    }
  }, [])

  // Sync files from server to local storage
  const handleSync = async () => {
    // Check for either WiFi or hotspot connection
    const hasConnection = (isWifiConnected && glassesWifiIp) || (isHotspotEnabled && hotspotGatewayIp)
    const serverIp = isHotspotEnabled && hotspotGatewayIp ? hotspotGatewayIp : glassesWifiIp

    if (!hasConnection || !serverIp) {
      showAlert("Cannot Sync", "Your glasses are not connected. Please connect them to WiFi or enable hotspot.", [
        {text: translate("common:ok")},
      ])
      return
    }

    transitionToState(GalleryState.SYNCING)
    setSyncProgress(null)

    try {
      console.log(`[GalleryScreen] Starting sync process with server IP: ${serverIp}`)

      // Set the server IP for the sync
      asgCameraApi.setServer(serverIp, 8089)
      console.log(`[GalleryScreen] Set server URL to: ${serverIp}:8089`)

      // Get sync state
      const syncState = await localStorageService.getSyncState()
      console.log(`[GalleryScreen] Sync state:`, syncState)

      // Get changed files from server - this endpoint returns ALL changed files, not paginated
      const syncResponse = await asgCameraApi.syncWithServer(
        syncState.client_id,
        syncState.last_sync_time,
        true, // include thumbnails
      )

      console.log(`[GalleryScreen] Sync response:`, syncResponse)

      // Access the data property of the response
      const syncData = syncResponse.data || syncResponse

      if (!syncData.changed_files || syncData.changed_files.length === 0) {
        showAlert("Sync Complete", "No new files to download", [{text: translate("common:ok")}])
        return
      }

      setSyncProgress({
        current: 0,
        total: syncData.changed_files.length,
        message: "Downloading files...",
      })

      // Download files sequentially with progress tracking
      const downloadResult = await asgCameraApi.batchSyncFiles(
        syncData.changed_files,
        true,
        (current, total, fileName) => {
          setSyncProgress({
            current,
            total,
            message: `Downloading ${fileName}...`,
          })
        },
      )

      console.log(`[GalleryScreen] Download result:`, downloadResult)

      // Get glasses model from status
      console.log(`[GalleryScreen] Status glasses_info:`, status.glasses_info)
      const glassesModel = status.glasses_info?.model_name || undefined
      console.log(`[GalleryScreen] Using glasses model: ${glassesModel}`)

      // Save downloaded files metadata to local storage (files are already saved to filesystem)
      for (const photoInfo of downloadResult.downloaded) {
        const downloadedFile = localStorageService.convertToDownloadedFile(
          photoInfo,
          photoInfo.filePath, // File path from download
          photoInfo.thumbnailPath, // Thumbnail path if exists
          glassesModel, // Pass glasses model
        )
        await localStorageService.saveDownloadedFile(downloadedFile)
        console.log(`[GalleryScreen] Saved metadata for ${photoInfo.name} with model: ${glassesModel}`)
      }

      // Delete files from server after successful download
      if (downloadResult.downloaded.length > 0) {
        const deleteResult = await asgCameraApi.deleteFilesFromServer(downloadResult.downloaded.map(f => f.name))
        console.log(`[GalleryScreen] Delete result:`, deleteResult)
      }

      // Update sync state
      await localStorageService.updateSyncState({
        last_sync_time: syncData.server_time,
        total_downloaded: syncState.total_downloaded + downloadResult.downloaded.length,
        total_size: syncState.total_size + downloadResult.total_size,
      })

      // Reload photos - only need to reload server photos after sync, local photos are already updated
      await loadDownloadedPhotos() // Update local photos list after sync
      await loadInitialPhotos() // Reload server photos in case new ones are available

      // Mark sync as complete
      transitionToState(GalleryState.SYNC_COMPLETE)
      setSyncProgress(null)

      // After a delay, transition to no media state (since everything is synced)
      setTimeout(() => {
        transitionToState(GalleryState.NO_MEDIA_ON_GLASSES)
      }, 2000)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Sync failed"
      setErrorMessage(errorMsg)
      showAlert("Sync Error", errorMsg, [{text: translate("common:ok")}])
      transitionToState(GalleryState.ERROR)
      setSyncProgress(null)
    }
  }

  // Take picture
  const handleTakePicture = async () => {
    // Determine the correct server IP - prioritize hotspot if enabled
    const serverIp = isHotspotEnabled && hotspotGatewayIp ? hotspotGatewayIp : glassesWifiIp
    const hasConnection = (isWifiConnected && glassesWifiIp) || (isHotspotEnabled && hotspotGatewayIp)

    if (!hasConnection || !serverIp) {
      showAlert("Cannot Take Picture", "Your glasses are not connected. Please connect them via WiFi or hotspot.", [
        {text: translate("common:ok")},
      ])
      return
    }

    try {
      // Set the server URL to the correct IP
      asgCameraApi.setServer(serverIp, 8089)

      await asgCameraApi.takePicture()
      showAlert("Success", "Picture taken successfully!", [{text: translate("common:ok")}])
      loadInitialPhotos() // Reload photos
    } catch (err) {
      let errorMessage = "Cannot connect to your glasses. Please check your network connection."
      if (err instanceof Error) {
        if (err.message.includes("Network request failed") || err.message.includes("fetch")) {
          errorMessage = "Cannot connect to your glasses. Please ensure both devices are on the same WiFi network."
        } else {
          errorMessage = err.message
        }
      }
      showAlert("Connection Error", errorMessage, [{text: translate("common:ok")}])
    }
  }

  // Handle photo selection
  const handlePhotoPress = (item: GalleryItem) => {
    if (!item.photo) return // Skip placeholders

    // Check if it's a video that's still on the glasses (not synced)
    if (item.photo.is_video && item.isOnServer) {
      showAlert("Video Not Downloaded", "Please sync this video to your device to watch it", [
        {text: translate("common:ok")},
      ])
      return
    }
    setSelectedPhoto(item.photo)
  }

  // Handle photo sharing
  const handleSharePhoto = async (photo: PhotoInfo) => {
    try {
      if (!photo) {
        console.error("No photo provided to share")
        return
      }

      let filePath = ""

      console.log("Sharing photo:", {
        name: photo.name,
        url: photo.url,
        download: photo.download,
        filePath: photo.filePath,
        mime_type: photo.mime_type,
        is_video: photo.is_video,
      })

      // For videos, use download URL if available (actual video file), not thumbnail
      const shareUrl = photo.is_video && photo.download ? photo.download : photo.url

      // For file:// URLs, extract the path
      if (shareUrl && shareUrl.startsWith("file://")) {
        filePath = shareUrl.replace("file://", "")
      } else if (photo.filePath) {
        // If we have a local file path, use that
        filePath = photo.filePath.startsWith("file://") ? photo.filePath.replace("file://", "") : photo.filePath
      } else {
        // For server photos/videos, we need to download first
        const mediaType = photo.is_video ? "video" : "photo"
        // Close the media viewer first so the alert appears on top
        setSelectedPhoto(null)
        // Small delay to ensure modal closes before showing alert
        setTimeout(() => {
          showAlert("Info", `Please sync this ${mediaType} first to share it`, [{text: translate("common:ok")}])
        }, 100)
        return
      }

      if (!filePath) {
        console.error("No valid file path found")
        // Close the media viewer first so the alert appears on top
        setSelectedPhoto(null)
        // Small delay to ensure modal closes before showing alert
        setTimeout(() => {
          showAlert("Error", "Unable to share this photo", [{text: translate("common:ok")}])
        }, 100)
        return
      }

      console.log("Final file path:", filePath)

      // Create share message with glasses model if available
      let shareMessage = photo.is_video ? "Check out this video" : "Check out this photo"
      if (photo.glassesModel) {
        shareMessage += ` taken with ${photo.glassesModel}`
      }
      shareMessage += "!"

      console.log("Share message:", shareMessage)

      // Use the shareFile utility that handles platform-specific sharing
      const mimeType = photo.mime_type || (photo.is_video ? "video/mp4" : "image/jpeg")
      await shareFile(filePath, mimeType, "Share Photo", shareMessage)

      console.log("Share completed successfully")
    } catch (error) {
      // Check if it's a file provider error
      if (error instanceof Error && error.message?.includes("FileProvider")) {
        // Close the media viewer first so the alert appears on top
        setSelectedPhoto(null)
        // Small delay to ensure modal closes before showing alert
        setTimeout(() => {
          showAlert(
            "Sharing Not Available",
            "File sharing will work after the next app build. For now, you can find your photos in the AugmentOS folder.",
            [{text: translate("common:ok")}],
          )
        }, 100)
      } else {
        console.error("Error sharing photo:", error)
        // Close the media viewer first so the alert appears on top
        setSelectedPhoto(null)
        // Small delay to ensure modal closes before showing alert
        setTimeout(() => {
          showAlert("Error", "Failed to share photo", [{text: translate("common:ok")}])
        }, 100)
      }
    }
  }

  // Handle hotspot request
  const handleRequestHotspot = async () => {
    transitionToState(GalleryState.REQUESTING_HOTSPOT)
    try {
      // Send hotspot command using existing CoreCommunicator
      await coreCommunicator.sendCommand("set_hotspot_state", {enabled: true})

      // Track that gallery opened this hotspot for lifecycle management
      setGalleryOpenedHotspot(true)
      console.log("[GalleryScreen] Gallery initiated hotspot - will auto-close when appropriate")

      // Transition to waiting for hotspot to be ready
      transitionToState(GalleryState.WAITING_FOR_WIFI_PROMPT)
    } catch (error) {
      console.error("[GalleryScreen] Failed to start hotspot:", error)
      setErrorMessage("Failed to start hotspot")
      showAlert("Error", "Failed to start hotspot", [{text: "OK"}])
      transitionToState(GalleryState.ERROR)
    }
  }

  // Handle stop hotspot
  const handleStopHotspot = async () => {
    try {
      await coreCommunicator.sendCommand("set_hotspot_state", {enabled: false})
      setGalleryOpenedHotspot(false) // Reset tracking
    } catch (error) {
      console.error("[GalleryScreen] Failed to stop hotspot:", error)
    }
  }

  // Handle photo deletion
  const handleDeletePhoto = async (photo: PhotoInfo) => {
    // Check for either WiFi or hotspot connection
    const hasConnection = (isWifiConnected && glassesWifiIp) || (isHotspotEnabled && hotspotGatewayIp)

    if (!hasConnection) {
      showAlert("Error", "Glasses not connected", [{text: translate("common:ok")}])
      return
    }

    showAlert("Delete Photo", `Are you sure you want to delete "${photo.name}"?`, [
      {text: translate("common:cancel"), style: "cancel"},
      {
        text: translate("common:delete"),
        style: "destructive",
        onPress: async () => {
          try {
            await asgCameraApi.deleteFilesFromServer([photo.name])
            showAlert("Success", "Photo deleted successfully!", [{text: translate("common:ok")}])
            loadInitialPhotos() // Reload photos
          } catch (err) {
            showAlert("Error", err instanceof Error ? err.message : "Failed to delete photo", [
              {text: translate("common:ok")},
            ])
          }
        },
      },
    ])
  }

  // Handle downloaded photo deletion
  const handleDeleteDownloadedPhoto = async (photo: PhotoInfo) => {
    showAlert("Delete Downloaded Photo", `Are you sure you want to delete "${photo.name}" from local storage?`, [
      {text: translate("common:cancel"), style: "cancel"},
      {
        text: translate("common:delete"),
        style: "destructive",
        onPress: async () => {
          try {
            await localStorageService.deleteDownloadedFile(photo.name)
            await loadDownloadedPhotos() // Reload downloaded photos
            //showAlert("Success", "Photo deleted from local storage!", [{text: translate("common:ok")}])
          } catch (err) {
            showAlert("Error", "Failed to delete photo from local storage", [{text: translate("common:ok")}])
          }
        },
      },
    ])
  }

  // Query gallery status from glasses
  const queryGlassesGalleryStatus = () => {
    console.log("[GalleryScreen] Querying glasses gallery status...")
    coreCommunicator
      .queryGalleryStatus()
      .catch(error => console.error("[GalleryScreen] Failed to send gallery status query:", error))
  }

  // STEP 1: On mount - load local photos and query gallery status
  useEffect(() => {
    console.log("[GalleryScreen] Component mounted, starting smart gallery flow")

    // Always load local photos first
    loadDownloadedPhotos()

    // Transition to querying state
    transitionToState(GalleryState.QUERYING_GLASSES)

    // Query gallery status via BLE - this starts the whole flow
    queryGlassesGalleryStatus()

    // If already on same WiFi network, try loading photos
    if (isWifiConnected && glassesWifiIp) {
      console.log("[GalleryScreen] Already on same WiFi, will check connectivity")
      transitionToState(GalleryState.ALREADY_ON_SAME_WIFI)
      loadInitialPhotos()
    }
  }, []) // Only run on mount

  // STEP 5: When gallery becomes reachable, start sync
  useEffect(() => {
    // Only reload photos when on same WiFi (not hotspot - that's handled by SSID matching)
    if (
      isWifiConnected &&
      glassesWifiIp &&
      galleryState !== GalleryState.INITIALIZING &&
      galleryState !== GalleryState.QUERYING_GLASSES
    ) {
      console.log("[GalleryScreen] WiFi connection established, loading photos")
      loadInitialPhotos()
    }
  }, [isWifiConnected, glassesWifiIp, galleryState])

  // Handle back button
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (selectedPhoto) {
          setSelectedPhoto(null)
          return true
        }
        return false
      }

      BackHandler.addEventListener("hardwareBackPress", onBackPress)
      return () => BackHandler.removeEventListener("hardwareBackPress", onBackPress)
    }, [selectedPhoto]),
  )

  // Auto-refresh connection check is now handled by NetworkConnectivityProvider

  // Helper functions for hotspot connection
  const showManualAlert = (ssid: string, password: string) => {
    showAlert(
      "Gallery Hotspot Ready",
      `Please connect your phone to this WiFi network:

SSID: ${ssid}
Password: ${password}

The gallery will automatically reload once connected.`,
      [
        {text: "Copy SSID", onPress: () => Clipboard.setString(ssid)},
        {text: "Copy Password", onPress: () => Clipboard.setString(password)},
        {text: "OK"},
      ],
    )
  }

  const connectToHotspot = async (ssid: string, password: string, ip: string) => {
    try {
      console.log(`[GalleryScreen] Connecting to ${ssid}...`)

      // Transition to connecting state
      transitionToState(GalleryState.CONNECTING_TO_HOTSPOT)

      // Attempt to connect to the hotspot automatically
      await WifiManager.connectToProtectedSSID(
        ssid,
        password,
        false, // isWEP
        false, // isHidden
      )

      console.log("[GalleryScreen] Successfully connected to hotspot!")

      // Update camera API to use hotspot IP
      if (ip) {
        asgCameraApi.setServer(ip, 8089)
        // Transition to connected loading state
        transitionToState(GalleryState.CONNECTED_LOADING)
        // Reload gallery after connection - only server photos need reloading
        setTimeout(() => {
          loadInitialPhotos() // Only reload server photos, local photos don't depend on network
        }, 3000) // Give more time for network to stabilization
      }
    } catch (error: any) {
      console.log("[GalleryScreen] Failed to connect:", error)

      // Check if user cancelled vs other error
      // Error codes 'userDenied' or 'unableToConnect' mean user cancelled
      if (
        error?.code === "userDenied" ||
        error?.code === "unableToConnect" ||
        error?.message?.includes("cancel") ||
        error?.message?.includes("approval")
      ) {
        console.log("[GalleryScreen] User cancelled WiFi connection")
        transitionToState(GalleryState.USER_CANCELLED_WIFI)
      } else {
        // Other error
        setErrorMessage(error?.message || "Failed to connect to hotspot")
        transitionToState(GalleryState.ERROR)
      }
    }
  }

  // Retry connecting to hotspot
  const retryHotspotConnection = () => {
    if (hotspotSsid && hotspotPassword && hotspotGatewayIp) {
      transitionToState(GalleryState.WAITING_FOR_WIFI_PROMPT)
      connectToHotspot(hotspotSsid, hotspotPassword, hotspotGatewayIp)
    }
  }

  // Extract hotspot connection logic into reusable function
  const triggerHotspotConnection = (ssid: string, password: string, ip: string) => {
    console.log("[GalleryScreen] Triggering automatic hotspot connection for SSID:", ssid)

    // Automatically attempt connection without debug alert
    connectToHotspot(ssid, password, ip)
  }

  // STEP 2: Listen for gallery status and start hotspot if needed
  useEffect(() => {
    const handleGalleryStatus = (data: any) => {
      console.log("[GalleryScreen] Received GLASSES_GALLERY_STATUS event:", data)
      console.log("[GalleryScreen] Current gallery state:", galleryState)

      setGlassesGalleryStatus({
        photos: data.photos || 0,
        videos: data.videos || 0,
        total: data.total || 0,
        has_content: data.has_content || false,
      })

      // Handle state transitions based on gallery status
      if (!data.has_content) {
        console.log("[GalleryScreen] No content on glasses")
        setTotalServerCount(0)
        transitionToState(GalleryState.NO_MEDIA_ON_GLASSES)
        return
      }

      // We have content, check if we're already connected
      if (isGalleryReachable) {
        console.log("[GalleryScreen] Already connected to gallery")
        transitionToState(GalleryState.ALREADY_ON_SAME_WIFI)
        // Start loading photos
        loadInitialPhotos()
        return
      }

      // Check if phone is connected to glasses hotspot
      const phoneConnectedToHotspot = networkStatus.phoneSSID && hotspotSsid && networkStatus.phoneSSID === hotspotSsid

      if (phoneConnectedToHotspot) {
        console.log("[GalleryScreen] Already connected to hotspot")
        transitionToState(GalleryState.CONNECTED_LOADING)
        loadInitialPhotos()
        return
      }

      // We have content but not connected - need hotspot
      if (galleryState === GalleryState.QUERYING_GLASSES) {
        console.log("[GalleryScreen] Media available, requesting hotspot")
        transitionToState(GalleryState.MEDIA_AVAILABLE)
        // Will trigger hotspot request in next effect
      }
    }

    GlobalEventEmitter.addListener("GLASSES_GALLERY_STATUS", handleGalleryStatus)

    return () => {
      GlobalEventEmitter.removeListener("GLASSES_GALLERY_STATUS", handleGalleryStatus)
    }
  }, [galleryState, isGalleryReachable, networkStatus.phoneSSID, hotspotSsid])

  // Handle state transitions - request hotspot when media is available
  useEffect(() => {
    if (galleryState === GalleryState.MEDIA_AVAILABLE) {
      console.log("[GalleryScreen] Media available, requesting hotspot")
      handleRequestHotspot()
    }
  }, [galleryState])

  // STEP 3: Listen for hotspot ready and connect to it
  useEffect(() => {
    const handleHotspotStatusChange = (eventData: any) => {
      console.log("[GalleryScreen] Received GLASSES_HOTSPOT_STATUS_CHANGE event:", eventData)

      if (eventData.enabled && eventData.ssid && eventData.password && galleryOpenedHotspot) {
        console.log("[GalleryScreen] Hotspot enabled, attempting to connect phone to WiFi...")

        // Store hotspot info for SSID matching
        // Attempt to connect phone to hotspot WiFi
        connectToHotspot(eventData.ssid, eventData.password, eventData.local_ip)
      }
    }

    GlobalEventEmitter.addListener("GLASSES_HOTSPOT_STATUS_CHANGE", handleHotspotStatusChange)

    return () => {
      GlobalEventEmitter.removeListener("GLASSES_HOTSPOT_STATUS_CHANGE", handleHotspotStatusChange)
    }
  }, [galleryOpenedHotspot])

  // STEP 4: Monitor phone SSID - when it matches hotspot SSID, we're connected
  useEffect(() => {
    // Get phone's current SSID from network status
    const phoneSSID = networkStatus.phoneSSID

    // Check if phone is now connected to the glasses hotspot
    if (phoneSSID && hotspotSsid && phoneSSID === hotspotSsid && hotspotGatewayIp) {
      console.log("[GalleryScreen] Phone connected to glasses hotspot! SSID match confirmed")
      console.log("[GalleryScreen] Phone SSID:", phoneSSID, "Hotspot SSID:", hotspotSsid)

      // Transition to connected state
      transitionToState(GalleryState.CONNECTED_LOADING)

      // Update API server to use hotspot gateway IP
      asgCameraApi.setServer(hotspotGatewayIp, 8089)

      // Now that we're connected, load photos
      setTimeout(() => {
        console.log("[GalleryScreen] Loading photos via hotspot connection...")
        loadInitialPhotos()
      }, 1000) // Brief delay for network stabilization
    }
  }, [networkStatus.phoneSSID, hotspotSsid, hotspotGatewayIp])

  // Trigger sync when gallery server becomes reachable (any connection type)
  useEffect(() => {
    // Start sync automatically when server becomes reachable and we have photos to sync
    if (isGalleryReachable && galleryState === GalleryState.READY_TO_SYNC && serverPhotosToSync > 0) {
      console.log("[GalleryScreen] Gallery server now reachable, auto-starting sync...")
      setTimeout(() => {
        handleSync()
      }, 1000) // Brief delay to ensure connection is stable
    }
  }, [isGalleryReachable, galleryState, serverPhotosToSync])

  // Monitor sync completion to auto-close hotspot
  useEffect(() => {
    console.log(
      "[GalleryScreen] Sync completion monitor - galleryState:",
      galleryState,
      "galleryOpenedHotspot:",
      galleryOpenedHotspot,
      "isHotspotEnabled:",
      isHotspotEnabled,
    )

    // Watch for sync completion - close hotspot if we opened it
    if (galleryState === GalleryState.SYNC_COMPLETE && galleryOpenedHotspot && isHotspotEnabled) {
      console.log("[GalleryScreen] Sync completed, auto-closing gallery-initiated hotspot...")

      // Auto-close hotspot after sync completion
      const timeoutId = setTimeout(async () => {
        console.log("[GalleryScreen] Closing hotspot after sync completion")
        await handleStopHotspot()
        // No alert needed - user can see sync completed from UI
      }, 3000) // Wait 3 seconds after sync completion

      return () => clearTimeout(timeoutId)
    }
  }, [galleryState, galleryOpenedHotspot, isHotspotEnabled])

  // Remove this effect - hotspot is now started from gallery status event handler

  // Remove this effect - connection is now handled by hotspot status event

  // Auto-close hotspot when leaving gallery (only if gallery opened it)
  useEffect(() => {
    return () => {
      if (galleryOpenedHotspot && isHotspotEnabled) {
        console.log("[GalleryScreen] Gallery unmounting - auto-closing gallery-initiated hotspot")
        // Close hotspot immediately when leaving gallery
        coreCommunicator
          .sendCommand("set_hotspot_state", {enabled: false})
          .then(() => console.log("[GalleryScreen] Successfully closed hotspot on gallery exit"))
          .catch(error => console.error("[GalleryScreen] Failed to close hotspot on exit:", error))
      }
    }
  }, [])

  // Gallery item type for mixed content
  interface GalleryItem {
    id: string
    type: "server" | "local" | "placeholder"
    index: number
    photo?: PhotoInfo
    isOnServer?: boolean
  }

  // Combine photos with placeholders - fixed size list!
  const allPhotos = useMemo(() => {
    const items: GalleryItem[] = []

    // Create items for ALL server photos (loaded or placeholder)
    // Server photos maintain their order from the API (should be newest first)
    for (let i = 0; i < totalServerCount; i++) {
      const photo = loadedServerPhotos.get(i)
      items.push({
        id: `server-${i}`,
        type: photo ? "server" : "placeholder",
        index: i,
        photo: photo,
        isOnServer: true,
      })
    }

    // Get names of all loaded server photos for deduplication
    const serverPhotoNames = new Set<string>()
    loadedServerPhotos.forEach(photo => {
      serverPhotoNames.add(photo.name)
    })

    // Add downloaded-only photos at the end, sorted by newest first
    const downloadedOnly = downloadedPhotos.filter(p => !serverPhotoNames.has(p.name))

    // Sort downloaded photos by modified date (newest first)
    downloadedOnly.sort((a, b) => {
      const aTime = typeof a.modified === "string" ? new Date(a.modified).getTime() : a.modified
      const bTime = typeof b.modified === "string" ? new Date(b.modified).getTime() : b.modified
      return bTime - aTime
    })

    downloadedOnly.forEach((photo, i) => {
      items.push({
        id: `local-${photo.name}`,
        type: "local",
        index: totalServerCount + i,
        photo: photo,
        isOnServer: false,
      })
    })

    return items
  }, [totalServerCount, loadedServerPhotos, downloadedPhotos])

  // Viewability tracking for lazy loading
  const onViewableItemsChanged = useRef(({viewableItems}: {viewableItems: ViewToken[]}) => {
    // Get indices of placeholder items that are visible
    const placeholderIndices = viewableItems
      .filter(item => item.item && item.item.type === "placeholder")
      .map(item => item.item.index)

    if (placeholderIndices.length > 0) {
      // Add buffer of 5 items before and after
      const minIndex = Math.max(0, Math.min(...placeholderIndices) - 5)
      const maxIndex = Math.min(totalServerCount - 1, Math.max(...placeholderIndices) + 5)

      const indicesToLoad = []
      for (let i = minIndex; i <= maxIndex; i++) {
        indicesToLoad.push(i)
      }

      loadPhotosForIndices(indicesToLoad)
    }
  }).current

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 10,
    minimumViewTime: 100,
  }).current

  // Derive UI state from state machine
  const isLoadingServerPhotos =
    galleryState === GalleryState.CONNECTED_LOADING ||
    galleryState === GalleryState.INITIALIZING ||
    galleryState === GalleryState.QUERYING_GLASSES
  const isInitialLoad = galleryState === GalleryState.INITIALIZING || galleryState === GalleryState.QUERYING_GLASSES
  const isSyncing = galleryState === GalleryState.SYNCING
  const userCancelledWifi = galleryState === GalleryState.USER_CANCELLED_WIFI
  const error = galleryState === GalleryState.ERROR ? errorMessage : null

  // Count server photos for sync button - use total count, not just loaded photos
  const serverPhotosToSync = totalServerCount

  return (
    <View style={themed($screenContainer)}>
      {/* Removed top banners - moved to bottom status bar */}

      {/* Photo Grid */}
      <View style={themed($galleryContainer)}>
        {error ? (
          <View style={themed($errorContainer)}>
            <Text style={themed($errorText)}>{error}</Text>
          </View>
        ) : allPhotos.length === 0 && !isLoadingServerPhotos ? (
          <View style={themed($emptyContainer)}>
            <Text style={themed($emptyText)}>No photos</Text>
          </View>
        ) : (
          <FlatList
            data={allPhotos}
            numColumns={numColumns}
            key={numColumns} // Force re-render when columns change
            renderItem={({item}) => {
              if (item.photo) {
                // Render actual photo
                return (
                  <TouchableOpacity
                    style={[themed($photoItem), {width: itemWidth}]}
                    onPress={() => handlePhotoPress(item)}
                    onLongPress={() =>
                      item.isOnServer ? handleDeletePhoto(item.photo) : handleDeleteDownloadedPhoto(item.photo)
                    }>
                    <PhotoImage
                      photo={item.photo}
                      style={[themed($photoImage), {width: itemWidth, height: itemWidth * 0.8}]}
                    />
                    {item.isOnServer && (
                      <View style={themed($serverBadge)}>
                        <MaterialCommunityIcons name="glasses" size={14} color="white" />
                      </View>
                    )}
                    {item.photo.is_video && (
                      <View style={themed($videoIndicator)}>
                        <MaterialCommunityIcons name="video" size={14} color="white" />
                      </View>
                    )}
                  </TouchableOpacity>
                )
              } else {
                // Render skeleton placeholder
                return (
                  <View style={[themed($photoItem), {width: itemWidth}]}>
                    <ShimmerPlaceholder
                      shimmerColors={[theme.colors.border, theme.colors.background, theme.colors.border]}
                      shimmerStyle={{
                        width: itemWidth,
                        height: itemWidth * 0.8,
                        borderRadius: 8,
                      }}
                      duration={1500}
                    />
                  </View>
                )
              }
            }}
            keyExtractor={item => item.id}
            contentContainerStyle={[
              themed($photoGridContent),
              {
                paddingBottom:
                  galleryState === GalleryState.INITIALIZING ||
                  galleryState === GalleryState.QUERYING_GLASSES ||
                  galleryState === GalleryState.CONNECTED_LOADING ||
                  galleryState === GalleryState.USER_CANCELLED_WIFI ||
                  galleryState === GalleryState.WAITING_FOR_WIFI_PROMPT ||
                  galleryState === GalleryState.CONNECTING_TO_HOTSPOT ||
                  galleryState === GalleryState.REQUESTING_HOTSPOT ||
                  galleryState === GalleryState.SYNCING ||
                  galleryState === GalleryState.SYNC_COMPLETE ||
                  (galleryState === GalleryState.READY_TO_SYNC && !isGalleryReachable && serverPhotosToSync > 0)
                    ? 100
                    : spacing.lg,
              },
            ]} // Extra padding when sync button is shown
            columnWrapperStyle={numColumns > 1 ? themed($columnWrapper) : undefined}
            ItemSeparatorComponent={() => <View style={{height: spacing.lg}} />}
            // Performance optimizations
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={10}
            removeClippedSubviews={true}
            updateCellsBatchingPeriod={50}
            // Viewability for lazy loading
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
          />
        )}
      </View>

      {/* Unified Status Bar - Fixed at bottom */}
      {galleryState === GalleryState.INITIALIZING ||
      galleryState === GalleryState.QUERYING_GLASSES ||
      galleryState === GalleryState.CONNECTED_LOADING ||
      galleryState === GalleryState.USER_CANCELLED_WIFI ||
      galleryState === GalleryState.WAITING_FOR_WIFI_PROMPT ||
      galleryState === GalleryState.CONNECTING_TO_HOTSPOT ||
      galleryState === GalleryState.REQUESTING_HOTSPOT ||
      galleryState === GalleryState.SYNCING ||
      galleryState === GalleryState.SYNC_COMPLETE ||
      (galleryState === GalleryState.READY_TO_SYNC && !isGalleryReachable && serverPhotosToSync > 0) ? (
        <TouchableOpacity
          style={[
            themed($syncButtonFixed),
            galleryState === GalleryState.USER_CANCELLED_WIFI ? {} : themed($syncButtonFixedDisabled),
          ]}
          onPress={galleryState === GalleryState.USER_CANCELLED_WIFI ? retryHotspotConnection : undefined}
          activeOpacity={galleryState === GalleryState.USER_CANCELLED_WIFI ? 0.8 : 1}
          disabled={galleryState !== GalleryState.USER_CANCELLED_WIFI}>
          <View style={themed($syncButtonContent)}>
            {/* Initial loading states */}
            {galleryState === GalleryState.INITIALIZING || galleryState === GalleryState.QUERYING_GLASSES ? (
              <View style={themed($syncButtonRow)}>
                <ActivityIndicator size="small" color={theme.colors.textAlt} style={{marginRight: spacing.xs}} />
                <Text style={themed($syncButtonText)}>Checking for media...</Text>
              </View>
            ) : /* Requesting hotspot */
            galleryState === GalleryState.REQUESTING_HOTSPOT ? (
              <View style={themed($syncButtonRow)}>
                <ActivityIndicator size="small" color={theme.colors.textAlt} style={{marginRight: spacing.xs}} />
                <Text style={themed($syncButtonText)}>Starting hotspot...</Text>
              </View>
            ) : /* Waiting for WiFi prompt */
            galleryState === GalleryState.WAITING_FOR_WIFI_PROMPT ? (
              <View style={themed($syncButtonRow)}>
                <ActivityIndicator size="small" color={theme.colors.textAlt} style={{marginRight: spacing.xs}} />
                <Text style={themed($syncButtonText)}>Waiting for connection...</Text>
              </View>
            ) : /* Connecting to hotspot */
            galleryState === GalleryState.CONNECTING_TO_HOTSPOT ? (
              <View style={themed($syncButtonRow)}>
                <ActivityIndicator size="small" color={theme.colors.textAlt} style={{marginRight: spacing.xs}} />
                <Text style={themed($syncButtonText)}>Connecting to hotspot...</Text>
              </View>
            ) : /* Connected, loading photos */
            galleryState === GalleryState.CONNECTED_LOADING ? (
              <View style={themed($syncButtonRow)}>
                <ActivityIndicator size="small" color={theme.colors.textAlt} style={{marginRight: spacing.xs}} />
                <Text style={themed($syncButtonText)}>Loading photos...</Text>
              </View>
            ) : /* User cancelled WiFi - show retry */
            galleryState === GalleryState.USER_CANCELLED_WIFI && hotspotSsid && glassesGalleryStatus?.has_content ? (
              <View>
                <View style={themed($syncButtonRow)}>
                  <MaterialCommunityIcons
                    name="wifi-alert"
                    size={20}
                    color={theme.colors.textAlt}
                    style={{marginRight: spacing.xs}}
                  />
                  <Text style={themed($syncButtonText)}>Connect to sync {glassesGalleryStatus?.total || 0} items</Text>
                </View>
                <Text style={[themed($syncButtonSubtext), {marginTop: 4, textAlign: "center"}]}>
                  Tap to join "{hotspotSsid}" network
                </Text>
              </View>
            ) : /* Ready to sync but not connected */
            galleryState === GalleryState.READY_TO_SYNC && !isGalleryReachable && serverPhotosToSync > 0 ? (
              <View style={themed($syncButtonRow)}>
                <MaterialCommunityIcons
                  name="wifi-off"
                  size={20}
                  color={theme.colors.textAlt}
                  style={{marginRight: spacing.xs}}
                />
                <Text style={themed($syncButtonText)}>{getStatusMessage()}</Text>
              </View>
            ) : /* Actively syncing with progress */
            galleryState === GalleryState.SYNCING && syncProgress ? (
              <>
                <Text style={themed($syncButtonText)}>
                  Syncing {syncProgress.current}/{syncProgress.total} items...
                </Text>
                <View style={themed($syncButtonProgressBar)}>
                  <View
                    style={[
                      themed($syncButtonProgressFill),
                      {width: `${(syncProgress.current / syncProgress.total) * 100}%`},
                    ]}
                  />
                </View>
              </>
            ) : /* Syncing without progress */
            galleryState === GalleryState.SYNCING ? (
              <View style={themed($syncButtonRow)}>
                <ActivityIndicator size="small" color={theme.colors.textAlt} style={{marginRight: spacing.xs}} />
                <Text style={themed($syncButtonText)}>Syncing {serverPhotosToSync} items...</Text>
              </View>
            ) : /* Sync complete */
            galleryState === GalleryState.SYNC_COMPLETE ? (
              <View style={themed($syncButtonRow)}>
                <MaterialCommunityIcons
                  name="check-circle"
                  size={20}
                  color={theme.colors.success}
                  style={{marginRight: spacing.xs}}
                />
                <Text style={themed($syncButtonText)}>Sync complete!</Text>
              </View>
            ) : null}
          </View>
        </TouchableOpacity>
      ) : null}

      {/* Media Viewer */}
      <MediaViewer
        visible={!!selectedPhoto}
        photo={selectedPhoto}
        onClose={() => setSelectedPhoto(null)}
        onShare={() => selectedPhoto && handleSharePhoto(selectedPhoto)}
      />
    </View>
  )
}

const $screenContainer: ThemedStyle<ViewStyle> = ({colors}) => ({
  flex: 1,
  backgroundColor: colors.background,
})

const $screenContentContainer: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $headerContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  paddingTop: spacing.md,
  paddingBottom: spacing.sm,
  paddingHorizontal: spacing.md,
})

const $headerTitle: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 24,
  fontWeight: "bold",
  color: colors.text,
})

const $tabContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  justifyContent: "space-around",
  backgroundColor: "transparent",
  marginBottom: spacing.sm,
  paddingHorizontal: spacing.md,
  paddingTop: spacing.sm,
})

const $activeTab: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  paddingVertical: spacing.xs,
  paddingHorizontal: spacing.md,
  borderRadius: spacing.xs,
  backgroundColor: colors.palette.primary100,
})

const $inactiveTab: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  paddingVertical: spacing.xs,
  paddingHorizontal: spacing.md,
  borderRadius: spacing.xs,
  backgroundColor: colors.background,
})

const $activeTabText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 14,
  fontWeight: "600",
  color: colors.palette.primary500,
})

const $inactiveTabText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 14,
  color: colors.textDim,
})

const $actionButtonsContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  justifyContent: "center",
  marginBottom: spacing.sm,
  paddingHorizontal: spacing.md,
})

const $takePictureButton: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.palette.primary100,
  paddingVertical: spacing.xs,
  paddingHorizontal: spacing.md,
  borderRadius: spacing.xs,
  alignItems: "center",
  flex: 1,
  maxWidth: 200,
})

const $syncButton: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.palette.primary100,
  paddingVertical: spacing.xs,
  paddingHorizontal: spacing.md,
  borderRadius: spacing.xs,
  width: "45%",
  alignItems: "center",
})

const $syncButtonDisabled: ThemedStyle<ViewStyle> = ({colors}) => ({
  backgroundColor: colors.palette.neutral200,
  opacity: 0.7,
})

const $buttonText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 14,
  fontWeight: "600",
  color: colors.palette.primary500,
})

const $syncProgressContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  marginTop: spacing.md,
  marginBottom: spacing.md,
  paddingHorizontal: spacing.md,
})

const $syncProgressText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 14,
  color: colors.textDim,
  textAlign: "center",
})

const $syncProgressBar: ThemedStyle<ViewStyle> = ({colors}) => ({
  height: 8,
  backgroundColor: colors.palette.neutral200,
  borderRadius: 4,
  overflow: "hidden",
})

const $syncProgressFill: ThemedStyle<ViewStyle> = ({colors}) => ({
  height: "100%",
  backgroundColor: colors.palette.primary500,
  borderRadius: 4,
})

const $errorContainer: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.palette.angry100,
  padding: spacing.sm,
  borderRadius: spacing.xs,
  margin: spacing.lg,
  alignItems: "center",
})

const $errorText: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 14,
  color: colors.palette.angry500,
  textAlign: "center",
  marginBottom: spacing.sm,
})

const $photoGridContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  paddingHorizontal: spacing.lg,
  paddingTop: spacing.lg,
})

const $photoGridContent: ThemedStyle<ViewStyle> = ({spacing}) => ({
  paddingHorizontal: spacing.lg,
  paddingTop: spacing.lg,
})

const $columnWrapper: ThemedStyle<ViewStyle> = () => ({
  justifyContent: "space-between",
})

const $loadingContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
  padding: spacing.xl,
})

const $loadingText: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 16,
  color: colors.textDim,
  marginTop: spacing.sm,
})

const $emptyContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
  padding: spacing.xl,
})

const $emptyText: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 18,
  color: colors.text,
  marginBottom: spacing.xs,
})

// Removed - using FlatList now

const $photoItem: ThemedStyle<ViewStyle> = ({spacing}) => ({
  borderRadius: spacing.xs,
  overflow: "hidden",
  backgroundColor: "rgba(0,0,0,0.05)",
})

const $photoImage: ThemedStyle<ImageStyle> = ({spacing}) => ({
  width: "100%",
  borderRadius: 8,
})

const $videoIndicator: ThemedStyle<ViewStyle> = ({spacing}) => ({
  position: "absolute",
  top: spacing.xs,
  left: spacing.xs,
  backgroundColor: "rgba(0,0,0,0.7)",
  borderRadius: 12,
  paddingHorizontal: 6,
  paddingVertical: 3,
  shadowColor: "#000",
  shadowOffset: {
    width: 0,
    height: 1,
  },
  shadowOpacity: 0.3,
  shadowRadius: 2,
  elevation: 3,
})

// Modal styles
const $modalOverlay: ThemedStyle<ViewStyle> = ({colors}) => ({
  flex: 1,
  backgroundColor: "rgba(0, 0, 0, 0.9)",
  justifyContent: "center",
  alignItems: "center",
})

const $modalContent: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
  padding: spacing.lg,
})

const $modalImage: ThemedStyle<ImageStyle> = () => ({
  width: Dimensions.get("window").width - 40,
  height: Dimensions.get("window").height - 200,
  borderRadius: 8,
})

// New styles for the fixed sync button
const $galleryContainer: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

// Warning banner styles
const $warningBannerContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  paddingHorizontal: spacing.lg,
  paddingTop: spacing.md,
  paddingBottom: spacing.sm,
})

const $warningBanner: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.warningBackground,
  paddingVertical: spacing.sm,
  paddingHorizontal: spacing.md,
  flexDirection: "row",
  alignItems: "center",
  borderRadius: spacing.md,
  borderWidth: 2,
  borderColor: colors.border,
  minHeight: 68,
})

const $loadingBanner: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.background,
  paddingVertical: spacing.sm,
  paddingHorizontal: spacing.md,
  flexDirection: "row",
  alignItems: "center",
  borderRadius: spacing.md,
  borderWidth: 2,
  borderColor: colors.border,
  minHeight: 68, // Match the warning banner height
})

const $warningTextContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  marginLeft: spacing.sm,
})

const $warningTitle: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 14,
  fontWeight: "700", // Bold
  color: colors.text,
  marginBottom: 2,
})

const $warningMessage: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 13,
  color: colors.textDim,
})

const $loadingTitle: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 14,
  fontWeight: "600",
  color: colors.text,
  marginBottom: 2,
})

const $loadingMessage: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 13,
  color: colors.textDim,
})

const $infoButton: ThemedStyle<ViewStyle> = ({spacing}) => ({
  padding: spacing.xs,
  marginLeft: spacing.xs,
})

const $syncButtonFixed: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  position: "absolute",
  bottom: spacing.xl,
  left: spacing.lg,
  right: spacing.lg,
  backgroundColor: colors.buttonPrimary,
  borderRadius: 16,
  paddingVertical: spacing.md,
  paddingHorizontal: spacing.lg,
  shadowColor: "#000",
  shadowOffset: {
    width: 0,
    height: 2,
  },
  shadowOpacity: 0.15,
  shadowRadius: 3.84,
  elevation: 5,
})

const $syncButtonFixedDisabled: ThemedStyle<ViewStyle> = ({colors}) => ({
  backgroundColor: colors.palette.neutral400,
  opacity: 0.9,
})

const $syncButtonContent: ThemedStyle<ViewStyle> = ({spacing}) => ({
  alignItems: "center",
  justifyContent: "center",
})

const $syncButtonRow: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
})

const $syncButtonText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 16,
  fontWeight: "600",
  color: colors.textAlt,
  marginBottom: 2,
})

const $syncButtonSubtext: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 13,
  color: colors.textAlt,
  opacity: 0.9,
  marginBottom: spacing.xs,
})

const $syncButtonProgressBar: ThemedStyle<ViewStyle> = ({spacing}) => ({
  height: 4,
  backgroundColor: "rgba(255,255,255,0.2)",
  borderRadius: 2,
  overflow: "hidden",
  marginTop: spacing.xs,
  width: "100%",
})

const $syncButtonProgressFill: ThemedStyle<ViewStyle> = () => ({
  height: "100%",
  backgroundColor: "rgba(255,255,255,0.8)",
  borderRadius: 2,
})

// Server badge styles
const $serverBadge: ThemedStyle<ViewStyle> = ({spacing}) => ({
  position: "absolute",
  top: spacing.xs,
  right: spacing.xs,
  backgroundColor: "rgba(0,0,0,0.7)",
  borderRadius: 12,
  paddingHorizontal: 6,
  paddingVertical: 3,
  justifyContent: "center",
  alignItems: "center",
  shadowColor: "#000",
  shadowOffset: {
    width: 0,
    height: 1,
  },
  shadowOpacity: 0.3,
  shadowRadius: 2,
  elevation: 3,
})

const $loadingMoreContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  paddingVertical: spacing.md,
  paddingBottom: spacing.xl,
})

const $loadingMoreText: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 14,
  color: colors.textDim,
  marginLeft: spacing.sm,
})
