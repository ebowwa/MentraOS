import React, {useCallback, useState, useEffect} from "react"
import {View, Text, BackHandler, Image, TouchableOpacity, ActivityIndicator, Alert, Modal, Dimensions} from "react-native"
import {useLocalSearchParams, router, useFocusEffect} from "expo-router"
import {Screen, Header} from "@/components/ignite"
import {useAppTheme} from "@/utils/useAppTheme"
import {ThemedStyle} from "@/theme"
import {ViewStyle, TextStyle, ImageStyle, ScrollView} from "react-native"
import {useStatus} from "@/contexts/AugmentOSStatusProvider"
import RouteButton from "@/components/ui/RouteButton"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {asgCameraApi, type PhotoInfo} from "./asg_comms/AsgComms"

export default function GalleryScreen() {
  const {deviceModel = "Glasses"} = useLocalSearchParams()
  const {theme, themed} = useAppTheme()
  const {status} = useStatus()
  const {push, goBack} = useNavigationHistory()

  // Gallery state
  const [photos, setPhotos] = useState<PhotoInfo[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [selectedPhoto, setSelectedPhoto] = useState<string>()
  const [isModalVisible, setIsModalVisible] = useState(false)
  const [modalPhoto, setModalPhoto] = useState<PhotoInfo | null>(null)

  const handleGoBack = useCallback(() => {
    goBack()
    return true // Prevent default back behavior
  }, [goBack])

  // Handle Android back button
  useFocusEffect(
    useCallback(() => {
      const backHandler = BackHandler.addEventListener("hardwareBackPress", handleGoBack)
      return () => backHandler.remove()
    }, [handleGoBack]),
  )

  // Get glasses WiFi info for server connection
  const glassesWifiIp = status.glasses_info?.glasses_wifi_local_ip
  const isWifiConnected = status.glasses_info?.glasses_wifi_connected

  // Load gallery photos
  const loadGallery = useCallback(async () => {
    if (!glassesWifiIp || !isWifiConnected) {
      setError("Glasses not connected to WiFi")
      return
    }

    setIsLoading(true)
    setError(undefined)

    try {
      // Set the server URL to the glasses WiFi IP
      asgCameraApi.setServer(`http://${glassesWifiIp}:8089`)
      
      // Check if server is reachable
      const isReachable = await asgCameraApi.isServerReachable()
      if (!isReachable) {
        setError("Camera server not reachable")
        return
      }

      // Fetch gallery
      const photos = await asgCameraApi.getGalleryPhotos()
      setPhotos(photos)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load gallery")
    } finally {
      setIsLoading(false)
    }
  }, [glassesWifiIp, isWifiConnected])

  // Load gallery on mount and when WiFi status changes
  useEffect(() => {
    loadGallery()
  }, [loadGallery])

  // Handle photo selection
  const handlePhotoPress = async (photo: PhotoInfo) => {
    try {
      setModalPhoto(photo)
      setIsModalVisible(true)
    } catch (err) {
      Alert.alert("Error", "Failed to load photo")
    }
  }

  // Close modal
  const closeModal = () => {
    setIsModalVisible(false)
    setModalPhoto(null)
  }


  // Take a new picture
  const handleTakePicture = async () => {
    try {
      await asgCameraApi.takePicture()
      Alert.alert("Success", "Picture taken! Refreshing gallery...")
      // Wait a bit for the photo to be saved, then refresh
      setTimeout(loadGallery, 1000)
    } catch (err) {
      Alert.alert("Error", "Failed to take picture")
    }
  }

  return (
    <Screen preset="fixed" contentContainerStyle={themed($container)} safeAreaEdges={[]}>
      <Header title="Photo Gallery" leftIcon="caretLeft" onLeftPress={handleGoBack} />

      <ScrollView
        style={{marginBottom: 20, marginTop: 10, marginRight: -theme.spacing.md, paddingRight: theme.spacing.md}}>
        <View style={themed($content)}>
          
          {/* Connection Status */}
          <View style={themed($statusContainer)}>
            <Text style={themed($statusText)}>
              {isWifiConnected 
                ? `Connected to: ${glassesWifiIp || 'Unknown IP'}`
                : 'Glasses not connected to WiFi'
              }
            </Text>
          </View>

          {/* Take Picture Button */}
          {isWifiConnected && (
            <TouchableOpacity
              style={themed($takePictureButton)}
              onPress={handleTakePicture}
            >
              <Text style={themed($takePictureText)}>Take Picture</Text>
            </TouchableOpacity>
          )}

          {/* Loading State */}
          {isLoading && (
            <View style={themed($loadingContainer)}>
              <ActivityIndicator size="large" color={theme.colors.palette.primary500} />
              <Text style={themed($loadingText)}>Loading gallery...</Text>
            </View>
          )}

          {/* Error State */}
          {error && (
            <View style={themed($errorContainer)}>
              <Text style={themed($errorText)}>{error}</Text>
              <TouchableOpacity
                style={themed($retryButton)}
                onPress={loadGallery}
              >
                <Text style={themed($retryText)}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Gallery Grid */}
          {!isLoading && !error && photos && photos.length > 0 && (
            <View style={themed($galleryContainer)}>
              <Text style={themed($galleryTitle)}>Photos ({photos ? photos.length : 0})</Text>
              <View style={themed($galleryGrid)}>
                {photos && photos.map((photo, index) => (
                  <TouchableOpacity
                    key={index}
                    style={themed($photoContainer)}
                    onPress={() => handlePhotoPress(photo)}
                  >
                    <Image 
                      source={{uri: `${asgCameraApi.getServerUrl()}/api/photo?file=${encodeURIComponent(photo.name)}`}}
                      style={{width: "100%", height: 120, borderRadius: 8}}
                      resizeMode="cover"
                    />
                    <Text style={themed($photoName)} numberOfLines={1}>
                      {photo.name}
                    </Text>
                    <Text style={themed($photoSize)}>
                      {Math.round(photo.size / 1024)}KB
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Empty State */}
          {!isLoading && !error && photos && photos.length === 0 && (
            <View style={themed($emptyContainer)}>
              <Text style={themed($emptyText)}>No photos found</Text>
              <Text style={themed($emptySubtext)}>Take a picture to see it here</Text>
            </View>
          )}

        </View>
      </ScrollView>

      {/* Full Image Modal */}
      <Modal
        visible={isModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={closeModal}
      >
        <View style={themed($modalOverlay)}>
          <TouchableOpacity 
            style={themed($modalCloseButton)}
            onPress={closeModal}
          >
            <Text style={themed($modalCloseText)}>✕</Text>
          </TouchableOpacity>
          
          {modalPhoto && (
            <View style={themed($modalContent)}>
              <Image
                source={{uri: `${asgCameraApi.getServerUrl()}/api/download?file=${encodeURIComponent(modalPhoto.name)}`}}
                style={themed($modalImage)}
                resizeMode="contain"
              />
              <Text style={themed($modalPhotoName)}>{modalPhoto.name}</Text>
              <Text style={themed($modalPhotoSize)}>
                {Math.round(modalPhoto.size / 1024)}KB
              </Text>
            </View>
          )}
        </View>
      </Modal>
    </Screen>
  )
}

const $container: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $content: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  padding: spacing.lg,
  alignItems: "center",
})

const $statusContainer: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.background,
  padding: spacing.md,
  borderRadius: spacing.xs,
  marginBottom: spacing.xl,
  width: "100%",
  borderWidth: 1,
  borderColor: colors.border,
})

const $statusText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 14,
  color: colors.text,
  textAlign: "center",
})

const $takePictureButton: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.palette.primary100,
  padding: spacing.md,
  borderRadius: spacing.xs,
  marginBottom: spacing.lg,
  width: "100%",
  alignItems: "center",
})

