import {HomeContainer} from "@/components/home/HomeContainer"
import {OfflineModeButton} from "@/components/home/OfflineModeButton"
import {OnboardingSpotlight} from "@/components/home/OnboardingSpotlight"
import PermissionsWarning from "@/components/home/PermissionsWarning"
import {Header, Screen} from "@/components/ignite"
import CloudConnection from "@/components/misc/CloudConnection"
import NonProdWarning from "@/components/misc/NonProdWarning"
import SensingDisabledWarning from "@/components/misc/SensingDisabledWarning"
import {translate} from "@/i18n"
import {useRefreshApplets} from "@/stores/applets"
import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"
import {useFocusEffect} from "@react-navigation/native"
import MicIcon from "assets/icons/component/MicIcon"
import {useCallback, useRef, useState} from "react"
import {ScrollView, View, ViewStyle} from "react-native"

export default function Homepage() {
  const [onboardingTarget, setOnboardingTarget] = useState<"glasses" | "livecaptions">("glasses")
  const liveCaptionsRef = useRef<any>(null)
  const connectButtonRef = useRef<any>(null)
  const {themed, theme} = useAppTheme()
  const refreshApplets = useRefreshApplets()

  useFocusEffect(
    useCallback(() => {
      setTimeout(() => {
        refreshApplets()
      }, 1000)
    }, []),
  )

  return (
    <Screen preset="fixed" style={{paddingHorizontal: theme.spacing.md}}>
      <Header
        leftTx="home:title"
        RightActionComponent={
          <View style={themed($headerRight)}>
            <PermissionsWarning />
            <OfflineModeButton />
            <MicIcon width={24} height={24} />
            <NonProdWarning />
          </View>
        }
      />

      <ScrollView contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false}>
        <CloudConnection />
        <SensingDisabledWarning />
        <HomeContainer />
      </ScrollView>

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

const $headerRight: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
})
