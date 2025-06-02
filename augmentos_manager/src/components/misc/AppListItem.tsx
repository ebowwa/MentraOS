import React from "react"
import {View, Text, TouchableOpacity, ViewStyle, TextStyle} from "react-native"
import {useAppTheme} from "@/utils/useAppTheme"
import {colors, ThemedStyle} from "@/theme"
import AppIcon from "./AppIcon"
import ChevronRight from "assets/icons/component/ChevronRight"
import SunIcon from "assets/icons/component/SunIcon"
import {TreeIcon} from "assets/icons/component/TreeIcon"
import {translate} from "@/i18n"
import {Switch} from "@/components/ignite"

interface AppModel {
  name: string
  packageName: string
  is_foreground?: boolean
}

interface AppListItemProps {
  app: AppModel
  isActive: boolean
  onTogglePress: () => void
  onSettingsPress: () => void
  refProp?: React.Ref<any>
  is_foreground?: boolean
}

export const AppListItem = ({app, isActive, onTogglePress, onSettingsPress}: AppListItemProps) => {
  const {themed, theme} = useAppTheme()


  return (
    <View style={[themed($everything), themed($everythingFlexBox)]}>
      <View style={[themed($appDescription), themed($everythingFlexBox)]}>
        <AppIcon app={app} isForegroundApp={app.is_foreground} style={themed($appIcon)} />
        <View style={themed($appNameWrapper)}>
          <Text 
            style={[themed($appName), isActive ? themed($activeApp) : themed($inactiveApp)]} 
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {app.name}
          </Text>
          {/*app.is_foreground && <Tag isActive={isActive} isForeground={app.is_foreground} />*/}
        </View>
      </View>

      <View style={[themed($toggleParent), themed($everythingFlexBox)]}>
        <Switch value={isActive} onValueChange={onTogglePress} />
        <TouchableOpacity onPress={onSettingsPress} hitSlop={10}>
          <ChevronRight color={theme.colors.text} />
        </TouchableOpacity>
      </View>
    </View>
  )
}

const $activeApp: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.text,
  // "#F7F7F7" : "#CED2ED"
})

const $inactiveApp: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.textDim,
})

const $everything: ThemedStyle<ViewStyle> = () => ({
  justifyContent: "space-between",
  gap: 0,
  alignSelf: "stretch",
  height: 72,
})

const $everythingFlexBox: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  alignItems: "center",
})

const $appDescription: ThemedStyle<ViewStyle> = () => ({
  gap: 17,
  justifyContent: "center",
  flex: 1,
})

const $appIcon: ThemedStyle<ViewStyle> = () => ({
  width: 48,
  height: 48,
})

const $appNameWrapper: ThemedStyle<ViewStyle> = () => ({
  justifyContent: "center",
  flex: 1,
  marginRight: 16,
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



const Tag = ({isActive, isForeground = false}: {isActive: boolean; isForeground?: boolean}) => {
  const {themed} = useAppTheme()
  const mColor = isActive ? "#7674FB" : "#CECED0"

  return (
    <View style={themed($tag)}>
      {isForeground ?? <TreeIcon size={16} color={mColor} />}
      <Text style={[themed($disconnect), {color: mColor}]} numberOfLines={1}>
        {isForeground ? translate("home:foreground") : ""}
      </Text>
    </View>
  )
}

const $tag: ThemedStyle<ViewStyle> = () => ({
  borderRadius: 15,
  flex: 1,
  width: "100%",
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "flex-start",
  gap: 4,
  height: 16,
})

const $disconnect: ThemedStyle<TextStyle> = () => ({
  fontSize: 13,
  letterSpacing: 0.4,
  lineHeight: 18,
  fontWeight: "700",
  fontFamily: "Inter-Bold",
  color: "#ceced0",
  textAlign: "left",
  overflow: "hidden",
})

export default Tag
