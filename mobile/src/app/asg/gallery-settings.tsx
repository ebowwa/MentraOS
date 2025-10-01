import {useState, useEffect} from "react"
import {View, ViewStyle, TextStyle, ScrollView} from "react-native"
import {Header, Screen, Text} from "@/components/ignite"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {useAppTheme} from "@/utils/useAppTheme"
import {ThemedStyle} from "@/theme"
import ToggleSetting from "@/components/settings/ToggleSetting"
import ActionButton from "@/components/ui/ActionButton"
import InfoSection from "@/components/ui/InfoSection"
import {gallerySettingsService} from "@/services/asg/gallerySettingsService"
import {localStorageService} from "@/services/asg/localStorageService"
import {translate} from "@/i18n"
import showAlert from "@/utils/AlertUtils"

export default function GallerySettingsScreen() {
  const {goBack} = useNavigationHistory()
  const {theme, themed} = useAppTheme()

  const [autoSaveToCameraRoll, setAutoSaveToCameraRoll] = useState(true)
  const [localPhotoCount, setLocalPhotoCount] = useState(0)
  const [localVideoCount, setLocalVideoCount] = useState(0)
  const [glassesPhotoCount, setGlassesPhotoCount] = useState(0)
  const [glassesVideoCount, setGlassesVideoCount] = useState(0)
  const [totalStorageSize, setTotalStorageSize] = useState(0)

  // Load settings and stats on mount
  useEffect(() => {
    loadSettings()
    loadStats()
  }, [])

  const loadSettings = async () => {
    const settings = await gallerySettingsService.getSettings()
    setAutoSaveToCameraRoll(settings.autoSaveToCameraRoll)
  }

  const loadStats = async () => {
    try {
      // Get local photos
      const files = await localStorageService.getDownloadedFiles()
      const fileArray = Object.values(files)

      let photos = 0
      let videos = 0
      let size = 0

      fileArray.forEach(file => {
        if (file.is_video) {
          videos++
        } else {
          photos++
        }
        size += file.size
      })

      setLocalPhotoCount(photos)
      setLocalVideoCount(videos)
      setTotalStorageSize(size)

      // Try to get glasses status from global event if available
      // Note: This won't be real-time, just shows last known status
      // We don't have direct access to gallery status here, so we'll show 0
      // The real implementation would need to query this via BLE
      setGlassesPhotoCount(0)
      setGlassesVideoCount(0)
    } catch (error) {
      console.error("[GallerySettings] Error loading stats:", error)
    }
  }

  const handleToggleAutoSave = async (value: boolean) => {
    setAutoSaveToCameraRoll(value)
    await gallerySettingsService.setAutoSaveToCameraRoll(value)
  }

  const handleDeleteAll = async () => {
    const totalLocalMedia = localPhotoCount + localVideoCount

    if (totalLocalMedia === 0) {
      showAlert("No Photos", "There are no photos to delete", [{text: translate("common:ok")}])
      return
    }

    const itemText = totalLocalMedia === 1 ? "item" : "items"
    const message = `This will permanently delete all ${totalLocalMedia} ${itemText} from your device. Photos saved to your camera roll will not be affected. This action cannot be undone.`

    showAlert("Delete All Photos", message, [
      {text: translate("common:cancel"), style: "cancel"},
      {
        text: "Delete All",
        style: "destructive",
        onPress: async () => {
          try {
            await localStorageService.clearAllFiles()
            showAlert("Success", "All photos deleted from device storage", [{text: translate("common:ok")}])
            loadStats() // Refresh stats
          } catch {
            showAlert("Error", "Failed to delete photos", [{text: translate("common:ok")}])
          }
        },
      },
    ])
  }

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B"
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }

  return (
    <Screen preset="fixed" style={{paddingHorizontal: theme.spacing.md}}>
      <Header title="Gallery Settings" leftIcon="caretLeft" onLeftPress={() => goBack()} />
      <ScrollView>
        <View style={themed($sectionCompact)}>
          <Text style={themed($sectionTitle)}>Automatic Sync</Text>

          <ToggleSetting
            label="Save to Camera Roll"
            subtitle="Automatically save new photos to your device's camera roll when syncing"
            value={autoSaveToCameraRoll}
            onValueChange={handleToggleAutoSave}
          />
        </View>

        <View style={themed($sectionTitleOnly)}>
          <Text style={themed($sectionTitle)}>Storage</Text>
        </View>

        <View style={themed($section)}>
          <InfoSection
            title="Gallery Statistics"
            items={[
              {
                label: "Photos on Device",
                value: localPhotoCount.toString(),
              },
              {
                label: "Videos on Device",
                value: localVideoCount.toString(),
              },
              {
                label: "Photos on Glasses",
                value: glassesPhotoCount > 0 ? glassesPhotoCount.toString() : "—",
              },
              {
                label: "Videos on Glasses",
                value: glassesVideoCount > 0 ? glassesVideoCount.toString() : "—",
              },
              {
                label: "Storage Used",
                value: formatBytes(totalStorageSize),
              },
            ]}
          />
        </View>

        <View style={themed($section)}>
          <ActionButton
            label={translate("glasses:deleteAllPhotos")}
            //subtitle="Remove all photos from device storage (camera roll photos are not affected)"
            onPress={handleDeleteAll}
            variant="destructive"
            disabled={localPhotoCount + localVideoCount === 0}
          />
        </View>
      </ScrollView>
    </Screen>
  )
}

const $section: ThemedStyle<ViewStyle> = ({spacing}) => ({
  marginBottom: spacing.lg,
})

const $sectionCompact: ThemedStyle<ViewStyle> = ({spacing}) => ({
  marginBottom: spacing.sm,
})

const $sectionTitleOnly: ThemedStyle<ViewStyle> = ({spacing}) => ({
  marginBottom: spacing.xs,
})

const $sectionTitle: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 13,
  fontWeight: "600",
  color: colors.textDim,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  marginBottom: spacing.xs,
  marginHorizontal: spacing.lg,
  marginTop: spacing.sm,
})
