import React from "react";
import { View, Text, TouchableOpacity, ViewStyle, TextStyle } from "react-native";
import { useAppTheme } from "@/utils/useAppTheme";
import {ThemedStyle} from "@/theme"
import AppIcon from "./AppIcon";
import ChevronRight from "assets/icons/ChevronRight";
import SunIcon from "assets/icons/SunIcon";
import { TreeIcon } from "assets/icons/TreeIcon";
import {translate} from "@/i18n"

interface AppModel {
  name: string;
  packageName: string;
  is_foreground?: boolean;
}

interface AppListItemProps {
    app: AppModel;
    isActive: boolean;
    onTogglePress: () => void;
    onSettingsPress: () => void;
    refProp?: React.Ref<any>;
    is_foreground?: boolean;

}

export const AppListItem = ({
  app,
  isActive,
  onTogglePress,
  onSettingsPress,
  refProp,
}: AppListItemProps) => {
  const { themed } = useAppTheme();
  console.log("zxc: ",app);

  const toggleLeft = isActive ? "44.44%" : "-2.78%";
  const toggleBarStyle = isActive ? {} : { backgroundColor: "#565E8C" };

  return (
    <View style={[themed($everything), themed($everythingFlexBox)]}>
      <View style={[themed($appDescription), themed($everythingFlexBox)]}>
        <AppIcon app={app} isForegroundApp={app.is_foreground} style={themed($appIcon)} />
        <View style={themed($appNameWrapper)}>
          <Text style={[themed($appName), { color: isActive?"#F7F7F7":"#CED2ED"}]} numberOfLines={1}>
            {app.name}
          </Text>
          {app.is_foreground && <Tag isActive={isActive} isForeground={app.is_foreground} />}
        </View>
      </View>

      <View style={[themed($toggleParent), themed($everythingFlexBox)]}>
        <TouchableOpacity
          onPress={onTogglePress}
          delayLongPress={500}
          style={{ padding: 10, borderRadius: 20 }}
          {...(refProp ? { ref: refProp } : {})}
        >
          <View style={themed($toggle)}>
            <View style={[themed($toggleBarIcon), themed($toggleIconLayout), toggleBarStyle]} />
            <View style={[themed($toggleCircleIcon), themed($toggleIconLayout), { left: toggleLeft }]}>
              <View style={{ flex: 1, borderRadius: 12, backgroundColor: "#CED2ED" }} />
            </View>
          </View>
        </TouchableOpacity>
        <ChevronRight />
      </View>
    </View>
  );
};

const $everything: ThemedStyle<ViewStyle> = () => ({
  justifyContent: "space-between",
  gap: 0,
  alignSelf: "stretch",
})

const $everythingFlexBox: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  alignItems: "center",
})

const $appDescription: ThemedStyle<ViewStyle> = () => ({
  gap: 17,
  justifyContent: "center",
})

const $appIcon: ThemedStyle<ViewStyle> = () => ({
  width: 32,
  height: 32,
})

const $appNameWrapper: ThemedStyle<ViewStyle> = () => ({
  justifyContent: "center",
})

const $appName: ThemedStyle<TextStyle> = () => ({
  fontSize: 15,
  letterSpacing: 0.6,
  lineHeight: 20,
  fontFamily: "SF Pro Rounded",
  textAlign: "left",
  overflow: "hidden",
})

const $toggleParent: ThemedStyle<ViewStyle> = () => ({
  gap: 12,
})

const $toggle: ThemedStyle<ViewStyle> = () => ({
  width: 36,
  height: 20,
})

const $toggleBarIcon: ThemedStyle<ViewStyle> = () => ({
  height: "80%",
  width: "94.44%",
  top: "15%",
  right: "5.56%",
  bottom: "15%",
  left: "0%",
  borderRadius: 8,
  maxHeight: "100%",
  backgroundColor: "blue"
})

const $toggleCircleIcon: ThemedStyle<ViewStyle> = () => ({
  width: "55.56%",
  top: 0,
  right: "47.22%",
  left: "-2.78%",
  borderRadius: 12,
  height: 20,
})

const $toggleIconLayout: ThemedStyle<ViewStyle> = () => ({
  maxWidth: "100%",
  position: "absolute",
  overflow: "hidden",
})



const Tag = ({ isActive, isForeground = false }: { isActive: boolean, isForeground?: boolean }) => {
  const { themed } = useAppTheme();
  const mColor = isActive ? "#7674FB" : "#CECED0";

  return (
    <View style={themed($tag)}>
        {isForeground ?? (<TreeIcon size={16} color={mColor}/> )  }
    <Text style={[themed($disconnect), { color: mColor }]} numberOfLines={1}>
        {isForeground ? translate("home:foreground") : ""}
      </Text>
    </View>
  );
};

const $tag: ThemedStyle<ViewStyle> = () => ({
  borderRadius: 15,
  flex: 1,
  width: "100%",
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "flex-start",
  gap: 4,
  height: 16,
});

const $disconnect: ThemedStyle<TextStyle> = () => ({
  fontSize: 13,
  letterSpacing: 0.4,
  lineHeight: 18,
  fontWeight: "700",
  fontFamily: "Inter-Bold",
  color: "#ceced0",
  textAlign: "left",
  overflow: "hidden",
});

export default Tag;
