import React, {useState} from "react"
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  ActivityIndicator,
} from "react-native"
import {useAppTheme} from "@/utils/useAppTheme"
import {Icon, Text, Button} from "@/components/ignite"
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons"
import {ModelInfo, STTModelManager} from "@/services/STTModelManager"

type ModelSelectorProps = {
  selectedModelId: string
  models: ModelInfo[]
  onModelChange: (modelId: string) => void
  onDownload: (modelId: string) => void
  onDelete: (modelId: string) => void
  isDownloading: boolean
  downloadProgress: number
  extractionProgress: number
  currentModelInfo: ModelInfo | null
}

const ModelSelector: React.FC<ModelSelectorProps> = ({
  selectedModelId,
  models,
  onModelChange,
  onDownload,
  onDelete,
  isDownloading,
  downloadProgress,
  extractionProgress,
  currentModelInfo,
}) => {
  const {theme} = useAppTheme()
  const [modalVisible, setModalVisible] = useState(false)

  const selectedModel = models.find(m => m.modelId === selectedModelId)
  const isDownloaded = selectedModel?.downloaded || false

  const getStatusIcon = () => {
    if (isDownloading) {
      return <ActivityIndicator size="small" color={theme.colors.primary} />
    }
    return null
  }

  const getSubtitle = () => {
    if (!selectedModel) return ""

    if (isDownloading) {
      if (extractionProgress > 0) {
        return `Extracting...`
      } else if (downloadProgress > 0) {
        return `Downloading... ${downloadProgress}%`
      } else {
        return "Preparing download..."
      }
    }

    const sizeText = STTModelManager.formatBytes(selectedModel.size)
    if (isDownloaded) {
      return `${sizeText} • Downloaded`
    }
    return `${sizeText} • Not downloaded`
  }

  const renderModelOption = ({item}: {item: ModelInfo}) => {
    const isSelected = item.modelId === selectedModelId
    const isModelDownloaded = item.downloaded

    return (
      <Pressable
        style={[
          styles.optionItem,
          {
            paddingVertical: theme.spacing.sm,
            paddingHorizontal: theme.spacing.md,
          },
        ]}
        onPress={() => {
          onModelChange(item.modelId)
          setModalVisible(false)
        }}>
        <View style={styles.optionContent}>
          <View style={styles.optionTextContainer}>
            <Text
              text={item.name}
              style={[
                styles.optionText,
                {
                  color: theme.colors.text,
                  fontWeight: isSelected ? "600" : "400",
                },
              ]}
            />
            <Text
              text={`${STTModelManager.formatBytes(item.size)}${isModelDownloaded ? " • Downloaded" : ""}`}
              style={[styles.optionSubtext, {color: theme.colors.textDim}]}
            />
          </View>
          <View style={styles.optionIcons}>
            {isSelected && <MaterialCommunityIcons name="check" size={24} color={theme.colors.text} />}
          </View>
        </View>
      </Pressable>
    )
  }

  return (
    <View style={styles.container}>
      <Text text="Offline Mode Speech Model" style={[styles.label, {color: theme.colors.text}]} />

      <TouchableOpacity
        style={[
          styles.selector,
          {
            backgroundColor: theme.colors.background,
            borderRadius: theme.borderRadius.md,
            borderWidth: theme.spacing.xxxs,
            borderColor: theme.colors.border,
            paddingVertical: theme.spacing.md,
            paddingHorizontal: theme.spacing.md,
            marginTop: theme.spacing.xs,
          },
        ]}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.7}>
        <View style={styles.selectorContent}>
          <View style={styles.selectorTextContainer}>
            <Text text={selectedModel?.name || "Select..."} style={[styles.selectedText, {color: theme.colors.text}]} />
            <Text text={getSubtitle()} style={[styles.subtitleText, {color: theme.colors.textDim}]} />
          </View>
          <View style={styles.selectorIcons}>
            {getStatusIcon()}
            <Icon icon="caretRight" size={16} color={theme.colors.textDim} style={{marginLeft: theme.spacing.xs}} />
          </View>
        </View>
      </TouchableOpacity>

      {/* Download/Delete button for current selection */}
      {selectedModel && !isDownloaded && !isDownloading && (
        <Button
          text="Download Model"
          onPress={() => onDownload(selectedModelId)}
          style={{marginTop: theme.spacing.sm}}
        />
      )}

      {/* TODO: Consider adding this button back */}
      {/* {selectedModel && isDownloaded && !isDownloading && (
        <Button
          text="Delete Model"
          preset="secondary"
          onPress={() => onDelete(selectedModelId)}
          style={{marginTop: theme.spacing.sm}}
          textStyle={{color: theme.colors.error}}
        />
      )} */}

      <Modal
        visible={modalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{flex: 1}}>
          <TouchableWithoutFeedback onPress={() => setModalVisible(false)}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback>
                <View
                  style={[
                    styles.modalContent,
                    {
                      backgroundColor: theme.colors.background,
                      borderColor: theme.colors.border,
                      borderWidth: theme.spacing.xxxs,
                      borderRadius: theme.borderRadius.md,
                      shadowRadius: theme.spacing.xs,
                    },
                  ]}>
                  <View
                    style={[
                      styles.modalHeader,
                      {
                        marginBottom: theme.spacing.sm,
                        padding: theme.spacing.md,
                        borderBottomColor: theme.colors.separator,
                      },
                    ]}>
                    <Text text="Select Model" style={[styles.modalLabel, {color: theme.colors.text}]} />
                  </View>
                  <FlatList
                    data={models}
                    keyExtractor={item => item.modelId}
                    renderItem={renderModelOption}
                    style={[styles.optionsList, {backgroundColor: theme.colors.background}]}
                    contentContainerStyle={{paddingBottom: theme.spacing.md}}
                  />
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  label: {
    fontSize: 15,
    fontWeight: "600",
  },
  selector: {
    width: "100%",
  },
  selectorContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  selectorTextContainer: {
    flex: 1,
  },
  selectedText: {
    fontSize: 16,
    fontWeight: "500",
  },
  subtitleText: {
    fontSize: 13,
    marginTop: 2,
  },
  selectorIcons: {
    flexDirection: "row",
    alignItems: "center",
  },
  modalOverlay: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.25)",
    flex: 1,
    justifyContent: "center",
  },
  modalContent: {
    elevation: 5,
    maxHeight: "70%",
    shadowColor: "#000",
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.2,
    width: "90%",
  },
  modalHeader: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalLabel: {
    fontSize: 18,
    fontWeight: "600",
  },
  optionsList: {
    flexGrow: 0,
    maxHeight: 400,
  },
  optionItem: {
    width: "100%",
  },
  optionContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  optionTextContainer: {
    flex: 1,
  },
  optionText: {
    fontSize: 16,
  },
  optionSubtext: {
    fontSize: 13,
    marginTop: 2,
  },
  optionIcons: {
    flexDirection: "row",
    alignItems: "center",
  },
})

export default ModelSelector
