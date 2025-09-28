import React from "react"
import {View, ViewStyle} from "react-native"
import {Icon} from "@/components/ignite"
import StoreIcon from "assets/icons/navbar/StoreIcon"
import {useAppTheme} from "@/utils/useAppTheme"
import {ThemedStyle} from "@/theme"

interface GetMoreAppsIconProps {
  size?: "small" | "medium" | "large"
  style?: ViewStyle
}

export const GetMoreAppsIcon: React.FC<GetMoreAppsIconProps> = ({size = "medium", style}) => {
  const {themed, theme} = useAppTheme()

  // Size configurations
  const sizeConfig = {
    small: {
      container: 40,
      icon: 24,
      badge: 16,
      plus: 8,
    },
    medium: {
      container: 48,
      icon: 30,
      badge: 18,
      plus: 10,
    },
    large: {
      container: 64,
      icon: 36,
      badge: 20,
      plus: 10,
    },
  }

  const config = sizeConfig[size]

  return (
    <View
      style={[
        themed($container),
        {
          width: config.container,
          height: config.container,
          borderRadius: config.container / 2,
        },
        style,
      ]}>
      <StoreIcon size={config.icon} color={theme.colors.text} />
      <View
        style={[
          themed($plusBadge),
          {
            width: config.badge,
            height: config.badge,
            borderRadius: config.badge / 2,
          },
        ]}>
        <Icon icon="plus" size={config.plus} color="white" />
      </View>
    </View>
  )
}

const $container: ThemedStyle<ViewStyle> = ({colors}) => ({
  backgroundColor: colors.palette.neutral200,
  alignItems: "center",
  justifyContent: "center",
  position: "relative",
})

const $plusBadge: ThemedStyle<ViewStyle> = ({colors}) => ({
  position: "absolute",
  top: -2,
  right: -2,
  backgroundColor: colors.palette.primary500,
  justifyContent: "center",
  alignItems: "center",
  borderWidth: 2,
  borderColor: colors.background,
})
