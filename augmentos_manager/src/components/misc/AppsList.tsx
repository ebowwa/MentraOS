import {AppInterface} from "@/contexts/AppStatusProvider"
import {TextStyle, TouchableOpacity, View, ViewStyle} from "react-native"
import AppIcon from "./AppIcon"
import {useAppTheme} from "@/utils/useAppTheme"
import ChevronRight from "assets/icons/ChevronRight"
import {ThemedStyle} from "@/theme"
import React from "react"
import {Text} from "@/components/ignite"

interface AppsListProps {
  apps: AppInterface[]
  stopApp?: (packageName: string) => void
  startApp?: (packageName: string) => void
  openAppSettings: (app: AppInterface) => void
}

export default function AppsList({apps, stopApp, startApp, openAppSettings}: AppsListProps) {
  const {themed} = useAppTheme()
  
  if (apps.length == 0) {
    return null
  }


  if (stopApp) {
    return (
      <View style={themed($listContainer)}>
        {apps.map((app, index) => (
          <View style={[themed($everything), themed($everythingFlexBox)]} key={index}>
            <View style={[themed($appDescription), themed($everythingFlexBox)]}>
              <AppIcon app={app} isForegroundApp={app.is_foreground} style={themed($appIcon)} />
              <View style={themed($appNameWrapper)}>
                <Text style={themed($appName)} numberOfLines={1}>
                  {app.name}
                </Text>
              </View>
            </View>
            <View style={[themed($toggleParent), themed($everythingFlexBox)]}>
              <TouchableOpacity
                onPress={() => stopApp(app.packageName)}
                onLongPress={() => openAppSettings(app)}
                delayLongPress={500}
                style={{padding: 10, borderRadius: 20}}>
                <View style={themed($toggle)}>
                  <View style={[themed($toggleBarIcon), themed($toggleIconLayout), {backgroundColor: "#565E8C"}]} />
                  <View style={[themed($toggleCircleIcon), themed($toggleIconLayout), {left: "44.44%"}]}>
                    <View style={{flex: 1, borderRadius: 12, backgroundColor: "#CED2ED"}} />
                  </View>
                </View>
              </TouchableOpacity>
              <TouchableOpacity hitSlop={10} onPress={() => openAppSettings(app)}>
                <ChevronRight />
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>
    )
  }

  if (startApp) {
    return (
      <View style={themed($listContainer)}>
        {apps.map((app, index) => (
          <View style={[themed($everything), themed($everythingFlexBox)]} key={index}>
            <View style={[themed($appDescription), themed($everythingFlexBox)]}>
              <AppIcon app={app} isForegroundApp={app.is_foreground} style={themed($appIcon)} />
              <View style={themed($appNameWrapper)}>
                <Text style={themed($appName)} numberOfLines={1}>
                  {app.name}
                </Text>
              </View>
            </View>
            <View style={[themed($toggleParent), themed($everythingFlexBox)]}>
              <TouchableOpacity
                onPress={() => startApp(app.packageName)}
                onLongPress={() => openAppSettings(app)}
                delayLongPress={500}
                style={{padding: 10, borderRadius: 20}}>
                <View style={themed($toggle)}>
                  <View style={[themed($toggleBarIcon), themed($toggleIconLayout), {backgroundColor: "#565E8C"}]} />
                  <View style={[themed($toggleCircleIcon), themed($toggleIconLayout), {left: "-2.78%"}]}>
                    <View style={{flex: 1, borderRadius: 12, backgroundColor: "#CED2ED"}} />
                  </View>
                </View>
              </TouchableOpacity>
              <TouchableOpacity hitSlop={10} onPress={() => openAppSettings(app)}>
                <ChevronRight />
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>
    )
  }

  // if (startApp) {
  //   return (
  //     <View style={[themed($everything), themed($everythingFlexBox)]} key={index}>
  //     <View style={[themed($appDescription), themed($everythingFlexBox)]}>
  //       <AppIcon app={app} isForegroundApp={app.is_foreground} style={themed($appIcon)} />
  //       <View style={themed($appNameWrapper)}>
  //         <Text style={themed($appName)} numberOfLines={1}>
  //           {app.name}
  //         </Text>
  //       </View>
  //     </View>
  //     <View style={[themed($toggleParent), themed($everythingFlexBox)]}>
  //       <TouchableOpacity
  //         onPress={() => stopApp(app.packageName)}
  //         onLongPress={() => openAppSettings(app)}
  //         delayLongPress={500}
  //         style={{padding: 10, borderRadius: 20}}>
  //         <View style={themed($toggle)}>
  //           <View style={[themed($toggleBarIcon), themed($toggleIconLayout), {backgroundColor: "#565E8C"}]} />
  //           <View style={[themed($toggleCircleIcon), themed($toggleIconLayout), {left: "44.44%"}]}>
  //             <View style={{flex: 1, borderRadius: 12, backgroundColor: "#CED2ED"}} />
  //           </View>
  //         </View>
  //       </TouchableOpacity>
  //       <TouchableOpacity hitSlop={10} onPress={() => openAppSettings(app)}>
  //         <ChevronRight />
  //       </TouchableOpacity>
  //       </View>
  //     </View>
  // )
}

const $listContainer: ThemedStyle<ViewStyle> = () => ({
  gap: 16,
})

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

const $appName: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 15,
  letterSpacing: 0.6,
  lineHeight: 20,
  fontFamily: "SF Pro Rounded",
  // color: "#ced2ed",
  color: colors.text,
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
