// SelectSetting.tsx
import React, {useEffect, useState} from "react"
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
} from "react-native"
import {useAppTheme} from "@/utils/useAppTheme"
import {Icon, Text} from "@/components/ignite"
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons"

type Option = {
  label: string
  value: string
}

type Theme = {
  backgroundColor: string
  textColor: string
}

type SelectSettingProps = {
  label: string
  value: string
  options: Option[]
  onValueChange: (value: string) => void
  description?: string
  layout?: "horizontal" | "vertical"
  defaultValue?: string
}

const SelectSetting: React.FC<SelectSettingProps> = ({
  label,
  value,
  options,
  onValueChange,
  description,
  defaultValue,
}) => {
  const {theme, themed} = useAppTheme()
  const [modalVisible, setModalVisible] = useState(false)

  // If the current value doesn't match any option, use the defaultValue
  useEffect(() => {
    if (options.length > 0 && !options.find(option => option.value === value)) {
      // Value doesn't match any option
      if (defaultValue !== undefined && options.find(option => option.value === defaultValue)) {
        // Default value exists and is valid, use it
        onValueChange(defaultValue)
      }
    }
  }, [value, options, defaultValue, onValueChange])

  const selectedLabel = options.find(option => option.value === value)?.label || "Select..."

  let layout = "horizontal"
  // TODO: UI: this is arbitrary, we should have a better way to determine the layout
  if (selectedLabel.length > 20) {
    layout = "vertical"
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[
          layout === "horizontal" ? styles.selectRow : styles.selectColumn,
          {
            backgroundColor: theme.colors.background,
            borderRadius: theme.borderRadius.md,
            borderWidth: theme.spacing.xxxs,
            borderColor: theme.colors.border,
            paddingVertical: theme.spacing.md,
            paddingHorizontal: theme.spacing.lg - theme.spacing.xxs, // 20px
          },
        ]}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.7}>
        <Text
          text={label}
          style={[layout === "horizontal" ? styles.label : styles.labelVertical, {color: theme.colors.text}]}
        />
        <View style={[styles.valueContainer, layout === "vertical" && styles.valueContainerVertical]}>
          <Text text={selectedLabel} style={[styles.selectText, {color: theme.colors.textDim}]} />
          <Icon icon="caretRight" size={16} color={theme.colors.textDim} style={styles.chevron} />
        </View>
      </TouchableOpacity>
      {description && <Text text={description} style={[styles.description, {color: theme.colors.textDim}]} />}
      <Modal
        visible={modalVisible}
        animationType="fade"
        transparent={true}
        style={{flex: 1}}
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
                      padding: theme.spacing.md,
                      borderRadius: theme.borderRadius.md,
                      shadowRadius: theme.spacing.xs,
                    },
                  ]}>
                  <View style={[styles.modalHeader, {marginBottom: theme.spacing.sm}]}>
                    <Text text={label} style={[styles.modalLabel, {color: theme.colors.textDim}]} />
                  </View>
                  <FlatList
                    data={options}
                    keyExtractor={item => item.value}
                    keyboardShouldPersistTaps="always"
                    style={[styles.optionsList, {backgroundColor: theme.colors.background}]}
                    contentContainerStyle={{backgroundColor: theme.colors.background}}
                    renderItem={({item}) => (
                      <Pressable
                        style={[
                          styles.optionItem,
                          {
                            paddingVertical: theme.spacing.sm,
                            paddingRight: theme.spacing.md,
                          },
                        ]}
                        onPress={() => {
                          onValueChange(item.value)
                          setModalVisible(false)
                        }}>
                        <MaterialCommunityIcons
                          name="check"
                          size={24}
                          color={
                            item.value === value
                              ? theme.colors.checkmark || theme.colors.palette.primary300
                              : "transparent"
                          }
                        />
                        <Text
                          text={item.label}
                          style={[styles.optionText, {color: theme.colors.text, flex: 1, marginLeft: theme.spacing.xs}]}
                        />
                      </Pressable>
                    )}
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
  chevron: {
    marginLeft: 2,
  },
  closeButton: {
    fontSize: 22,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  container: {
    width: "100%",
  },
  description: {
    flexWrap: "wrap",
    fontSize: 12,
    marginTop: 4,
    paddingHorizontal: 20,
  },
  label: {
    flex: 1,
    fontSize: 15,
  },
  labelVertical: {
    fontSize: 15,
    marginBottom: 8,
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
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  modalLabel: {
    fontSize: 16,
    fontWeight: "normal",
  },
  modalOverlay: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.25)",
    flex: 1,
    justifyContent: "center",
  },
  optionItem: {
    alignItems: "center",
    flexDirection: "row",
    paddingLeft: 0,
  },
  optionText: {
    fontSize: 16,
  },
  optionsList: {
    flexGrow: 0,
    maxHeight: 250,
  },
  selectColumn: {
    flexDirection: "column",
    alignItems: "stretch",
  },
  selectRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  selectText: {
    fontSize: 15,
  },
  valueContainer: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
  valueContainerVertical: {
    justifyContent: "space-between",
    width: "100%",
  },
})

export default SelectSetting
