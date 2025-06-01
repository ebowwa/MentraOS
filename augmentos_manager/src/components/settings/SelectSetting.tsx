// SelectSetting.tsx
import React from "react"
import {View, Text, StyleSheet} from "react-native"
import PickerSelect, {PickerItem} from "@/components/misc/PickerSelect"
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

  // Convert your Option[] to PickerItem[]
  const pickerItems: PickerItem[] = options.map(option => ({
    label: option.label,
    value: option.value,
  }))

  return (
    <View style={styles.container}>
      <Text style={[styles.label, {color: theme.colors.text}]}>{label}</Text>
      {description && <Text style={[styles.description, {color: theme.colors.text}]}>{description}</Text>}
      <View
        style={[styles.pickerContainer, {borderColor: theme.colors.text, backgroundColor: theme.colors.background}]}>
        <PickerSelect
          items={pickerItems}
          value={value}
          onValueChange={onValueChange}
          // placeholder={{ label: 'Select an option...', value: '' }}
          style={{
            touchable: {backgroundColor: theme.colors.background, color: theme.colors.text},
            touchableText: {color: theme.colors.text},
            itemTouchable: {
              backgroundColor: theme.colors.background,
              color: theme.colors.text,
            },
            itemText: {
              color: theme.colors.text,
            },
            modalContainer: {
              // backgroundColor: theme.colors.background
              // borderRadius: 100,
            },
          }}
        />
      </View>
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
  pickerContainer: {
    borderWidth: 1,
    borderRadius: 5,
    overflow: "hidden",
    justifyContent: "center",
  },
  description: {
    fontSize: 12,
    marginBottom: 8,
    flexWrap: "wrap",
  },
})

export default SelectSetting
