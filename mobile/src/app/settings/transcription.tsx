import React, {useState, useEffect, useCallback} from "react"
import {ScrollView, View, ActivityIndicator, Alert, Platform, BackHandler} from "react-native"
import {useCoreStatus} from "@/contexts/CoreStatusProvider"
import bridge from "@/bridge/MantleBridge"
import {Header, Screen, Text, Button} from "@/components/ignite"
import {useAppTheme} from "@/utils/useAppTheme"
import ToggleSetting from "@/components/settings/ToggleSetting"
import ModelSelector from "@/components/settings/ModelSelector"
import {translate} from "@/i18n"
import {Spacer} from "@/components/misc/Spacer"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import STTModelManager from "@/services/STTModelManager"
import showAlert from "@/utils/AlertUtils"
import {useFocusEffect} from "@react-navigation/native"
import {saveSetting, SETTINGS_KEYS} from "@/utils/SettingsHelper"
import {loadSetting} from "@/utils/SettingsHelper"

export default function TranscriptionSettingsScreen() {
  const {status} = useCoreStatus()
  const {theme} = useAppTheme()
  const {goBack} = useNavigationHistory()

  const [isEnforceLocalTranscriptionEnabled, setIsEnforceLocalTranscriptionEnabled] = useState(false)
  const [selectedModelId, setSelectedModelId] = useState(STTModelManager.getCurrentModelId())
  const [modelInfo, setModelInfo] = useState<any>(null)
  const [allModels, setAllModels] = useState<any[]>([])
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [extractionProgress, setExtractionProgress] = useState(0)
  const [isCheckingModel, setIsCheckingModel] = useState(true)
  const [isBypassVADForDebuggingEnabled, setIsBypassVADForDebuggingEnabled] = useState(false)
  const RESTART_TRANSCRIPTION_DEBOUNCE_MS = 8000; // 8 seconds
  const [lastRestartTime, setLastRestartTime] = useState(0)


  // load settings:
  useEffect(() => {
    loadSetting(SETTINGS_KEYS.enforce_local_transcription).then(setIsEnforceLocalTranscriptionEnabled)
    loadSetting(SETTINGS_KEYS.bypass_vad_for_debugging).then(setIsBypassVADForDebuggingEnabled)
  }, [])

  // Cancel download function
  const handleCancelDownload = async () => {
    try {
      await STTModelManager.cancelDownload()
      setIsDownloading(false)
      setDownloadProgress(0)
      setExtractionProgress(0)
    } catch (error) {
      console.error("Error canceling download:", error)
    }
  }

  // Handle back navigation blocking during downloads
  const handleBackPress = useCallback(() => {
    if (isDownloading) {
      showAlert(
        "Download in Progress",
        "A model is currently downloading. Are you sure you want to cancel and go back?",
        [
          {text: "Stay", style: "cancel"},
          {
            text: "Cancel Download",
            style: "destructive",
            onPress: async () => {
              try {
                await handleCancelDownload()
                goBack()
              } catch (error) {
                console.error("Error canceling download:", error)
                goBack() // Go back anyway if cancel fails
              }
            },
          },
        ],
      )
      return true // Prevent default back action
    }
    return false // Allow default back action
  }, [isDownloading, goBack, handleCancelDownload])

  // Block hardware back button on Android during downloads
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS === "android") {
        const backHandler = BackHandler.addEventListener("hardwareBackPress", handleBackPress)
        return () => backHandler.remove()
      }
    }, [handleBackPress]),
  )

  // Custom goBack function that respects download state
  const handleGoBack = () => {
    const shouldBlock = handleBackPress()
    if (!shouldBlock) {
      goBack()
    }
  }

  const toggleEnforceLocalTranscription = async () => {
    if (!modelInfo?.downloaded) {
      showAlert("Model Required", "You need to download the speech recognition model first.", [{text: "OK"}])
      return
    }

    const newSetting = !isEnforceLocalTranscriptionEnabled
    await bridge.sendToggleEnforceLocalTranscription(newSetting) // TODO: config: remove
    await saveSetting(SETTINGS_KEYS.enforce_local_transcription, newSetting)
    setIsEnforceLocalTranscriptionEnabled(newSetting)
  }

  const timeRemainingTillRestart = () => {
    const now = Date.now()
    const timeRemaining = RESTART_TRANSCRIPTION_DEBOUNCE_MS - (now - lastRestartTime)
    return timeRemaining
  }

  const activateModelandRestartTranscription = async (modelId: string): Promise<void> => {
    const now = Date.now()
    setLastRestartTime(now)
    await STTModelManager.activateModel(modelId)
    await bridge.restartTranscription()
  }


  const handleModelChange = async (modelId: string) => {
    const timeRemaining = timeRemainingTillRestart()

    if (timeRemaining > 0) {
      showAlert("Restart already in progress", "A model change is in progress. Please wait " + Math.ceil(timeRemaining/1000) + " seconds before switching to another model", [{text: "OK"}])
      return
    }
    const info = await STTModelManager.getModelInfo(modelId)
    setSelectedModelId(modelId)
    STTModelManager.setCurrentModelId(modelId)
    setModelInfo(info)

    if (info.downloaded) {
      try {
        await activateModelandRestartTranscription(modelId)
        showAlert("Restarted Transcription", "Switched to new model", [{text: "OK"}])
      } catch (error: any) {
        showAlert("Error", error.message || "Failed to activate model", [{text: "OK"}])
      }
    }
  }

  const handleDownloadModel = async (modelId?: string) => {
    const targetModelId = modelId || selectedModelId
    try {
      setIsDownloading(true)
      setDownloadProgress(0)
      setExtractionProgress(0)

      await STTModelManager.downloadModel(
        targetModelId,
        progress => {
          setDownloadProgress(progress.percentage)
        },
        progress => {
          setExtractionProgress(progress.percentage)
        },
      )

      // Re-check model status after download
      await checkModelStatus()

      await activateModelandRestartTranscription(targetModelId)

      showAlert("Success", "Speech recognition model downloaded successfully!", [{text: "OK"}])
    } catch (error: any) {
      showAlert("Download Failed", error.message || "Failed to download the model. Please try again.", [{text: "OK"}])
    } finally {
      setIsDownloading(false)
      setDownloadProgress(0)
      setExtractionProgress(0)
    }
  }

  const handleDeleteModel = async (modelId?: string) => {
    const targetModelId = modelId || selectedModelId
    showAlert(
      "Delete Model",
      "Are you sure you want to delete the speech recognition model? You'll need to download it again to use local transcription.",
      [
        {text: "Cancel", style: "cancel"},
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await STTModelManager.deleteModel(targetModelId)
              await checkModelStatus()

              // If local transcription is enabled, disable it
              if (isEnforceLocalTranscriptionEnabled) {
                await bridge.sendToggleEnforceLocalTranscription(false)
                setIsEnforceLocalTranscriptionEnabled(false)
              }
            } catch (error: any) {
              showAlert("Error", error.message || "Failed to delete model", [{text: "OK"}])
            }
          },
        },
      ],
    )
  }

  const initSelectedModel = async () => {
    const modelId = await STTModelManager.getCurrentModelIdFromPreferences()
    if (modelId) {
      setSelectedModelId(modelId)
    }
    checkModelStatus(modelId)
  }

  const checkModelStatus = async (modelId?: string) => {
    setIsCheckingModel(true)
    try {
      const info = await STTModelManager.getModelInfo(modelId || selectedModelId)
      setModelInfo(info)
      const models = await STTModelManager.getAllModelsInfo()
      setAllModels(models)
    } catch (error) {
      console.error("Error checking model status:", error)
    } finally {
      setIsCheckingModel(false)
    }
  }

  const toggleBypassVadForDebugging = async () => {
    const newSetting = !isBypassVADForDebuggingEnabled
    await bridge.sendToggleBypassVadForDebugging(newSetting) // TODO: config: remove
    await saveSetting(SETTINGS_KEYS.bypass_vad_for_debugging, newSetting)
    setIsBypassVADForDebuggingEnabled(newSetting)
  }

  useEffect(() => {
    initSelectedModel()
  }, [])

  return (
    <Screen preset="fixed" style={{paddingHorizontal: theme.spacing.md}}>
      <Header title={translate("settings:transcriptionSettings")} leftIcon="caretLeft" onLeftPress={handleGoBack} />

      <Spacer height={theme.spacing.md} />

      <ScrollView>
        <ToggleSetting
          label={translate("settings:bypassVAD")}
          subtitle={translate("settings:bypassVADSubtitle")}
          value={isBypassVADForDebuggingEnabled}
          onValueChange={toggleBypassVadForDebugging}
        />

        {
          <>
            <Spacer height={theme.spacing.md} />

            {isCheckingModel ? (
              <View style={{alignItems: "center", padding: theme.spacing.lg}}>
                <ActivityIndicator size="large" color={theme.colors.text} />
                <Spacer height={theme.spacing.sm} />
                <Text>Checking model status...</Text>
              </View>
            ) : (
              <>
                {/* Integrated Model Selector */}
                <ModelSelector
                  selectedModelId={selectedModelId}
                  models={allModels}
                  onModelChange={handleModelChange}
                  onDownload={() => handleDownloadModel()}
                  onDelete={() => handleDeleteModel()}
                  isDownloading={isDownloading}
                  downloadProgress={downloadProgress}
                  extractionProgress={extractionProgress}
                  currentModelInfo={modelInfo}
                />

                <Spacer height={theme.spacing.lg} />

                {/* Local Transcription Toggle */}
                <ToggleSetting
                  label={translate("settings:enforceLocalTranscription")}
                  subtitle={translate("settings:enforceLocalTranscriptionSubtitle")}
                  value={isEnforceLocalTranscriptionEnabled}
                  onValueChange={toggleEnforceLocalTranscription}
                  disabled={!modelInfo?.downloaded || isDownloading}
                />

                {(!modelInfo?.downloaded || isDownloading) && (
                  <Text
                    size="xs"
                    style={{
                      color: theme.colors.textDim,
                      marginTop: theme.spacing.xs,
                      paddingHorizontal: theme.spacing.sm,
                    }}>
                    Download a model to enable local transcription
                  </Text>
                )}
              </>
            )}
          </>
        }
      </ScrollView>
    </Screen>
  )
}
