import React, {useMemo, useState, useRef} from "react"
import {View, ScrollView} from "react-native"
import {useAppStatus} from "@/contexts/AppStatusProvider"
import BackendServerComms from "@/backend_comms/BackendServerComms"
import ListHeaderActiveApps from "@/components/home/ListHeaderActiveApps"
import {useAppTheme} from "@/utils/useAppTheme"
import {router} from "expo-router"
import AppsList from "@/components/misc/AppsList"
import TempActivateAppWindow from "@/components/misc/TempActivateAppWindow"

export default function AppsActiveList() {
  const {appStatus, refreshAppStatus, optimisticallyStopApp, clearPendingOperation} = useAppStatus()
  const backendComms = BackendServerComms.getInstance()
  const [_isLoading, setIsLoading] = useState(false)
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


  const {themed, theme} = useAppTheme()

  function getNewRow() {
    return (
      <View>
        {runningApps.length > 0 && <ListHeaderActiveApps />}
        <AppsList apps={runningApps} stopApp={stopApp} openAppSettings={openAppSettings} />
        {runningApps.length === 0 && (
          <>
            <TempActivateAppWindow />
          </>
        )}
      </View>
    )
  }

  return getNewRow()
}











