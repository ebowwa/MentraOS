import React, {useMemo, useState, useRef} from "react"
import {View, ScrollView, ViewStyle, TextStyle} from "react-native"
import {useAppStatus} from "@/contexts/AppStatusProvider"
import {useNavigation} from "@react-navigation/native"
import {NavigationProps} from "./types"
import BackendServerComms from "@/backend_comms/BackendServerComms"
import ChevronRight from "assets/icons/component/ChevronRight"
import EmptyAppsView from "../home/EmptyAppsView"
import ListHeaderActiveApps from "@/components/home/ListHeaderActiveApps"
import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"
import {router} from "expo-router"
import TempActivateAppWindow from "./TempActivateAppWindow"
import {AppListItem} from "./AppListItem"
import Divider from "./Divider"
import {Spacer} from "./Spacer"

export default function AppsActiveList() {
  const {appStatus, refreshAppStatus, optimisticallyStopApp, clearPendingOperation} = useAppStatus()
  const backendComms = BackendServerComms.getInstance()
  const [isLoading, setIsLoading] = useState(false)
  const {themed, theme} = useAppTheme()

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

  function getNewRow() {
    return (
      <View style={themed($appsContainer)}>
        <View style={themed($headerContainer)}>
          {runningApps.length > 0 ? <ListHeaderActiveApps /> : null}
        </View>
        <View style={themed($contentContainer)}>
          {runningApps.length > 0 ? (
            <>
              {runningApps.map((app, index) => (
                <React.Fragment key={app.packageName}>
                  <AppListItem
                    app={app}
                    is_foreground={app.is_foreground}
                    isActive={true}
                    onTogglePress={() => stopApp(app.packageName)}
                    onSettingsPress={() => openAppSettings(app)}
                  />
                  {index < runningApps.length - 1 && (
                    <>
                      <Spacer height={8} />
                      <Divider variant="inset" />
                      <Spacer height={8} />
                    </>
                  )}
                </React.Fragment>
              ))}
            </>
          ) : (
            <>
              <TempActivateAppWindow />
              <EmptyAppsView
                statusMessageKey={"home:noActiveApps"}
                activeAppsMessageKey={"home:emptyActiveAppListInfo"}
              />
            </>
          )}
        </View>
      </View>
    )
  }

  return getNewRow()
}

const $appsContainer: ThemedStyle<ViewStyle> = () => ({
  justifyContent: "flex-start",
  marginTop: 8,
  minHeight: 72,
})

const $headerContainer: ThemedStyle<ViewStyle> = () => ({
  minHeight: 32,
})

const $contentContainer: ThemedStyle<ViewStyle> = () => ({
  minHeight: 48,
})
