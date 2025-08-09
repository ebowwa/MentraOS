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
import {useStatus} from "@/contexts/AugmentOSStatusProvider"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {PhotoInfo} from "../../types"
import {asgCameraApi} from "../../services/asgCameraApi"
import {localStorageService} from "../../services/localStorageService"
import {PhotoImage} from "./PhotoImage"
import {GallerySkeleton} from "./GallerySkeleton"
import {MediaViewer} from "./MediaViewer"
import showAlert from "@/utils/AlertUtils"
import {translate} from "@/i18n"
import Share from "react-native-share"

interface GalleryScreenProps {
  deviceModel?: string
}

export function GalleryScreen({deviceModel = "ASG Glasses"}: GalleryScreenProps) {
  const {status} = useStatus()
  const {goBack} = useNavigationHistory()
  const {theme, themed} = useAppTheme()
  const insets = useSafeAreaInsets()

  // Responsive column calculation
  const screenWidth = Dimensions.get("window").width
  const MIN_ITEM_WIDTH = 150 // Minimum width for each photo

  // Calculate columns: 2 for phones, 3-4 for tablets
  const calculateColumns = () => {
    const availableWidth = screenWidth - spacing.md * 2
    const columns = Math.floor(availableWidth / MIN_ITEM_WIDTH)
    return Math.max(2, Math.min(columns, 4)) // Min 2, max 4 columns
  }

  const numColumns = calculateColumns()
  const itemWidth = (screenWidth - spacing.md * 2 - spacing.xs * (numColumns - 1)) / numColumns

  // Get glasses WiFi info for server connection
  const glassesWifiIp = status.glasses_info?.glasses_wifi_local_ip
  const isWifiConnected = status.glasses_info?.glasses_wifi_connected

  // State management
  const [serverPhotos, setServerPhotos] = useState<PhotoInfo[]>([])
  const [downloadedPhotos, setDownloadedPhotos] = useState<PhotoInfo[]>([])
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoInfo | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [syncProgress, setSyncProgress] = useState<{
    current: number
    total: number
    message: string
  } | null>(null)

  // Load photos from server
  const loadPhotos = useCallback(async () => {
    if (!isWifiConnected || !glassesWifiIp) {
      setError("Glasses not connected to WiFi")
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // Set the server URL to the glasses WiFi IP
      asgCameraApi.setServer(glassesWifiIp, 8089)
      console.log(`[GalleryScreen] Set server URL to: ${glassesWifiIp}:8089`)

      const photos = await asgCameraApi.getGalleryPhotos()
      setServerPhotos(photos)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load photos")
    } finally {
      setIsLoading(false)
    }
  }, [isWifiConnected, glassesWifiIp])

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
      showAlert("Error", "Glasses not connected to WiFi", [{text: translate("common:ok")}])
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

      // Get changed files from server
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

      // Save downloaded files metadata to local storage (files are already saved to filesystem)
      for (const photoInfo of downloadResult.downloaded) {
        const downloadedFile = localStorageService.convertToDownloadedFile(
          photoInfo,
          photoInfo.filePath, // File path from download
          photoInfo.thumbnailPath, // Thumbnail path if exists
        )
        await localStorageService.saveDownloadedFile(downloadedFile)
        console.log(`[GalleryScreen] Saved metadata for ${photoInfo.name}`)
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

      // Reload photos
      await Promise.all([loadPhotos(), loadDownloadedPhotos()])

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
      showAlert("Error", "Glasses not connected to WiFi", [{text: translate("common:ok")}])
      return
    }

    try {
      // Set the server URL to the glasses WiFi IP
      asgCameraApi.setServer(glassesWifiIp, 8089)

      await asgCameraApi.takePicture()
      showAlert("Success", "Picture taken successfully!", [{text: translate("common:ok")}])
      loadPhotos() // Reload photos
    } catch (err) {
      showAlert("Error", err instanceof Error ? err.message : "Failed to take picture", [
        {text: translate("common:ok")},
      ])
    }
  }

  // Handle photo selection
  const handlePhotoPress = (photo: PhotoInfo) => {
    setSelectedPhoto(photo)
  }

  // Handle photo sharing
  const handleSharePhoto = async (photo: PhotoInfo) => {
    try {
      if (!photo) {
        console.error("No photo provided to share")
        return
      }

      let shareUrl = ""

      console.log("Sharing photo:", {
        name: photo.name,
        url: photo.url,
        filePath: photo.filePath,
        mime_type: photo.mime_type,
        is_video: photo.is_video,
      })

      // For file:// URLs, share directly
      if (photo.url && photo.url.startsWith("file://")) {
        shareUrl = photo.url
      } else if (photo.filePath) {
        // If we have a local file path, use that
        shareUrl = photo.filePath.startsWith("file://") ? photo.filePath : `file://${photo.filePath}`
      } else {
        // For server photos, we need to download first
        showAlert("Info", "Please sync this photo first to share it", [{text: translate("common:ok")}])
        return
      }

      if (!shareUrl) {
        console.error("No valid share URL found")
        showAlert("Error", "Unable to share this photo", [{text: translate("common:ok")}])
        return
      }

      console.log("Final share URL:", shareUrl)

      // Use react-native-share for proper file sharing
      const shareOptions = {
        url: shareUrl,
        type: photo.mime_type || (photo.is_video ? "video/*" : "image/*"),
        failOnCancel: false, // Don't throw error on cancel
      }

      await Share.open(shareOptions)
    } catch (error) {
      // User cancelled share is not an error
      if (error.message === "User did not share" || error.message?.includes("cancel")) {
        return
      }
      console.error("Error sharing photo:", error)
      showAlert("Error", "Failed to share photo", [{text: translate("common:ok")}])
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
            loadPhotos() // Reload photos
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

  // Load data on mount and when dependencies change
  useEffect(() => {
    loadPhotos()
    loadDownloadedPhotos()
  }, [loadPhotos, loadDownloadedPhotos])

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
    // Navigation history is handled automatically by the context
  }, [])

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

  return (
    <View style={themed($screenContainer)}>
      {/* Photo Grid */}
      <View style={themed($galleryContainer)}>
        {error ? (
          <View style={themed($errorContainer)}>
            <Text style={themed($errorText)}>{error}</Text>
          </View>
        ) : isLoading ? (
          <View style={themed($photoGridContainer)}>
            <GallerySkeleton itemCount={numColumns * 4} numColumns={numColumns} itemWidth={itemWidth} />
          </View>
        ) : allPhotos.length === 0 ? (
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
                    <View style={themed($serverBadgeDot)} />
                  </View>
                )}
                {photo.is_video && (
                  <View style={themed($videoIndicator)}>
                    <Text style={themed($videoIndicatorText)}>▶</Text>
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
            ItemSeparatorComponent={() => <View style={{height: spacing.xs}} />}
          />
        )}
      </View>

      {/* Sync Button - Fixed at bottom, only show if there are server photos */}
      {serverPhotos.length > 0 && (
        <TouchableOpacity
          style={[themed($syncButtonFixed), isSyncing && themed($syncButtonFixedDisabled)]}
          onPress={handleSync}
          disabled={isSyncing}
          activeOpacity={0.8}>
          <View style={themed($syncButtonContent)}>
            {isSyncing && syncProgress ? (
              <>
                <Text style={themed($syncButtonText)}>
                  Syncing {syncProgress.total - syncProgress.current} Photo
                  {syncProgress.total - syncProgress.current !== 1 ? "s" : ""}...
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
                  Syncing {serverPhotos.length} Photo{serverPhotos.length !== 1 ? "s" : ""}...
                </Text>
              </View>
            ) : (
              <Text style={themed($syncButtonText)}>
                Sync {serverPhotos.length} Photo{serverPhotos.length !== 1 ? "s" : ""}
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
  margin: spacing.md,
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
  paddingHorizontal: spacing.md,
  paddingTop: spacing.xs,
})

const $photoGridContent: ThemedStyle<ViewStyle> = ({spacing}) => ({
  paddingHorizontal: spacing.md,
  paddingTop: spacing.xs,
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

const $videoIndicator: ThemedStyle<ViewStyle> = ({colors}) => ({
  position: "absolute",
  bottom: 0,
  right: 0,
  backgroundColor: "rgba(0,0,0,0.5)",
  borderRadius: 5,
  paddingHorizontal: 5,
  paddingVertical: 2,
})

const $videoIndicatorText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 12,
  color: colors.background,
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

const $syncButtonFixed: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  position: "absolute",
  bottom: spacing.xl,
  left: spacing.md,
  right: spacing.md,
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
  width: 12,
  height: 12,
  backgroundColor: "rgba(255,255,255,0.9)",
  borderRadius: 6,
  justifyContent: "center",
  alignItems: "center",
  shadowColor: "#000",
  shadowOffset: {
    width: 0,
    height: 1,
  },
  shadowOpacity: 0.2,
  shadowRadius: 1.41,
  elevation: 2,
})

const $serverBadgeDot: ThemedStyle<ViewStyle> = () => ({
  width: 8,
  height: 8,
  backgroundColor: "#FF3B30",
  borderRadius: 4,
})
