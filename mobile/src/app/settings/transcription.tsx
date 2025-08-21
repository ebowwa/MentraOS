import React, {useState, useEffect} from "react"
import {ScrollView, View, ActivityIndicator, Alert, Platform} from "react-native"
import {useCoreStatus} from "@/contexts/CoreStatusProvider"
import coreCommunicator from "@/bridge/CoreCommunicator"
import {Header, Screen, Text, Button} from "@/components/ignite"
import {useAppTheme} from "@/utils/useAppTheme"
import ToggleSetting from "@/components/settings/ToggleSetting"
import ModelSelector from "@/components/settings/ModelSelector"
import {translate} from "@/i18n"
import {Spacer} from "@/components/misc/Spacer"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import STTModelManager from "@/services/STTModelManager"
import showAlert from "@/utils/AlertUtils"

export default function TranscriptionSettingsScreen() {
  const {status} = useCoreStatus()
  const {theme} = useAppTheme()
  const {goBack} = useNavigationHistory()

  const [isEnforceLocalTranscriptionEnabled, setIsEnforceLocalTranscriptionEnabled] = useState(
    status.core_info.enforce_local_transcription,
  )
  const [selectedModelId, setSelectedModelId] = useState(STTModelManager.getCurrentModelId())
  const [modelInfo, setModelInfo] = useState<any>(null)
  const [allModels, setAllModels] = useState<any[]>([])
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [extractionProgress, setExtractionProgress] = useState(0)
  const [isCheckingModel, setIsCheckingModel] = useState(true)
  const [isBypassVADForDebuggingEnabled, setIsBypassVADForDebuggingEnabled] = useState(
    status.core_info.bypass_vad_for_debugging,
  )

  const toggleEnforceLocalTranscription = async () => {
    if (!modelInfo?.downloaded) {
      showAlert("Model Required", "You need to download the speech recognition model first.", [{text: "OK"}])
      return
    }

    const newSetting = !isEnforceLocalTranscriptionEnabled
    await coreCommunicator.sendToggleEnforceLocalTranscription(newSetting)
    setIsEnforceLocalTranscriptionEnabled(newSetting)
  }

  const handleModelChange = async (modelId: string) => {
    setSelectedModelId(modelId)
    STTModelManager.setCurrentModelId(modelId)

    // Check if the new model is downloaded and activate it
    const info = await STTModelManager.getModelInfo(modelId)
    setModelInfo(info)

    if (info.downloaded) {
      try {
        await STTModelManager.activateModel(modelId)

        // Auto-restart transcription if mic is active
        if (status.core_info.is_mic_enabled_for_frontend) {
          showAlert("Restarting Transcription", "Switching to new model...", [{text: "OK"}])
          // TODO: Make this work correctly
          //await coreCommunicator.restartTranscription(true)
        } else {
          showAlert("Model Activated", `Switched to ${info.name}`, [{text: "OK"}])
        }
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

      showAlert("Success", "Speech recognition model downloaded successfully!", [{text: "OK"}])
    } catch (error: any) {
      showAlert("Download Failed", error.message || "Failed to download the model. Please try again.", [{text: "OK"}])
    } finally {
      setIsDownloading(false)
      setDownloadProgress(0)
      setExtractionProgress(0)
    }
  }

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
                await coreCommunicator.sendToggleEnforceLocalTranscription(false)
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

  const getProgressText = () => {
    if (downloadProgress > 0 && downloadProgress < 100) {
      return `Downloading... ${downloadProgress}%`
    }
    if (extractionProgress > 0) {
      return `Extracting... ${extractionProgress}%`
    }
    return "Preparing..."
  }

  const checkModelStatus = async () => {
    setIsCheckingModel(true)
    try {
      const info = await STTModelManager.getModelInfo(selectedModelId)
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
    await coreCommunicator.sendToggleBypassVadForDebugging(newSetting)
    setIsBypassVADForDebuggingEnabled(newSetting)
  }

  useEffect(() => {
    setIsEnforceLocalTranscriptionEnabled(status.core_info.enforce_local_transcription)
  }, [status.core_info.enforce_local_transcription])

  useEffect(() => {
    checkModelStatus()
  }, [])

  useEffect(() => {
    setIsBypassVADForDebuggingEnabled(status.core_info.bypass_vad_for_debugging)
  }, [status.core_info.bypass_vad_for_debugging])

  return (
    <Screen preset="fixed" style={{paddingHorizontal: theme.spacing.md}}>
      <Header title={translate("settings:transcriptionSettings")} leftIcon="caretLeft" onLeftPress={() => goBack()} />

      <Spacer height={theme.spacing.md} />

      <ScrollView>
        <ToggleSetting
          label={translate("settings:bypassVAD")}
          subtitle={translate("settings:bypassVADSubtitle")}
          value={isBypassVADForDebuggingEnabled}
          onValueChange={toggleBypassVadForDebugging}
        />

        {Platform.OS === "android" && (
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
        )}
      </ScrollView>
    </Screen>
  )
}
