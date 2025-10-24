import {Text} from "@/components/ignite"
import {translate} from "@/i18n"
import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"
import SolarLineIconsSet4 from "assets/icons/component/SolarLineIconsSet4"
import HomeIcon from "assets/icons/navbar/HomeIcon"
import StoreIcon from "assets/icons/navbar/StoreIcon"
import UserIcon from "assets/icons/navbar/UserIcon"
import {TabList, Tabs, TabSlot, TabTrigger, TabTriggerSlotProps} from "expo-router/ui"
import {Pressable, TextStyle, ViewStyle} from "react-native"
import {useSafeAreaInsets} from "react-native-safe-area-context"

type TabButtonProps = TabTriggerSlotProps & {
  icon: React.ComponentType<{size: number; color: string}>
  label: string
}

export default function Layout() {
  const {theme, themed} = useAppTheme()
  const {bottom} = useSafeAreaInsets()

  function TabButton({icon: Icon, isFocused, label, ...props}: TabButtonProps) {
    const iconColor = isFocused ? theme.colors.primary : theme.colors.textDim
    const textColor = isFocused ? theme.colors.text : theme.colors.textDim
    return (
      <Pressable {...props} style={[themed($tabButton), {marginBottom: bottom}]}>
        <Icon size={28} color={iconColor} />
        <Text text={label} style={[themed($tabLabel), {color: textColor}]} />
      </Pressable>
    )
  }

  // if (Platform.OS === "ios") {
  //   return (
  //     <NativeTabs minimizeBehavior="onScrollDown" disableTransparentOnScrollEdge>
  //       <NativeTabs.Trigger name="home">
  //         <Label>{translate("navigation:home")}</Label>
  //         <Icon sf="house.fill" drawable="custom_android_drawable" />
  //       </NativeTabs.Trigger>
  //       <NativeTabs.Trigger name="glasses">
  //         <Icon sf="sunglasses.fill" drawable="custom_settings_drawable" />
  //         <Label>{translate("navigation:glasses")}</Label>
  //       </NativeTabs.Trigger>
  //       <NativeTabs.Trigger name="store">
  //         <Icon sf="cart.fill" drawable="custom_settings_drawable" />
  //         <Label>{translate("navigation:store")}</Label>
  //       </NativeTabs.Trigger>
  //       <NativeTabs.Trigger name="settings">
  //         <Icon sf="gear" drawable="custom_settings_drawable" />
  //         <Label>{translate("navigation:account")}</Label>
  //       </NativeTabs.Trigger>
  //     </NativeTabs>
  //   )
  // }

  return (
    <Tabs>
      <TabSlot />
      <TabList style={themed($tabList)}>
        <TabTrigger name="home" href="/home" style={themed($tabTrigger)} asChild>
          <TabButton icon={HomeIcon} label={translate("navigation:home")} />
        </TabTrigger>
        <TabTrigger name="glasses" href="/glasses" style={themed($tabTrigger)} asChild>
          <TabButton icon={SolarLineIconsSet4} label={translate("navigation:glasses")} />
        </TabTrigger>
        <TabTrigger name="store" href="/store" style={themed($tabTrigger)} asChild>
          <TabButton icon={StoreIcon} label={translate("navigation:store")} />
        </TabTrigger>
        <TabTrigger name="settings" href="/settings" style={themed($tabTrigger)} asChild>
          <TabButton icon={UserIcon} label={translate("navigation:account")} />
        </TabTrigger>
      </TabList>
    </Tabs>
  )
}

const $tabList: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  flexDirection: "row",
  backgroundColor: colors.backgroundStart + "cc",
  position: "absolute",
  bottom: 0,
  borderTopColor: colors.separator,
  paddingVertical: spacing.xs,
  paddingHorizontal: spacing.sm,
})

const $tabTrigger: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  alignItems: "center",
  justifyContent: "center",
  paddingVertical: spacing.xs,
})

const $tabLabel: ThemedStyle<TextStyle> = ({typography}) => ({
  fontSize: 12,
  fontFamily: typography.primary.medium,
})

const $tabButton: ThemedStyle<ViewStyle> = ({spacing}) => ({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  flexDirection: "column",
  gap: spacing.xxs,
  flex: 1,
})
