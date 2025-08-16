/**
 * Main gallery screen component
 */

import React, {useCallback, useState, useEffect, useMemo} from "react"
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
//import {GallerySkeleton} from "./GallerySkeleton"
import {MediaViewer} from "./MediaViewer"
import showAlert from "@/utils/AlertUtils"
import {translate} from "@/i18n"
import {shareFile} from "@/utils/FileUtils"
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons"
import {useNetworkConnectivity} from "@/contexts/NetworkConnectivityProvider"

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

  // Get glasses WiFi info for server connection
  const glassesWifiIp = status.glasses_info?.glasses_wifi_local_ip
  const isWifiConnected = status.glasses_info?.glasses_wifi_connected

  // Network connectivity
  const {networkStatus, isGalleryReachable, shouldShowWarning, getStatusMessage, checkConnectivity} =
    useNetworkConnectivity()

  // State management
  const [serverPhotos, setServerPhotos] = useState<PhotoInfo[]>([])
  const [downloadedPhotos, setDownloadedPhotos] = useState<PhotoInfo[]>([])
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoInfo | null>(null)
  const [isLoadingServerPhotos, setIsLoadingServerPhotos] = useState(true) // Start as loading
  const [isInitialLoad, setIsInitialLoad] = useState(true) // Track if this is the first load
  const [isSyncing, setIsSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [syncProgress, setSyncProgress] = useState<{
    current: number
    total: number
    message: string
  } | null>(null)
  const [connectionCheckInterval, setConnectionCheckInterval] = useState<NodeJS.Timeout | null>(null)
  const [lastConnectionStatus, setLastConnectionStatus] = useState(false)

  // Pagination state
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMoreServerPhotos, setHasMoreServerPhotos] = useState(false)
  const [totalServerPhotos, setTotalServerPhotos] = useState(0)
  const PAGE_SIZE = 20 // Load 20 photos at a time

  // Load initial photos from server (first page)
  const loadPhotos = useCallback(
    async (loadMore = false) => {
      if (!isWifiConnected || !glassesWifiIp) {
        // Don't set error - just don't load server photos
        console.log("[GalleryScreen] Glasses not connected, skipping server photo load")
        setServerPhotos([])
        setIsLoadingServerPhotos(false)
        setIsInitialLoad(false)
        setHasMoreServerPhotos(false)
        return
      }

      // If loading more, set loading more state; otherwise set initial loading state
      if (loadMore) {
        setIsLoadingMore(true)
      } else {
        setIsLoadingServerPhotos(true)
        setError(null)
      }

      try {
        // Set the server URL to the glasses WiFi IP
        asgCameraApi.setServer(glassesWifiIp, 8089)
        console.log(`[GalleryScreen] Set server URL to: ${glassesWifiIp}:8089`)

        // Calculate offset based on current photos if loading more
        const offset = loadMore ? serverPhotos.length : 0

        const result = await asgCameraApi.getGalleryPhotos(PAGE_SIZE, offset)

        if (loadMore) {
          // Append to existing photos
          setServerPhotos(prev => [...prev, ...result.photos])
        } else {
          // Replace photos (initial load or refresh)
          setServerPhotos(result.photos)
        }

        setHasMoreServerPhotos(result.hasMore)
        setTotalServerPhotos(result.totalCount)
        setError(null) // Clear any previous errors on success
      } catch (err) {
        // Don't show error in main area - warning banner will handle it
        console.error("[GalleryScreen] Failed to load server photos:", err)
        if (!loadMore) {
          setServerPhotos([])
        }
      } finally {
        setIsLoadingServerPhotos(false)
        setIsInitialLoad(false)
        setIsLoadingMore(false)
      }
    },
    [isWifiConnected, glassesWifiIp], // Removed serverPhotos from dependencies to prevent infinite loop
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

      // Download files in batches
      const downloadResult = await asgCameraApi.batchSyncFiles(syncData.changed_files, true)

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

      // Reload photos (fresh load, not append)
      await Promise.all([loadPhotos(false), loadDownloadedPhotos()])

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
      loadPhotos(false) // Reload photos
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
  const handlePhotoPress = (photo: PhotoInfo & {isOnServer?: boolean}) => {
    // Check if it's a video that's still on the glasses (not synced)
    if (photo.is_video && photo.isOnServer) {
      showAlert("Video Not Downloaded", "Please sync this video to your device to watch it", [
        {text: translate("common:ok")},
      ])
      return
    }
    setSelectedPhoto(photo)
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
            loadPhotos(false) // Reload photos
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

  // Load data on mount and when connection changes
  useEffect(() => {
    // Check connectivity immediately on mount
    checkConnectivity().then(() => {
      console.log("[GalleryScreen] Initial connectivity check complete")
    })
    loadPhotos(false)
    loadDownloadedPhotos()
  }, [isWifiConnected, glassesWifiIp]) // Only reload when connection status changes

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

        // If connection is restored, reload photos
        if (status.galleryReachable && !lastConnectionStatus) {
          console.log("[GalleryScreen] Connection restored! Reloading photos...")
          loadPhotos(false)
          loadDownloadedPhotos()
          setLastConnectionStatus(true)
        } else if (!status.galleryReachable) {
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

  // Combine photos: server photos first, then downloaded photos, both sorted newest first
  const allPhotos = useMemo(() => {
    const serverPhotoMap = new Map(serverPhotos.map(p => [p.name, {...p, isOnServer: true}]))
    const downloadedPhotoMap = new Map(downloadedPhotos.map(p => [p.name, {...p, isOnServer: false}]))

    // Collect server photos and downloaded-only photos
    const serverPhotosList: (PhotoInfo & {isOnServer: boolean})[] = []
    const downloadedOnlyList: (PhotoInfo & {isOnServer: boolean})[] = []

    // Add server photos
    serverPhotoMap.forEach(photo => {
      serverPhotosList.push(photo)
    })

    // Add downloaded photos that aren't on server
    downloadedPhotoMap.forEach((photo, name) => {
      if (!serverPhotoMap.has(name)) {
        downloadedOnlyList.push(photo)
      }
    })

    // Sort both lists by modified date (newest first)
    // Convert modified string to timestamp for proper sorting
    serverPhotosList.sort((a, b) => {
      const aTime = typeof a.modified === "string" ? new Date(a.modified).getTime() : a.modified
      const bTime = typeof b.modified === "string" ? new Date(b.modified).getTime() : b.modified
      return bTime - aTime
    })
    downloadedOnlyList.sort((a, b) => {
      const aTime = typeof a.modified === "string" ? new Date(a.modified).getTime() : a.modified
      const bTime = typeof b.modified === "string" ? new Date(b.modified).getTime() : b.modified
      return bTime - aTime
    })

    // Combine: server photos first (newest to oldest), then downloaded photos (newest to oldest)
    return [...serverPhotosList, ...downloadedOnlyList]
  }, [serverPhotos, downloadedPhotos])

  // Determine content type for sync button text
  const syncContentType = useMemo(() => {
    const hasVideos = serverPhotos.some(p => p.is_video)
    const hasPhotos = serverPhotos.some(p => !p.is_video)

    if (hasVideos && hasPhotos) {
      return "Photos & Videos"
    } else if (hasVideos) {
      return totalServerPhotos === 1 ? "Video" : "Videos"
    } else {
      return totalServerPhotos === 1 ? "Photo" : "Photos"
    }
  }, [serverPhotos, totalServerPhotos])

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
            renderItem={({item: photo}) => (
              <TouchableOpacity
                style={[themed($photoItem), {width: itemWidth}]}
                onPress={() => handlePhotoPress(photo)}
                onLongPress={() =>
                  "isOnServer" in photo && photo.isOnServer
                    ? handleDeletePhoto(photo)
                    : handleDeleteDownloadedPhoto(photo)
                }>
                <PhotoImage photo={photo} style={[themed($photoImage), {width: itemWidth, height: itemWidth * 0.8}]} />
                {"isOnServer" in photo && photo.isOnServer && (
                  <View style={themed($serverBadge)}>
                    <MaterialCommunityIcons name="glasses" size={14} color="white" />
                  </View>
                )}
                {photo.is_video && (
                  <View style={themed($videoIndicator)}>
                    <MaterialCommunityIcons name="video" size={14} color="white" />
                  </View>
                )}
              </TouchableOpacity>
            )}
            keyExtractor={(item, index) => `${item.name}-${index}`}
            contentContainerStyle={[
              themed($photoGridContent),
              {paddingBottom: serverPhotos.length > 0 ? 100 : spacing.lg},
            ]} // Extra padding when sync button is shown
            columnWrapperStyle={numColumns > 1 ? themed($columnWrapper) : undefined}
            ItemSeparatorComponent={() => <View style={{height: spacing.lg}} />}
            // Performance optimizations
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={10}
            removeClippedSubviews={true}
            updateCellsBatchingPeriod={50}
            // Pagination for server photos
            onEndReached={() => {
              // Only load more if we have server photos, more to load, and not already loading
              if (hasMoreServerPhotos && !isLoadingMore && isWifiConnected) {
                console.log("[GalleryScreen] Loading more server photos...")
                loadPhotos(true)
              }
            }}
            onEndReachedThreshold={0.5}
            ListFooterComponent={() => {
              if (isLoadingMore) {
                return (
                  <View style={themed($loadingMoreContainer)}>
                    <ActivityIndicator size="small" color={theme.colors.text} />
                    <Text style={themed($loadingMoreText)}>Loading more photos...</Text>
                  </View>
                )
              }
              return null
            }}
          />
        )}
      </View>

      {/* Sync Button - Fixed at bottom, only show if there are server photos */}
      {totalServerPhotos > 0 && (
        <TouchableOpacity
          style={[themed($syncButtonFixed), isSyncing && themed($syncButtonFixedDisabled)]}
          onPress={handleSync}
          disabled={isSyncing}
          activeOpacity={0.8}>
          <View style={themed($syncButtonContent)}>
            {isSyncing && syncProgress ? (
              <>
                <Text style={themed($syncButtonText)}>
                  Syncing {syncProgress.total - syncProgress.current} {syncContentType}...
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
            ) : isSyncing ? (
              <View style={themed($syncButtonRow)}>
                <ActivityIndicator size="small" color={theme.colors.textAlt} style={{marginRight: spacing.xs}} />
                <Text style={themed($syncButtonText)}>
                  Syncing {totalServerPhotos} {syncContentType}...
                </Text>
              </View>
            ) : (
              <Text style={themed($syncButtonText)}>
                Sync {totalServerPhotos} {syncContentType}
              </Text>
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
