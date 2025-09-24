import React, {useState, useCallback, useEffect} from "react"
import {View, ViewStyle, TextStyle} from "react-native"
import {useAppTheme} from "@/utils/useAppTheme"
import {ThemedStyle} from "@/theme"
import {AppListItem} from "./AppListItem"
import {Text} from "@/components/ignite"
import bridge from "@/bridge/MantleBridge"
import {SETTINGS_KEYS, useSetting} from "@/stores/settings"
import {router} from "expo-router"
import EmptyAppsView from "@/components/home/EmptyAppsView"
import {useFocusEffect} from "@react-navigation/native"
import showAlert from "@/utils/AlertUtils"
import socketComms from "@/managers/SocketComms"
import {STTModelManager} from "@/services/STTModelManager"

interface AppModel {
  packageName: string
  name: string
  description: string
  logoURL: string
  type: string
  isOnline?: boolean
  compatibility: {
    isCompatible: boolean
    message: string
  }
}

interface AppsOfflineListProps {
  isSearchPage?: boolean
}

export const AppsOfflineList: React.FC<AppsOfflineListProps> = ({isSearchPage = false}) => {
  const {themed} = useAppTheme()

  const [isLocalTranscriptionEnforced, setIsLocalTranscriptionEnforced] = useSetting(
    SETTINGS_KEYS.enforce_local_transcription,
  )
  const [isOfflineCaptionsEnabled, setIsOfflineCaptionsEnabled] = useSetting(SETTINGS_KEYS.offline_captions_app_running)

  // Load saved states on mount and when screen comes into focus
  const loadState = useCallback(async () => {
    // TODO: Remove this logic later. It's just to ensure that the users who have already installed the models don't face any issues
    if (!isLocalTranscriptionEnforced) {
      const models = await STTModelManager.getInstance().getAllModelsInfo()
      const hasModels = models.some(model => model.downloaded)
      if (hasModels) {
        console.log("AppsOfflineList: Models downloaded but local transcription not enforced")
        console.log("AppsOfflineList: Enforcing local transcription")
        await setIsLocalTranscriptionEnforced(true)
        await bridge.sendToggleEnforceLocalTranscription(true)
        console.log("AppsOfflineList: Local transcription enforced")
      }
    }
  }, [])

  // Load state on mount
  useEffect(() => {
    loadState()
  }, [loadState])

  // Reload state when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadState()
    }, [loadState]),
  )

  // Mock data for offline captions app
  const offlineCaptionsApp: AppModel = {
    packageName: "cloud.augmentos.offlinecaptions",
    name: "Offline Captions",
    description: "Enable captions that work without an internet connection",
    logoURL: "https://appstore.augmentos.org/app-icons/captions.png",
    type: "standard",
    isOnline: true,
    compatibility: {
      isCompatible: true,
      message: "",
    },
  }

  const displayAppStartingMessage = useCallback(() => {
    socketComms.handle_display_event({
      type: "display_event",
      view: "main",
      layout: {
        layoutType: "reference_card",
        title: "// MentraOS - Starting App",
        text: "Offline Captions",
      },
    })
  }, [])

  const clearDisplayOnAppStop = useCallback(() => {
    socketComms.handle_display_event({
      type: "display_event",
      view: "main",
      layout: {
        layoutType: "text_wall",
        text: "",
      },
    })
  }, [])

  const handleToggleOfflineCaptions = useCallback(async () => {
    if (!isLocalTranscriptionEnforced) {
      showAlert(
        "Download and enable local transcription",
        "Please download and enable local transcription to use offline apps",
        [{text: "Go to settings", onPress: () => router.push("/settings/transcription")}],
      )
      return
    }

    const newOfflineMode = !isOfflineCaptionsEnabled

    if (newOfflineMode) {
      displayAppStartingMessage()
    } else {
      clearDisplayOnAppStop()
    }

    // Update the bridge with the new offline mode
    // Update the local state
    // TODO: Later remove this during android refactor
    bridge.toggleOfflineApps(newOfflineMode)
    setIsOfflineCaptionsEnabled(newOfflineMode)
  }, [isOfflineCaptionsEnabled, isLocalTranscriptionEnforced])

  if (isSearchPage) {
    return null // Don't show in search results
  }

  // Active apps section
  const activeApps = isOfflineCaptionsEnabled ? [offlineCaptionsApp] : []
  const inactiveApps = isOfflineCaptionsEnabled ? [] : [offlineCaptionsApp]

  return (
    <View style={themed($container)}>
      {/* Requirements Note - Only show if local transcription is not enforced */}
      {!isLocalTranscriptionEnforced && (
        <View style={themed($noteContainer)}>
          <Text style={themed($noteText)}>
            Note: To use offline apps, please ensure you have downloaded the local transcription models and enabled them
            in the{" "}
            <Text style={themed($linkText)} onPress={() => router.push("/settings/transcription")}>
              app settings
            </Text>
            .
          </Text>
        </View>
      )}

      {/* Empty State */}
      {activeApps.length === 0 && (
        <EmptyAppsView statusMessageKey="home:noActiveApps" activeAppsMessageKey="home:emptyActiveAppListInfo" />
      )}

      {/* Active Apps Section */}
      {activeApps.length > 0 && (
        <View style={themed($section)}>
          <View style={themed($headerContainer)}>
            <Text preset="subheading" text="Active" style={themed($sectionTitle)} />
          </View>
          {activeApps.map(app => (
            <AppListItem
              key={app.packageName}
              app={app}
              isActive={isOfflineCaptionsEnabled && isLocalTranscriptionEnforced}
              onTogglePress={handleToggleOfflineCaptions}
              onSettingsPress={() => {}}
              isDisabled={!isLocalTranscriptionEnforced}
            />
          ))}
        </View>
      )}

      {/* Inactive Apps Section */}
      {inactiveApps.length > 0 && (
        <View style={themed($section)}>
          <View style={themed($headerContainer)}>
            <Text preset="subheading" text="Available" style={themed($sectionTitle)} />
          </View>
          {inactiveApps.map(app => (
            <AppListItem
              key={app.packageName}
              app={app}
              isActive={false}
              onTogglePress={handleToggleOfflineCaptions}
              onSettingsPress={() => {}}
              isDisabled={!isLocalTranscriptionEnforced}
            />
          ))}
        </View>
      )}
    </View>
  )
}

