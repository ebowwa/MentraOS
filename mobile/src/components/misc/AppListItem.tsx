import React from "react"
import {View, TouchableOpacity, ViewStyle, TextStyle, Animated, Pressable} from "react-native"
import {useAppTheme} from "@/utils/useAppTheme"
import {colors, ThemedStyle} from "@/theme"
import AppIcon from "./AppIcon"
import ChevronRight from "assets/icons/component/ChevronRight"
import SunIcon from "assets/icons/component/SunIcon"
import {TreeIcon} from "assets/icons/component/TreeIcon"
import {translate} from "@/i18n"
import {Switch, Text} from "@/components/ignite"
import {TooltipIcon} from "assets/icons/component/TooltipIcon"
import Toast from "react-native-toast-message"
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons"

interface AppModel {
  name: string
  packageName: string
  type: string
  isOnline?: boolean | null
  compatibility?: {
    isCompatible: boolean
    message?: string
  }
}

interface AppListItemProps {
  app: AppModel
  isActive: boolean
  onTogglePress: () => void
  onSettingsPress: () => void
  refProp?: React.Ref<any>
  opacity?: Animated.AnimatedValue
  height?: Animated.AnimatedValue
  isDisabled?: boolean
  isIncompatible?: boolean
}

export const AppListItem = ({
  app,
  isActive,
  onTogglePress,
  onSettingsPress,
  refProp,
  opacity,
  isDisabled,
  height,
  isIncompatible,
}: AppListItemProps) => {
  const {themed, theme} = useAppTheme()

  return (
    <Animated.View
      ref={refProp}
      style={[
        themed($everything),
        themed($everythingFlexBox),
        opacity ? {opacity} : {},
        height
          ? {
              height: height.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 72],
              }),
              overflow: "hidden",
            }
          : {},
      ]}>
      <TouchableOpacity
        style={[themed($appDescription), themed($everythingFlexBox)]}
        onPress={onSettingsPress}
        disabled={isDisabled}
        activeOpacity={0.7}>
        <AppIcon app={app as any} style={themed($appIcon)} />
        <View style={themed($appNameWrapper)}>
          <Text
            text={app.name}
            style={[
              themed($appName),
              isActive ? themed($activeApp) : themed($inactiveApp),
              isIncompatible && themed($incompatibleApp),
              app.isOnline === false && themed($offlineApp),
            ]}
            numberOfLines={1}
            ellipsizeMode="tail"
          />
          {app.isOnline === false && (
            <View style={themed($offlineRow)}>
              <MaterialCommunityIcons name="alert-circle" size={14} color={theme.colors.error} />
              <Text text={"Offline"} style={themed($offlineRowText)} />
            </View>
          )}
          <Tag isActive={isActive} isForeground={app.type == "standard"} isIncompatible={isIncompatible} />
        </View>
      </TouchableOpacity>

      <View style={[themed($toggleParent), themed($everythingFlexBox)]}>
        {isIncompatible ? (
          <TouchableOpacity onPress={onTogglePress} activeOpacity={0.7}>
            <TooltipIcon size={20} color={theme.colors.error} />
          </TouchableOpacity>
        ) : (
          <Switch value={isActive} onValueChange={onTogglePress} hitSlop={{left: 48, right: 16, top: 24, bottom: 24}} />
        )}
      </View>
    </Animated.View>
  )
}

const $activeApp: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.text,
  // "#F7F7F7" : "#CED2ED"
})

const $inactiveApp: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.text,
})

const $incompatibleApp: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.textDim,
  opacity: 0.7,
})

const $offlineApp: ThemedStyle<TextStyle> = () => ({
  textDecorationLine: "line-through",
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
  textAlign: "left",
  overflow: "hidden",
})

const $offlineRow: ThemedStyle<ViewStyle> = ({spacing}) => ({
  marginTop: 2,
  flexDirection: "row",
  alignItems: "center",
  gap: 6,
})

const $offlineRowText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 12,
  color: colors.error,
})

const $toggleParent: ThemedStyle<ViewStyle> = () => ({
  gap: 12,
})

const $chevronHitbox: ThemedStyle<ViewStyle> = () => ({
  padding: 8,
  margin: -8,
})

const Tag = ({
  isActive,
  isForeground = false,
  isIncompatible = false,
}: {
  isActive: boolean
  isForeground?: boolean
  isIncompatible?: boolean
}) => {
  const {themed, theme} = useAppTheme()
  const mColor = isActive ? theme.colors.text : theme.colors.textDim

  if (isIncompatible) {
    return null
  }

  if (!isForeground) {
    return null
  }

  return (
    <View style={themed(isActive ? $tagActive : $tag)}>
      <TreeIcon size={16} color={mColor} />
      <Text
        text={isForeground ? translate("home:foreground") : ""}
        style={[themed($disconnect), {color: mColor}]}
        numberOfLines={1}
      />
      <Pressable
        onPress={() => {
          Toast.show({
            type: "baseToast",
            text1: "Not implemented",
            position: "bottom",
          })
        }}></Pressable>
    </View>
  )
}
const $tagActive: ThemedStyle<ViewStyle> = ({colors}) => {
  return {
    borderRadius: 15,
    paddingHorizontal: 8,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 4,
    minHeight: 28,
    backgroundColor: colors.tagBackground,
    alignSelf: "flex-start",
  }
}

const $tag: ThemedStyle<ViewStyle> = () => ({
  borderRadius: 15,
  paddingVertical: 6,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "flex-start",
  gap: 4,
  minHeight: 28,
  alignSelf: "flex-start",
})

const $disconnect: ThemedStyle<TextStyle> = () => ({
  fontSize: 13,
  letterSpacing: 0.4,
  lineHeight: 16,
  fontWeight: "700",
  color: "#ceced0",
  textAlign: "left",
})

export default Tag
