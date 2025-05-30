import React, {useMemo, useState, useRef} from "react"
import {View, Text, TouchableOpacity, ScrollView, ViewStyle, TextStyle} from "react-native"
import {useAppStatus} from "@/contexts/AppStatusProvider"
import coreCommunicator from "@/bridge/CoreCommunicator"
import AppIcon from "./AppIcon"
import {useNavigation} from "@react-navigation/native"
import {NavigationProps} from "./types"
import BackendServerComms from "@/backend_comms/BackendServerComms"
import ChevronRight from "assets/icons/ChevronRight"
import EmptyAppsView from "../home/EmptyAppsView"
import ListHeaderActiveApps from "@/components/home/ListHeaderActiveApps"
import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"
import {router} from "expo-router"
import AppsList from "@/components/misc/AppsList"

export default function AppsActiveList() {
  const {appStatus, refreshAppStatus, optimisticallyStopApp, clearPendingOperation} = useAppStatus()
  const backendComms = BackendServerComms.getInstance()
  const [_isLoading, setIsLoading] = useState(false)
  const navigation = useNavigation<NavigationProps>()
  const scrollViewRef = useRef<ScrollView>(null)

  const stopApp = async (packageName: string) => {
    console.log("STOP APP")

    // Optimistically update UI first
    optimisticallyStopApp(packageName)

    setIsLoading(true)
    try {
      await backendComms.stopApp(packageName)
      // Clear the pending operation since it completed successfully
      clearPendingOperation(packageName)
    } catch (error) {
      // On error, refresh from the server to get the accurate state
      refreshAppStatus()
      console.error("Stop app error:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const openAppSettings = (app: any) => {
    router.push({
      pathname: "/tpa/settings",
      params: {
        packageName: app.packageName,
        appName: app.name,
      },
    })
  }

  const runningApps = useMemo(() => appStatus.filter(app => app.is_running), [appStatus])

  const scrollToBottom = () => {
    scrollViewRef.current?.scrollToEnd({animated: true})
  }

  const {themed, theme} = useAppTheme()

  function getNewRow() {
    return (
      <View>
        {runningApps.length > 0 && <ListHeaderActiveApps />}
        <AppsList apps={runningApps} stopApp={stopApp} openAppSettings={openAppSettings} />
        {runningApps.length === 0 && (
          <EmptyAppsView statusMessageKey={"home:noActiveApps"} activeAppsMessageKey={"home:emptyActiveAppListInfo"} />
        )}
      </View>
    )
  }

  return getNewRow()
}

const $appsContainer: ThemedStyle<ViewStyle> = () => ({
  justifyContent: "flex-start",
  marginTop: 8,
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

const $appName: ThemedStyle<TextStyle> = () => ({
  fontSize: 15,
  letterSpacing: 0.6,
  lineHeight: 20,
  fontFamily: "SF Pro Rounded",
  color: "#ced2ed",
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
