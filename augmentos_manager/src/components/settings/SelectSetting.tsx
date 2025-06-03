// SelectSetting.tsx
import React, {useState} from "react"
import {
  View,
  Text,
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
}

const SelectSetting: React.FC<SelectSettingProps> = ({label, value, options, onValueChange, description}) => {
  const {theme, themed} = useAppTheme()
  const [modalVisible, setModalVisible] = useState(false)

  const selectedLabel = options.find(option => option.value === value)?.label || "Select..."

  return (
    <View style={styles.container}>
      <Text style={[styles.label, {color: theme.colors.text}]}>{label}</Text>
      {description && <Text style={[styles.description, {color: theme.colors.text}]}>{description}</Text>}
      <TouchableOpacity
        style={[styles.selectField, {borderColor: theme.colors.border, backgroundColor: theme.colors.background}]}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.7}>
        <Text style={[styles.selectText, {color: theme.colors.text}]}>{selectedLabel}</Text>
      </TouchableOpacity>
      <Modal
        visible={modalVisible}
        animationType="fade"
        transparent={true}
        style={{flex: 1}}
        onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{flex: 1}}>
          <TouchableWithoutFeedback onPress={() => setModalVisible(false)}>
            <View style={styles.modalOverlay}>
              <View style={[styles.modalContent, {backgroundColor: theme.colors.background}]}>
                <TouchableWithoutFeedback>
                  <View style={styles.modalHeader}>
                    <Text style={[styles.modalLabel, {color: theme.colors.text}]}>{label}</Text>
                    <TouchableOpacity hitSlop={10} onPress={() => setModalVisible(false)}>
                      <Text style={[styles.closeButton, {color: theme.colors.text, marginRight: -8}]}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableWithoutFeedback>
                <FlatList
                  data={options}
                  keyExtractor={item => item.value}
                  keyboardShouldPersistTaps="always"
                  style={styles.optionsList}
                  renderItem={({item}) => (
                    <Pressable
                      style={[styles.optionItem, item.value === value && {backgroundColor: theme.colors.text + "22"}]}
                      onPress={() => {
                        onValueChange(item.value)
                        setModalVisible(false)
                      }}>
                      <Text style={[styles.optionText, {color: theme.colors.text}]}>{item.label}</Text>
                    </Pressable>
                  )}
                />
              </View>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 10,
    width: "100%",
  },
  label: {
    fontSize: 16,
    marginBottom: 5,
  },
  selectField: {
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 12,
    paddingVertical: 12,
    justifyContent: "center",
    marginBottom: 2,
  },
  selectText: {
    fontSize: 16,
    opacity: 0.9,
  },
  description: {
    fontSize: 12,
    marginBottom: 8,
    flexWrap: "wrap",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.25)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "90%",
    maxHeight: "70%",
    borderRadius: 10,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  modalLabel: {
    fontSize: 18,
    fontWeight: "bold",
  },
  closeButton: {
    fontSize: 22,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  optionsList: {
    flexGrow: 0,
    maxHeight: 250,
  },
  optionItem: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 5,
    marginBottom: 4,
  },
  optionText: {
    fontSize: 16,
  },
})

export default SelectSetting