const $takePictureText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 16,
  fontWeight: "600",
  color: colors.palette.primary500,
})

const $loadingContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  alignItems: "center",
  padding: spacing.xl,
})

const $loadingText: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 16,
  color: colors.textDim,
  marginTop: spacing.sm,
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

const $retryButton: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.palette.angry500,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.xs,
  borderRadius: spacing.xs,
})

const $retryText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 14,
  color: colors.background,
  fontWeight: "600",
})

const $galleryContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  width: "100%",
})

const $galleryTitle: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 18,
  fontWeight: "600",
  color: colors.text,
  marginBottom: spacing.md,
})

const $galleryGrid: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  justifyContent: "space-between",
})

const $photoContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  width: "48%",
  marginBottom: spacing.md,
  borderRadius: spacing.xs,
  overflow: "hidden",
})

const $photoImage: ThemedStyle<ViewStyle> = ({spacing}) => ({
  width: "100%",
  height: 120,
  borderRadius: 8,
})

const $photoName: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 12,
  color: colors.text,
  marginTop: spacing.xs,
  paddingHorizontal: spacing.xs,
})

const $photoSize: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 10,
  color: colors.textDim,
  paddingHorizontal: spacing.xs,
  marginBottom: spacing.xs,
})

const $emptyContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  alignItems: "center",
  padding: spacing.xl,
})

const $emptyText: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 18,
  color: colors.text,
  marginBottom: spacing.xs,
})

const $emptySubtext: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 14,
  color: colors.textDim,
  textAlign: "center",
})

// Modal styles
const $modalOverlay: ThemedStyle<ViewStyle> = ({colors}) => ({
  flex: 1,
  backgroundColor: 'rgba(0, 0, 0, 0.9)',
  justifyContent: 'center',
  alignItems: 'center',
})

const $modalCloseButton: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  position: 'absolute',
  top: 50,
  right: 20,
  zIndex: 1000,
  backgroundColor: 'rgba(0, 0, 0, 0.7)',
  borderRadius: 20,
  width: 40,
  height: 40,
  justifyContent: 'center',
  alignItems: 'center',
})

const $modalCloseText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 20,
  color: colors.background,
  fontWeight: 'bold',
})

const $modalContent: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  justifyContent: 'center',
  alignItems: 'center',
  padding: spacing.lg,
})

const $modalImage: ThemedStyle<ImageStyle> = () => ({
  width: Dimensions.get('window').width - 40,
  height: Dimensions.get('window').height - 200,
  borderRadius: 8,
})

const $modalPhotoName: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 16,
  color: colors.background,
  marginTop: spacing.md,
  textAlign: 'center',
})

const $modalPhotoSize: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 14,
  color: colors.textDim,
  marginTop: spacing.xs,
  textAlign: 'center',
})
