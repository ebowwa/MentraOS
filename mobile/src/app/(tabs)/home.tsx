import React, {useRef, useCallback, PropsWithChildren, useState, useEffect} from "react"
import {View, Animated, Platform, ViewStyle, ScrollView, TouchableOpacity} from "react-native"
import {useFocusEffect} from "@react-navigation/native"
import {Header, Screen} from "@/components/ignite"
import AppsActiveList from "@/components/misc/AppsActiveList"
import AppsInactiveList from "@/components/misc/AppsInactiveList"
import AppsIncompatibleList from "@/components/misc/AppsIncompatibleList"
import AppsIncompatibleListOld from "@/components/misc/AppsIncompatibleListOld"
import {useAppStatus} from "@/contexts/AppletStatusProvider"
import CloudConnection from "@/components/misc/CloudConnection"
import SensingDisabledWarning from "@/components/misc/SensingDisabledWarning"
import NonProdWarning from "@/components/misc/NonProdWarning"
import {spacing, ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"
import MicIcon from "assets/icons/component/MicIcon"
import NotificationOn from "assets/icons/component/NotificationOn"
import {ConnectDeviceButton, ConnectedGlasses, DeviceToolbar} from "@/components/misc/ConnectedDeviceInfo"
import {Spacer} from "@/components/misc/Spacer"
import Divider from "@/components/misc/Divider"
import {OnboardingSpotlight} from "@/components/misc/OnboardingSpotlight"
import {translate} from "@/i18n"
import {loadSetting, saveSetting} from "@/utils/SettingsHelper"
import {SETTINGS_KEYS} from "@/utils/SettingsHelper"
import bridge from "@/bridge/MantleBridge"
import {AppsCombinedGridView} from "@/components/misc/AppsCombinedGridView"
import {AppsOfflineList} from "@/components/misc/AppsOfflineList"
import {OfflineModeButton} from "@/components/misc/OfflineModeButton"
import PermissionsWarning from "@/components/home/PermissionsWarning"
import {Reconnect, OtaUpdateChecker} from "@/components/utils/utils"

export default function Homepage() {
  const {refreshAppStatus, stopAllApps} = useAppStatus()
  const [onboardingTarget, setOnboardingTarget] = useState<"glasses" | "livecaptions">("glasses")
  const liveCaptionsRef = useRef<any>(null)
  const connectButtonRef = useRef<any>(null)
  const {themed, theme} = useAppTheme()
  const [hasLoaded, setHasLoaded] = useState(false)

  const [showNewUi, setShowNewUi] = useState(false)
  const [isOfflineMode, setIsOfflineMode] = useState(false)

  const handleToggleOfflineMode = useCallback(async (newIsOfflineMode: boolean) => {
    if (newIsOfflineMode) {
      // If enabling offline mode, stop all running apps
      await stopAllApps()
    } else {
      // If disabling offline mode, turn off offline captions
      await bridge.toggleOfflineApps(false)
      await saveSetting(SETTINGS_KEYS.offline_captions_app_running, false)
    }
    await saveSetting(SETTINGS_KEYS.OFFLINE_MODE, newIsOfflineMode)
    setIsOfflineMode(newIsOfflineMode)
  }, [stopAllApps])

  useEffect(() => {
    const check = async () => {
      const newUiSetting = await loadSetting(SETTINGS_KEYS.NEW_UI, false)
      setShowNewUi(newUiSetting)
      const offlineModeSetting = await loadSetting(SETTINGS_KEYS.OFFLINE_MODE, false)
      setIsOfflineMode(offlineModeSetting)
      setHasLoaded(true)
    }
    check()
  }, [])

  useFocusEffect(
    useCallback(() => {
      refreshAppStatus()
    }, []),
  )

  if (!hasLoaded) {
    return (
      <Screen preset="fixed" style={themed($screen)}>
        <Header
          leftTx="home:title"
          RightActionComponent={
            <View style={themed($headerRight)}>
              <PermissionsWarning />
              <MicIcon width={24} height={24} />
              <NonProdWarning />
            </View>
          }
        />
      </Screen>
    )
  }

  if (showNewUi) {
    return (
      <Screen preset="fixed" style={themed($screen)}>
        <Header
          leftTx="home:title"
          RightActionComponent={
            <View style={themed($headerRight)}>
              <PermissionsWarning />
              <MicIcon width={24} height={24} />
              <NonProdWarning />
            </View>
          }
        />

        <CloudConnection />
        <SensingDisabledWarning />
        <View>
          <ConnectedGlasses showTitle={false} />
          <DeviceToolbar />
        </View>
        <Spacer height={theme.spacing.lg} />
        <View ref={connectButtonRef}>
          <ConnectDeviceButton />
        </View>
        <Spacer height={theme.spacing.md} />
        
        {isOfflineMode ? (
          <AppsOfflineList />
        ) : (
          <AppsCombinedGridView />
        )}

        <OnboardingSpotlight
          targetRef={onboardingTarget === "glasses" ? connectButtonRef : liveCaptionsRef}
          setOnboardingTarget={setOnboardingTarget}
          onboardingTarget={onboardingTarget}
          message={
            onboardingTarget === "glasses"
              ? translate("home:connectGlassesToStart")
              : translate("home:tapToStartLiveCaptions")
          }
        />
      </Screen>
    )
  }

  return (
    <Screen preset="fixed" style={themed($screen)}>
      <Header
        leftTx="home:title"
        RightActionComponent={
          <View style={themed($headerRight)}>
            <PermissionsWarning />
            <OfflineModeButton 
              isOfflineMode={isOfflineMode} 
              onToggle={handleToggleOfflineMode} 
            />
            <MicIcon width={24} height={24} />
            <NonProdWarning />
          </View>
        }
      />

      <CloudConnection />
      <ScrollView
        style={{marginRight: -theme.spacing.md, paddingRight: theme.spacing.md}}
        contentInsetAdjustmentBehavior="automatic">
        <SensingDisabledWarning />

        <ConnectedGlasses showTitle={false} />
        <DeviceToolbar />
        <Spacer height={theme.spacing.md} />
        <View ref={connectButtonRef}>
          <ConnectDeviceButton />
        </View>
        <Spacer height={theme.spacing.lg} />
        
        <Divider variant="full" />
        <Spacer height={theme.spacing.md} />

        {isOfflineMode ? (
          <AppsOfflineList />
        ) : (
          <>
            <AppsActiveList />
            <Spacer height={spacing.xl} />
            <AppsInactiveList liveCaptionsRef={liveCaptionsRef} />
            <Spacer height={spacing.md} />
            <AppsIncompatibleListOld />
            <Spacer height={spacing.xl} />
          </>
        )}
      </ScrollView>

      <Reconnect />
      <OtaUpdateChecker />

      <OnboardingSpotlight
        targetRef={onboardingTarget === "glasses" ? connectButtonRef : liveCaptionsRef}
        setOnboardingTarget={setOnboardingTarget}
        onboardingTarget={onboardingTarget}
        message={
          onboardingTarget === "glasses"
            ? translate("home:connectGlassesToStart")
            : translate("home:tapToStartLiveCaptions")
        }
      />
    </Screen>
  )
}

const $screen: ThemedStyle<ViewStyle> = ({spacing}) => ({
  paddingHorizontal: spacing.lg,
})

const $headerRight: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
})
