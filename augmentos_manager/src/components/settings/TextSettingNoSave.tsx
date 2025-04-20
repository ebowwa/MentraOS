import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, LayoutChangeEvent } from 'react-native';

type TextSettingNoSaveProps = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  theme: any;
};

const TextSettingNoSave: React.FC<TextSettingNoSaveProps> = ({
  label,
  value,
  onChangeText,
  theme
}) => {
  const [height, setHeight] = useState(100);

  const handleContentSizeChange = (event: { nativeEvent: { contentSize: { height: number } } }) => {
    const newHeight = Math.max(100, event.nativeEvent.contentSize.height + 20);
    setHeight(newHeight);
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: theme.textColor }]}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          { 
            color: theme.textColor, 
            borderColor: theme.textColor,
            height
          }
        ]}
        value={value}
        onChangeText={onChangeText}
        multiline
        onContentSizeChange={handleContentSizeChange}
        textAlignVertical="top"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 10,
    width: '100%'
  },
  label: {
    fontSize: 16,
    marginBottom: 5
  },
  input: {
    borderWidth: 1,
    borderRadius: 5,
    padding: 10,
    fontSize: 16,
    textAlignVertical: 'top'
  }
});

export default TextSettingNoSave; 