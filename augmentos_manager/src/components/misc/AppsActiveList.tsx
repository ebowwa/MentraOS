import React, {useMemo, useState, useRef, useEffect} from "react"
import {View, ScrollView, ViewStyle, TextStyle, Animated, Platform, ToastAndroid, Easing} from "react-native"
import {useAppStatus} from "@/contexts/AppStatusProvider"
import {useNavigation} from "@react-navigation/native"
import {NavigationProps} from "./types"
import BackendServerComms from "@/backend_comms/BackendServerComms"
import ChevronRight from "assets/icons/component/ChevronRight"
import EmptyAppsView from "../home/EmptyAppsView"
import {colors, ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"
import {router} from "expo-router"
import TempActivateAppWindow from "./TempActivateAppWindow"
import {AppListItem} from "./AppListItem"
import Divider from "./Divider"
import {Spacer} from "./Spacer"
import showAlert from "@/utils/AlertUtils"
import Toast from "react-native-toast-message"
import { TruckIcon } from "assets/icons/component/TruckIcon"
import { translate } from "@/i18n"
import AppsHeader from "./AppsHeader"

export default function AppsActiveList({ isSearchPage = false, searchQuery }: { isSearchPage?: boolean; searchQuery?: string }) {
  const {appStatus, refreshAppStatus, optimisticallyStopApp, clearPendingOperation} = useAppStatus()
  const backendComms = BackendServerComms.getInstance()
  const [isLoading, setIsLoading] = useState(false)
  const {themed, theme} = useAppTheme()

  const runningApps = useMemo(() => {
    let apps = appStatus.filter(app => app.is_running)
    if (searchQuery) {
      apps = apps.filter(app => app.name.toLowerCase().includes(searchQuery.toLowerCase()))
    }
    return apps
  }, [appStatus, searchQuery])

  const opacities = useRef<Record<string, Animated.Value>>(
    Object.fromEntries(appStatus.map(app => [app.packageName, new Animated.Value(0)]))
  ).current;

  const containerHeight = useRef(new Animated.Value(0)).current;
  const previousCount = useRef(0);

  useEffect(() => {
    appStatus.forEach(app => {
      if (!(app.packageName in opacities)) {
        opacities[app.packageName] = new Animated.Value(0);
      }

      if (app.is_running) {
        Animated.timing(opacities[app.packageName], {
          toValue: 1,
          duration: 400,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }).start();
      }
    });
  }, [appStatus]);

  useEffect(() => {
    const newCount = runningApps.length;
    if (newCount !== previousCount.current) {
      Animated.timing(containerHeight, {
        toValue: newCount * 88, // estimate item + spacing height
        duration: 400,
        useNativeDriver: false,
      }).start();
      previousCount.current = newCount;
    }
  }, [runningApps.length]);

  const stopApp = async (packageName: string) => {
    console.log("STOP APP")

    // Optimistically update UI first
    optimisticallyStopApp(packageName)

    setIsLoading(true)
    try {
      await backendComms.stopApp(packageName)
      // Clear the pending operation since it completed successfully
      clearPendingOperation(packageName)
      showToast();
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

  function getNewRow() {
    return (
      <View style={themed($appsContainer)}>
        <View style={themed($headerContainer)}>
          {runningApps.length > 0 && 
          !isSearchPage ? 
          <AppsHeader title="home:activeApps"  showSearchIcon = {true}/> 
          : null}
        
        </View>
        <Animated.View style={[themed($contentContainer), { height: containerHeight }]}>
          {runningApps.length > 0 ? (
            <>
              {runningApps.map((app, index) => {
                const itemOpacity = opacities[app.packageName];
                return (
                  <React.Fragment key={app.packageName}>
                    <AppListItem
                      app={app}
                      is_foreground={app.tpaType ==  "standard"}
                      isActive={true}
                      onTogglePress={() => {
                        const pkg = app.packageName;
                        stopApp(pkg).then(() => {
                          Animated.timing(itemOpacity, {
                            toValue: 0,
                            duration: 450,
                            useNativeDriver: true,
                          }).start();
                        });
                      }}
                      onSettingsPress={() => openAppSettings(app)}
                      opacity={itemOpacity}
                      isDisabled={isLoading}
                    />
                    {index < runningApps.length - 1 && (
                      <>
                        <Spacer height={8} />
                        <Divider variant="inset" />
                        <Spacer height={8} />
                      </>
                    )}
                  </React.Fragment>
                );
              })}
            </>
          ) : !isSearchPage ? (
            <>
              <TempActivateAppWindow />
              <EmptyAppsView
                statusMessageKey={"home:noActiveApps"}
                activeAppsMessageKey={"home:emptyActiveAppListInfo"}
              />
            </>
          ) : null}
        </Animated.View>
      </View>
    )
  }

  return getNewRow()
}

const $appsContainer: ThemedStyle<ViewStyle> = () => ({
  justifyContent: "flex-start",
  minHeight: 72,
})

const $headerContainer: ThemedStyle<ViewStyle> = () => ({
})

const $contentContainer: ThemedStyle<ViewStyle> = () => ({
  minHeight: 48,
})
function showToast() {
  Toast.show({
    type: "baseToast",
    text1: translate("home:movedToInactive"),
    position: "bottom",
    props: {
      icon: <TruckIcon  color={colors.icon}/>,
    },
  })
}
