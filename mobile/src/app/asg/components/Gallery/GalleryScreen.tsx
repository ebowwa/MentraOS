/**
 * Main gallery screen component
 */

import React, {useCallback, useState, useEffect} from "react"
import {
  View,
  Text,
  BackHandler,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  Dimensions,
  ScrollView,
  FlatList,
} from "react-native"
import {useLocalSearchParams, useFocusEffect} from "expo-router"
import {Screen, Header} from "@/components/ignite"
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

interface GalleryScreenProps {
  deviceModel?: string
}

type TabType = "server" | "downloaded"

export function GalleryScreen({deviceModel = "ASG Glasses"}: GalleryScreenProps) {
  const {status} = useStatus()
  const {goBack} = useNavigationHistory()
  const {theme, themed} = useAppTheme()

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
  const [photos, setPhotos] = useState<PhotoInfo[]>([])
  const [downloadedPhotos, setDownloadedPhotos] = useState<PhotoInfo[]>([])
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoInfo | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabType>("server")
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

      const serverPhotos = await asgCameraApi.getGalleryPhotos()
      setPhotos(serverPhotos)
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
      Alert.alert("Error", "Glasses not connected to WiFi")
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
        Alert.alert("Sync Complete", "No new files to download")
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

      Alert.alert(
        "Sync Complete",
        `Successfully downloaded ${downloadResult.downloaded.length} files\nFailed: ${downloadResult.failed.length}`,
      )
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Sync failed"
      setError(errorMessage)
      Alert.alert("Sync Error", errorMessage)
    } finally {
      setIsSyncing(false)
      setSyncProgress(null)
    }
  }

  // Take picture
  const handleTakePicture = async () => {
    if (!isWifiConnected || !glassesWifiIp) {
      Alert.alert("Error", "Glasses not connected to WiFi")
      return
    }

    try {
      // Set the server URL to the glasses WiFi IP
      asgCameraApi.setServer(glassesWifiIp, 8089)

      await asgCameraApi.takePicture()
      Alert.alert("Success", "Picture taken successfully!")
      loadPhotos() // Reload photos
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to take picture")
    }
  }

  // Handle photo selection
  const handlePhotoPress = (photo: PhotoInfo) => {
    setSelectedPhoto(photo)
  }

  // Handle photo deletion
  const handleDeletePhoto = async (photo: PhotoInfo) => {
    if (!isWifiConnected || !glassesWifiIp) {
      Alert.alert("Error", "Glasses not connected to WiFi")
      return
    }

    Alert.alert("Delete Photo", `Are you sure you want to delete "${photo.name}"?`, [
      {text: "Cancel", style: "cancel"},
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await asgCameraApi.deleteFilesFromServer([photo.name])
            Alert.alert("Success", "Photo deleted successfully!")
            loadPhotos() // Reload photos
          } catch (err) {
            Alert.alert("Error", err instanceof Error ? err.message : "Failed to delete photo")
          }
        },
      },
    ])
  }

  // Handle downloaded photo deletion
  const handleDeleteDownloadedPhoto = async (photo: PhotoInfo) => {
    Alert.alert("Delete Downloaded Photo", `Are you sure you want to delete "${photo.name}" from local storage?`, [
      {text: "Cancel", style: "cancel"},
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await localStorageService.deleteDownloadedFile(photo.name)
            await loadDownloadedPhotos() // Reload downloaded photos
            Alert.alert("Success", "Photo deleted from local storage!")
          } catch (err) {
            Alert.alert("Error", "Failed to delete photo from local storage")
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

  const currentPhotos = activeTab === "server" ? photos : downloadedPhotos
  const isServerTab = activeTab === "server"

  return (
    <Screen preset="fixed" contentContainerStyle={themed($screenContentContainer)} safeAreaEdges={["top"]}>
      <Header
        title={`${deviceModel} Gallery`}
        titleStyle={themed($headerTitle)}
        containerStyle={themed($headerContainer)}
      />

      {/* Tab Navigation */}
      <View style={themed($tabContainer)}>
        <TouchableOpacity
          style={[activeTab === "server" ? themed($activeTab) : themed($inactiveTab)]}
          onPress={() => setActiveTab("server")}>
          <Text style={[activeTab === "server" ? themed($activeTabText) : themed($inactiveTabText)]}>
            On Server ({photos.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[activeTab === "downloaded" ? themed($activeTab) : themed($inactiveTab)]}
          onPress={() => setActiveTab("downloaded")}>
          <Text style={[activeTab === "downloaded" ? themed($activeTabText) : themed($inactiveTabText)]}>
            Downloaded ({downloadedPhotos.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Action Buttons */}
      <View style={themed($actionButtonsContainer)}>
        {isServerTab && (
          <TouchableOpacity style={themed($takePictureButton)} onPress={handleTakePicture}>
            <Text style={themed($buttonText)}>Take Picture</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[themed($syncButton), isSyncing && themed($syncButtonDisabled)]}
          onPress={handleSync}
          disabled={isSyncing}>
          {isSyncing ? (
            <ActivityIndicator size="small" color={theme.colors.background} />
          ) : (
            <Text style={themed($buttonText)}>Sync</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Sync Progress */}
      {syncProgress && (
        <View style={themed($syncProgressContainer)}>
          <Text style={themed($syncProgressText)}>
            {syncProgress.message} ({syncProgress.current}/{syncProgress.total})
          </Text>
          <View style={themed($syncProgressBar)}>
            <View
              style={[themed($syncProgressFill), {width: `${(syncProgress.current / syncProgress.total) * 100}%`}]}
            />
          </View>
        </View>
      )}

      {/* Error Display */}
      {error && (
        <View style={themed($errorContainer)}>
          <Text style={themed($errorText)}>{error}</Text>
        </View>
      )}

      {/* Photo Grid */}
      {isLoading ? (
        <View style={themed($photoGridContainer)}>
          <GallerySkeleton itemCount={numColumns * 4} numColumns={numColumns} itemWidth={itemWidth} />
        </View>
      ) : currentPhotos.length === 0 ? (
        <View style={themed($emptyContainer)}>
          <Text style={themed($emptyText)}>{isServerTab ? "No photos on server" : "No downloaded photos"}</Text>
        </View>
      ) : (
        <FlatList
          data={currentPhotos}
          numColumns={numColumns}
          key={numColumns} // Force re-render when columns change
          renderItem={({item: photo}) => (
            <TouchableOpacity
              style={[themed($photoItem), {width: itemWidth}]}
              onPress={() => handlePhotoPress(photo)}
              onLongPress={() => (isServerTab ? handleDeletePhoto(photo) : handleDeleteDownloadedPhoto(photo))}>
              <PhotoImage photo={photo} style={[themed($photoImage), {width: itemWidth, height: itemWidth * 0.8}]} />
              {photo.is_video && (
                <View style={themed($videoIndicator)}>
                  <Text style={themed($videoIndicatorText)}>▶</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
          keyExtractor={(item, index) => `${item.name}-${index}`}
          contentContainerStyle={themed($photoGridContent)}
          columnWrapperStyle={numColumns > 1 ? themed($columnWrapper) : undefined}
          ItemSeparatorComponent={() => <View style={{height: spacing.xs}} />}
        />
      )}

      {/* Photo Modal */}
      <Modal
        visible={!!selectedPhoto}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedPhoto(null)}>
        <View style={themed($modalOverlay)}>
          <TouchableOpacity style={themed($modalContent)} onPress={() => setSelectedPhoto(null)} activeOpacity={1}>
            {selectedPhoto && <PhotoImage photo={selectedPhoto} style={themed($modalImage)} />}
          </TouchableOpacity>
        </View>
      </Modal>
    </Screen>
  )
}

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
  marginBottom: spacing.md,
  paddingHorizontal: spacing.md,
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
  justifyContent: "space-around",
  marginBottom: spacing.md,
  paddingHorizontal: spacing.md,
})

const $takePictureButton: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.palette.primary100,
  paddingVertical: spacing.xs,
  paddingHorizontal: spacing.md,
  borderRadius: spacing.xs,
  width: "45%",
  alignItems: "center",
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
  padding: spacing.md,
  borderRadius: spacing.xs,
  marginBottom: spacing.lg,
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
  padding: spacing.md,
})

const $photoGridContent: ThemedStyle<ViewStyle> = ({spacing}) => ({
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
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
