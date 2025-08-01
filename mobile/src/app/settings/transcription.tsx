import React, {useState, useEffect} from "react"
import {ScrollView, View, ActivityIndicator, Alert} from "react-native"
import {useStatus} from "@/contexts/AugmentOSStatusProvider"
import coreCommunicator from "@/bridge/CoreCommunicator"
import {Header, Screen, Text, Button} from "@/components/ignite"
import {useAppTheme} from "@/utils/useAppTheme"
import ToggleSetting from "@/components/settings/ToggleSetting"
import SelectSetting from "@/components/settings/SelectSetting"
import {translate} from "@/i18n"
import {Spacer} from "@/components/misc/Spacer"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import STTModelManager from "@/services/STTModelManager"
import {NativeModules} from "react-native"
import showAlert from "@/utils/AlertUtils"

const {AOSModule, FileProviderModule} = NativeModules

export default function TranscriptionSettingsScreen() {
  const {status} = useStatus()
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

  const {theme} = useAppTheme()
  const {goBack} = useNavigationHistory()

  useEffect(() => {
    setIsEnforceLocalTranscriptionEnabled(status.core_info.enforce_local_transcription)
  }, [status.core_info.enforce_local_transcription])

  useEffect(() => {
    checkModelStatus()
  }, [])

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
          await coreCommunicator.restartTranscription()
        } else {
          showAlert("Model Activated", `Switched to ${info.name}`, [{text: "OK"}])
        }
      } catch (error: any) {
        showAlert("Error", error.message || "Failed to activate model", [{text: "OK"}])
      }
    }
  }

  const handleDownloadModel = async () => {
    try {
      setIsDownloading(true)
      setDownloadProgress(0)
      setExtractionProgress(0)

      await STTModelManager.downloadModel(
        selectedModelId,
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

  const handleDeleteModel = async () => {
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
              await STTModelManager.deleteModel(selectedModelId)
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

  return (
    <Screen preset="fixed" style={{paddingHorizontal: theme.spacing.md}}>
      <Header title={translate("settings:transcriptionSettings")} leftIcon="caretLeft" onLeftPress={() => goBack()} />

      <Spacer height={theme.spacing.md} />

      <ScrollView>
        {isCheckingModel ? (
          <View style={{alignItems: "center", padding: theme.spacing.lg}}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Spacer height={theme.spacing.sm} />
            <Text>Checking model status...</Text>
          </View>
        ) : (
          <>
            {/* Model Selection */}
            <SelectSetting
              label="Speech Recognition Model"
              value={selectedModelId}
              options={allModels.map(model => ({
                label: model.name,
                value: model.modelId,
              }))}
              onValueChange={handleModelChange}
              description="Select the speech recognition model to use"
              layout="vertical"
            />

            <Spacer height={theme.spacing.md} />

            {/* Model Download Section */}
            <View
              style={{
                backgroundColor: theme.colors.surface,
                padding: theme.spacing.md,
                borderRadius: theme.borderRadius.md,
                marginBottom: theme.spacing.md,
              }}>
              <Text weight="semiBold" size="lg" style={{marginBottom: theme.spacing.xs}}>
                Model Status
              </Text>

              {modelInfo && (
                <>
                  <Text size="sm" style={{color: theme.colors.textDim, marginBottom: theme.spacing.xs}}>
                    {modelInfo.name} • {STTModelManager.formatBytes(modelInfo.size)}
                  </Text>

                  {!modelInfo.downloaded && !isDownloading && (
                    <>
                      <Text size="sm" style={{color: theme.colors.warning, marginBottom: theme.spacing.sm}}>
                        Model not downloaded. Download required for local transcription.
                      </Text>
                      <Button
                        text="Download Model"
                        onPress={handleDownloadModel}
                        style={{marginTop: theme.spacing.sm}}
                      />
                    </>
                  )}

                  {isDownloading && (
                    <View style={{marginTop: theme.spacing.sm}}>
                      <Text size="sm" style={{marginBottom: theme.spacing.xs}}>
                        {getProgressText()}
                      </Text>
                      <View
                        style={{
                          height: 4,
                          backgroundColor: theme.colors.separator,
                          borderRadius: 2,
                          overflow: "hidden",
                        }}>
                        <View
                          style={{
                            height: "100%",
                            backgroundColor: theme.colors.primary,
                            width: `${downloadProgress || extractionProgress}%`,
                          }}
                        />
                      </View>
                      <Button
                        text="Cancel"
                        preset="secondary"
                        onPress={handleCancelDownload}
                        style={{marginTop: theme.spacing.sm}}
                      />
                    </View>
                  )}

                  {modelInfo.downloaded && !isDownloading && (
                    <View style={{flexDirection: "row", alignItems: "center", marginTop: theme.spacing.sm}}>
                      <Text size="sm" style={{color: theme.colors.success, flex: 1}}>
                        ✓ Model downloaded
                      </Text>
                      <Button
                        text="Delete"
                        preset="secondary"
                        onPress={handleDeleteModel}
                        textStyle={{color: theme.colors.error}}
                      />
                    </View>
                  )}
                </>
              )}
            </View>

            <Spacer height={theme.spacing.md} />

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
                Download the model to enable local transcription
              </Text>
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  )
}
