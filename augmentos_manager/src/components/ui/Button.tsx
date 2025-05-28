import { translate } from "@/i18n";
import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"
import * as React from "react";
import {Text, View, Image, TouchableOpacity, ViewStyle, TextStyle} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {SafeAreaView} from "react-native-safe-area-context";
import ChevronRight from "assets/icons/ChevronRight"

interface ButtonProps {
  title: string;
  onPress: () => void;
  icon: React.ReactNode;
}

const Button = ({ title, onPress, icon }: ButtonProps) => {
  const { themed } = useAppTheme();
  return (
    <TouchableOpacity onPress={onPress} style={themed($padding)}>
      <LinearGradient {...linearGradientProps}>
        <View style={[themed($insideSpacing), themed($insideFlexBox)]}>
          <View style={[themed($inside), themed($insideFlexBox)]}>
            {icon}
            <View style={[themed($miraWrapper), themed($insideFlexBox)]}>
              <Text style={themed($mira)} numberOfLines={1}>{title}</Text>
            </View>
          </View>
          <ChevronRight/>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
};


const $insideFlexBox: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  alignItems: "center"
});

const $mira: ThemedStyle<TextStyle> = () => ({
  fontSize: 17,
  letterSpacing: 0.3,
  lineHeight: 23,
  fontWeight: "500",
  fontFamily: "JosefinSans-Medium",
  color: "#fff",
  textAlign: "center",
  overflow: "hidden"
});

const $miraWrapper: ThemedStyle<ViewStyle> = () => ({
  width: 265
});

const $inside: ThemedStyle<ViewStyle> = () => ({
  gap: 20
});

const $insideSpacing: ThemedStyle<ViewStyle> = () => ({
  borderRadius: 28,
  backgroundColor: "#0f1861",
  width: "100%",
  minHeight: 44,
  justifyContent: "space-between",
  paddingHorizontal: 16,
  paddingVertical: 8,
  gap: 0,
  overflow: "hidden"
});

const $padding: ThemedStyle<ViewStyle> = () => ({
  paddingHorizontal: 8,
  paddingVertical: 16,
  marginVertical: 8
});

const $quickConnect: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  width: "100%",
  alignItems: "center",
  overflow: "hidden"
});

const linearGradientProps = {
  colors: ["#06114D", "#4340D3"],
  start: { x: 0, y: 0 },
  end: { x: 1, y: 0 },
  style: {
    padding: 2,
    borderRadius: 30,
    overflow: "hidden"
  } as ViewStyle
};

export default Button;