const $container: ThemedStyle<ViewStyle> = theme => ({
  width: "100%",
  marginBottom: theme.spacing.lg,
  flex: 1,
})

const $section: ThemedStyle<ViewStyle> = theme => ({
  marginBottom: theme.spacing.xl,
})

const $noteContainer: ThemedStyle<ViewStyle> = theme => ({
  backgroundColor: theme.colors.foregroundTagBackground,
  borderRadius: 8,
  padding: theme.spacing.md,
  margin: theme.spacing.md,
  marginBottom: theme.spacing.lg,
  borderLeftWidth: 3,
  borderLeftColor: theme.colors.tint,
})

const $noteText: ThemedStyle<TextStyle> = theme => ({
  color: theme.colors.text,
  fontSize: 14,
  lineHeight: 20,
})

const $linkText: ThemedStyle<TextStyle> = theme => ({
  color: theme.colors.tint,
  fontWeight: "500",
  marginLeft: 2,
  fontSize: 14,
  lineHeight: 20,
})

const $headerContainer: ThemedStyle<ViewStyle> = theme => ({
  marginBottom: theme.spacing.sm,
  paddingHorizontal: theme.spacing.md,
})

const $sectionTitle: ThemedStyle<TextStyle> = theme => ({
  fontSize: 14,
  fontWeight: "600",
  color: theme.colors.textDim,
  marginBottom: theme.spacing.sm,
  textTransform: "uppercase",
  letterSpacing: 0.5,
})
