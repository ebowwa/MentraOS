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
      hotspotIp: glassesInfo?.glasses_hotspot_ip,
    }
  }, [
    status.glasses_info?.glasses_wifi_local_ip,
    status.glasses_info?.glasses_wifi_connected,
    status.glasses_info?.glasses_hotspot_enabled,
    status.glasses_info?.glasses_hotspot_ssid,
    status.glasses_info?.glasses_hotspot_password,
    status.glasses_info?.glasses_hotspot_ip,
  ])

  // Extract values from memoized object
  const {glassesWifiIp, isWifiConnected, isHotspotEnabled, hotspotSsid, hotspotPassword, hotspotIp} = connectionInfo

  // DEBUG: Log hotspot status changes
  useEffect(() => {
    console.log("[GalleryScreen] HOTSPOT DEBUG:", {
      isHotspotEnabled,
      hotspotSsid,
      hotspotPassword,
      hotspotIp,
      glassesInfo: status.glasses_info,
    })
  }, [
    connectionInfo.isHotspotEnabled,
    connectionInfo.hotspotSsid,
    connectionInfo.hotspotPassword,
    connectionInfo.hotspotIp,
  ])

  // Network connectivity
  const {networkStatus, isGalleryReachable, shouldShowWarning, getStatusMessage, checkConnectivity} =
    useNetworkConnectivity()

  // State management - using Map for O(1) lookups
  const [totalServerCount, setTotalServerCount] = useState(0)
  const [loadedServerPhotos, setLoadedServerPhotos] = useState<Map<number, PhotoInfo>>(new Map())
  const [downloadedPhotos, setDownloadedPhotos] = useState<PhotoInfo[]>([])
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoInfo | null>(null)
  const [isLoadingServerPhotos, setIsLoadingServerPhotos] = useState(true)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [syncProgress, setSyncProgress] = useState<{
    current: number
    total: number
    message: string
  } | null>(null)
  const [connectionCheckInterval, setConnectionCheckInterval] = useState<NodeJS.Timeout | null>(null)
  const [lastConnectionStatus, setLastConnectionStatus] = useState(false)
  const [isRequestingHotspot, setIsRequestingHotspot] = useState(false)
  const [galleryOpenedHotspot, setGalleryOpenedHotspot] = useState(false)

  // Track loaded ranges to avoid duplicate requests
  const loadedRanges = useRef<Set<string>>(new Set())
  const loadingRanges = useRef<Set<string>>(new Set())
  const PAGE_SIZE = 20

  // Initial load - get total count and first batch
  const loadInitialPhotos = useCallback(async () => {
    // Check if we have either WiFi connection or hotspot connection
    const serverIp = hotspotIp || glassesWifiIp
    const hasConnection = (isWifiConnected && glassesWifiIp) || (isHotspotEnabled && hotspotIp)

    if (!hasConnection || !serverIp) {
      console.log("[GalleryScreen] Glasses not connected (WiFi or hotspot)")
      // Only update states if they're different to prevent unnecessary re-renders
      if (totalServerCount !== 0) setTotalServerCount(0)
      if (isLoadingServerPhotos) setIsLoadingServerPhotos(false)
      if (isInitialLoad) setIsInitialLoad(false)
      return
    }

    setIsLoadingServerPhotos(true)
    setError(null)

    try {
      asgCameraApi.setServer(serverIp, 8089)

      // Get first page to know total count
      const result = await asgCameraApi.getGalleryPhotos(PAGE_SIZE, 0)

      setTotalServerCount(result.totalCount)

      // Store loaded photos in map
      const newMap = new Map<number, PhotoInfo>()
      result.photos.forEach((photo, index) => {
        newMap.set(index, photo)
      })
      setLoadedServerPhotos(newMap)

      // Mark this range as loaded
      loadedRanges.current.add("0-19")
    } catch (err) {
      console.error("[GalleryScreen] Failed to load initial photos:", err)
      setTotalServerCount(0)
    } finally {
      setIsLoadingServerPhotos(false)
      setIsInitialLoad(false)
    }
  }, [connectionInfo])

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
        asgCameraApi.setServer(glassesWifiIp, 8089)

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
    if (!isWifiConnected || !glassesWifiIp) {
      showAlert(
        "Cannot Sync",
        "Your glasses are not connected to WiFi. Please connect them to the same network as your phone.",
        [{text: translate("common:ok")}],
      )
      return
    }

    setIsSyncing(true)
    setError(null)
    setSyncProgress(null)

    try {
      console.log(`[GalleryScreen] Starting sync process...`)

      // Set the server URL to the glasses WiFi IP
      asgCameraApi.setServer(glassesWifiIp, 8089)
      console.log(`[GalleryScreen] Set server URL to: ${glassesWifiIp}:8089`)

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

      // showAlert(
      //   "Sync Complete",
      //   `Successfully downloaded ${downloadResult.downloaded.length} files\nFailed: ${downloadResult.failed.length}`,
      //   [{text: translate("common:ok")}]
      // )
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Sync failed"
      setError(errorMessage)
      showAlert("Sync Error", errorMessage, [{text: translate("common:ok")}])
    } finally {
      setIsSyncing(false)
      setSyncProgress(null)
    }
  }

  // Take picture
  const handleTakePicture = async () => {
    if (!isWifiConnected || !glassesWifiIp) {
      showAlert(
        "Cannot Take Picture",
        "Your glasses are not connected to WiFi. Please connect them to the same network as your phone.",
        [{text: translate("common:ok")}],
      )
      return
    }

    try {
      // Set the server URL to the glasses WiFi IP
      asgCameraApi.setServer(glassesWifiIp, 8089)

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
    setIsRequestingHotspot(true)
    try {
      // Send hotspot command using existing CoreCommunicator
      await coreCommunicator.sendCommand("set_hotspot_state", {enabled: true})

      // Track that gallery opened this hotspot for lifecycle management
      setGalleryOpenedHotspot(true)
      console.log("[GalleryScreen] Gallery initiated hotspot - will auto-close when appropriate")

      // Status will automatically update via existing polling - no special handling needed!
    } catch (error) {
      console.error("[GalleryScreen] Failed to start hotspot:", error)
      showAlert("Error", "Failed to start hotspot", [{text: "OK"}])
    } finally {
      setIsRequestingHotspot(false)
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
    if (!isWifiConnected || !glassesWifiIp) {
      showAlert("Error", "Glasses not connected to WiFi", [{text: translate("common:ok")}])
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

  // Load data on mount
  useEffect(() => {
    console.log("[GalleryScreen] Component mounted, loading all photos")
    checkConnectivity().then(() => {
      console.log("[GalleryScreen] Initial connectivity check complete")
    })
    loadInitialPhotos()
    loadDownloadedPhotos() // Load local photos only on mount
  }, []) // Only run on mount

  // Reload ONLY server photos when connection changes
  useEffect(() => {
    // Skip on initial mount (handled above)
    if (isInitialLoad) return

    console.log("[GalleryScreen] Connection changed, reloading server photos only")
    loadInitialPhotos() // Only server photos, not local
  }, [
    connectionInfo.isWifiConnected,
    connectionInfo.glassesWifiIp,
    connectionInfo.isHotspotEnabled,
    connectionInfo.hotspotIp,
    isInitialLoad,
  ])

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

  // Add to navigation history
  useEffect(() => {
    // Cleanup any interval on unmount
    return () => {
      if (connectionCheckInterval) {
        console.log("[GalleryScreen] Component unmounting, clearing interval")
        clearInterval(connectionCheckInterval)
      }
    }
  }, [connectionCheckInterval])

  // Auto-refresh connection check every 5 seconds if not connected
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null

    // Only set up auto-refresh if gallery is not reachable
    if (!isGalleryReachable) {
      console.log("[GalleryScreen] Starting auto-refresh timer for connection check")

      interval = setInterval(async () => {
        console.log("[GalleryScreen] Auto-checking connectivity...")
        const status = await checkConnectivity()

        // Just update connection status - photos will reload via connection useEffect
        if (status.galleryReachable && !lastConnectionStatus) {
          console.log("[GalleryScreen] Connection restored! (Photos will reload via connection effect)")
          setLastConnectionStatus(true)
          // Don't call loadInitialPhotos() here - let the connection useEffect handle it
        } else if (!status.galleryReachable && lastConnectionStatus) {
          console.log("[GalleryScreen] Connection lost!")
          setLastConnectionStatus(false)
        }
      }, 5000) // Check every 5 seconds
    } else {
      // Update connection status when gallery becomes reachable
      if (!lastConnectionStatus) {
        setLastConnectionStatus(true)
      }
    }

    // Cleanup interval on unmount
    return () => {
      if (interval) {
        console.log("[GalleryScreen] Cleaning up connection check interval")
        clearInterval(interval)
      }
    }
  }, [isGalleryReachable, lastConnectionStatus]) // Only depend on connection states, not functions

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
        // Reload gallery after connection - only server photos need reloading
        setTimeout(() => {
          loadInitialPhotos() // Only reload server photos, local photos don't depend on network
        }, 3000) // Give more time for network to stabilize
      }
    } catch (error) {
      console.log("[GalleryScreen] Failed to connect automatically:", error)
    }
  }

  // Extract hotspot connection logic into reusable function
  const triggerHotspotConnection = (ssid: string, password: string, ip: string) => {
    console.log("[GalleryScreen] Triggering hotspot connection for SSID:", ssid)

    // DEBUG: Show alert when hotspot status changes to verify the flow is working
    showAlert(
      "DEBUG: Hotspot Status Update",
      `Hotspot is now ready! 
      
SSID: ${ssid}
Password: ${password}
IP: ${ip}

About to attempt automatic WiFi connection...`,
      [
        {text: "Try Auto Connect", onPress: () => connectToHotspot(ssid, password, ip)},
        {text: "Manual Only", onPress: () => showManualAlert(ssid, password)},
        {text: "Cancel"},
      ],
    )

    // Automatically attempt connection
    connectToHotspot(ssid, password, ip)
  }

  // Listen for immediate hotspot status changes via GlobalEventEmitter
  useEffect(() => {
    const handleHotspotStatusChange = (eventData: any) => {
      console.log("[GalleryScreen] Received GLASSES_HOTSPOT_STATUS_CHANGE event:", eventData)

      if (eventData.enabled && eventData.ssid && eventData.password) {
        console.log("[GalleryScreen] Hotspot enabled via event, triggering network suggestion...")

        // Trigger network suggestion/connection immediately
        triggerHotspotConnection(eventData.ssid, eventData.password, eventData.local_ip)
      }
    }

    GlobalEventEmitter.addListener("GLASSES_HOTSPOT_STATUS_CHANGE", handleHotspotStatusChange)

    return () => {
      GlobalEventEmitter.removeListener("GLASSES_HOTSPOT_STATUS_CHANGE", handleHotspotStatusChange)
    }
  }, [])

  // Handle hotspot status changes - automatically connect to WiFi
  useEffect(() => {
    if (isHotspotEnabled && hotspotSsid && hotspotPassword) {
      console.log("[GalleryScreen] Hotspot is ready via status object, attempting automatic WiFi connection...")

      triggerHotspotConnection(hotspotSsid, hotspotPassword, hotspotIp)
    }
  }, [
    connectionInfo.isHotspotEnabled,
    connectionInfo.hotspotSsid,
    connectionInfo.hotspotPassword,
    connectionInfo.hotspotIp,
  ])

  // Trigger sync when gallery server becomes reachable (any connection type)
  useEffect(() => {
    // Start sync automatically when server becomes reachable and we have photos to sync
    if (isGalleryReachable && !isSyncing && serverPhotosToSync > 0 && !isInitialLoad) {
      console.log("[GalleryScreen] Gallery server now reachable, auto-starting sync...")
      setTimeout(() => {
        handleSync()
      }, 1000) // Brief delay to ensure connection is stable
    }
  }, [isGalleryReachable, isSyncing, serverPhotosToSync, isInitialLoad])

  // Monitor sync completion to auto-close hotspot
  useEffect(() => {
    // Watch for sync completion - when isSyncing goes from true to false
    if (!isSyncing && galleryOpenedHotspot && isHotspotEnabled) {
      console.log("[GalleryScreen] Sync completed, auto-closing gallery-initiated hotspot...")

      // Auto-close hotspot after sync completion
      const timeoutId = setTimeout(async () => {
        console.log("[GalleryScreen] Closing hotspot after sync completion")
        await handleStopHotspot()

        showAlert("Hotspot Closed", "Gallery sync complete. Hotspot has been closed.", [{text: "OK"}])
      }, 3000) // Wait 3 seconds after sync completion

      return () => clearTimeout(timeoutId)
    }
  }, [isSyncing, galleryOpenedHotspot, isHotspotEnabled])

  // Automatically start hotspot when gallery is not reachable
  useEffect(() => {
    // Automatically start hotspot if:
    // 1. Gallery is not reachable
    // 2. Hotspot is not already enabled
    // 3. We've completed the initial connectivity check
    // 4. We're not currently requesting hotspot
    if (!isGalleryReachable && !isHotspotEnabled && !isInitialLoad && !isRequestingHotspot) {
      console.log("[GalleryScreen] Gallery not reachable, automatically starting hotspot...")
      const timeoutId = setTimeout(() => {
        handleRequestHotspot()
      }, 2000) // Wait 2 seconds to allow connection check to complete

      return () => clearTimeout(timeoutId)
    }
  }, [isGalleryReachable, connectionInfo.isHotspotEnabled, isInitialLoad, isRequestingHotspot])

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

  // Count server photos for sync button - use total count, not just loaded photos
  const serverPhotosToSync = totalServerCount

  return (
    <View style={themed($screenContainer)}>
      {/* Network Status Banner - Loading or Warning */}
      {isLoadingServerPhotos && isInitialLoad ? (
        // Show loading indicator during initial connection check
        <View style={themed($warningBannerContainer)}>
          <View style={themed($loadingBanner)}>
            <ActivityIndicator size="small" color={theme.colors.text} style={{marginRight: spacing.sm}} />
            <View style={themed($warningTextContainer)}>
              <Text style={themed($loadingTitle)}>Checking glasses connection...</Text>
            </View>
          </View>
        </View>
      ) : !isGalleryReachable ? (
        // Show warning banner after connection check fails
        <View style={themed($warningBannerContainer)}>
          <View style={themed($warningBanner)}>
            <MaterialCommunityIcons name="wifi-off" size={20} color={theme.colors.text} />
            <View style={themed($warningTextContainer)}>
              <Text style={themed($warningTitle)}>{getStatusMessage()}</Text>
              <Text style={themed($warningMessage)}>Showing synced photos only</Text>
            </View>
            <TouchableOpacity
              style={themed($infoButton)}
              hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
              onPress={() => {
                showAlert(
                  "Gallery Sync",
                  "To sync new photos from your glasses:\n\n• Connect both devices to the same WiFi network\n• Or connect glasses to your phone's hotspot\n\nThe gallery will automatically refresh when connected.",
                  [{text: translate("common:ok")}],
                )
              }}>
              <MaterialCommunityIcons name="information-outline" size={22} color={theme.colors.textDim} />
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

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
              {paddingBottom: serverPhotosToSync > 0 ? 100 : spacing.lg},
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

      {/* Sync Button - Fixed at bottom, only show if there are server photos */}
      {serverPhotosToSync > 0 && (
        <TouchableOpacity
          style={[themed($syncButtonFixed), isSyncing && themed($syncButtonFixedDisabled)]}
          onPress={handleSync}
          disabled={isSyncing}
          activeOpacity={0.8}>
          <View style={themed($syncButtonContent)}>
            {isSyncing && syncProgress ? (
              <>
                <Text style={themed($syncButtonText)}>
                  Syncing {syncProgress.current}/{syncProgress.total} items...
                </Text>
                {/* <Text style={themed($syncButtonSubtext)} numberOfLines={1}>
                  {syncProgress.message}
                </Text> */}
                <View style={themed($syncButtonProgressBar)}>
                  <View
                    style={[
                      themed($syncButtonProgressFill),
                      {width: `${(syncProgress.current / syncProgress.total) * 100}%`},
                    ]}
                  />
                </View>
              </>
            ) : isSyncing ? (
              <View style={themed($syncButtonRow)}>
                <ActivityIndicator size="small" color={theme.colors.textAlt} style={{marginRight: spacing.xs}} />
                <Text style={themed($syncButtonText)}>Syncing {serverPhotosToSync} items...</Text>
              </View>
            ) : (
              <Text style={themed($syncButtonText)}>Sync {serverPhotosToSync} items from glasses</Text>
            )}
          </View>
        </TouchableOpacity>
      )}

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
