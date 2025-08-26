import React, {useState, useEffect, useRef, useCallback} from "react"
import {View, Text, TouchableOpacity, ScrollView, ViewStyle, TextStyle, BackHandler, Platform} from "react-native"
import {useRoute} from "@react-navigation/native"
import Icon from "react-native-vector-icons/FontAwesome"
import {useCoreStatus} from "@/contexts/CoreStatusProvider"
import coreCommunicator, {CoreCommunicator} from "@/bridge/CoreCommunicator"
import PairingDeviceInfo from "@/components/misc/PairingDeviceInfo"
import GlassesTroubleshootingModal from "@/components/misc/GlassesTroubleshootingModal"
import GlassesPairingLoader from "@/components/misc/GlassesPairingLoader"
import {getPairingGuide} from "@/utils/getPairingGuide"
import {router} from "expo-router"
import {useAppTheme} from "@/utils/useAppTheme"
import {Screen} from "@/components/ignite/Screen"
import {ThemedStyle} from "@/theme"
import {Header} from "@/components/ignite/Header"
import {PillButton} from "@/components/ignite/PillButton"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import GlobalEventEmitter from "@/utils/GlobalEventEmitter"

export default function GlassesPairingGuideScreen() {
  const {replace, clearHistory} = useNavigationHistory()
  const {status} = useCoreStatus()
  const route = useRoute()
  const {themed} = useAppTheme()
  const {glassesModelName} = route.params as {glassesModelName: string}
  const [showTroubleshootingModal, setShowTroubleshootingModal] = useState(false)
  const [pairingInProgress, setPairingInProgress] = useState(true)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const failureErrorRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasAlertShownRef = useRef(false)
  const backHandlerRef = useRef<any>(null)

  const handleForgetGlasses = useCallback(async () => {
    setPairingInProgress(false)
    await coreCommunicator.sendDisconnectWearable()
    await coreCommunicator.sendForgetSmartGlasses()
    clearHistory()
    router.dismissTo("/pairing/select-glasses-model")
  }, [clearHistory])

  useEffect(() => {
    if (Platform.OS !== "android") return

    const onBackPress = () => {
      handleForgetGlasses()
      return true
    }

    const timeout = setTimeout(() => {
      const backHandler = BackHandler.addEventListener("hardwareBackPress", onBackPress)
      backHandlerRef.current = backHandler
    }, 100)

    return () => {
      clearTimeout(timeout)
      if (backHandlerRef.current) {
        backHandlerRef.current.remove()
        backHandlerRef.current = null
      }
    }
  }, [handleForgetGlasses])

  const handlePairFailure = (error: string) => {
    CoreCommunicator.getInstance().sendForgetSmartGlasses()
    replace("/pairing/failure", {error: error, glassesModelName: glassesModelName})
  }

  useEffect(() => {
    GlobalEventEmitter.on("PAIR_FAILURE", handlePairFailure)
    return () => {
      GlobalEventEmitter.off("PAIR_FAILURE", handlePairFailure)
    }
  }, [])

  useEffect(() => {
    hasAlertShownRef.current = false
    setPairingInProgress(true)

    timerRef.current = setTimeout(() => {
      if (!status.glasses_info?.model_name && !hasAlertShownRef.current) {
        hasAlertShownRef.current = true
      }
    }, 30000)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (failureErrorRef.current) clearTimeout(failureErrorRef.current)
    }
  }, [])

  useEffect(() => {
    if (!status.core_info.puck_connected || !status.glasses_info?.model_name) return

    if (timerRef.current) clearTimeout(timerRef.current)
    if (failureErrorRef.current) clearTimeout(failureErrorRef.current)
    replace("/(tabs)/home")
  }, [status, replace])

  if (pairingInProgress) {
    return (
      <Screen preset="fixed" style={themed($screen)}>
        <Header
          leftIcon="caretLeft"
          onLeftPress={handleForgetGlasses}
          RightActionComponent={
            <PillButton
              text="Help"
              variant="icon"
              onPress={() => setShowTroubleshootingModal(true)}
              buttonStyle={themed($pillButton)}
            />
          }
        />
        <GlassesPairingLoader glassesModelName={glassesModelName} />
        <GlassesTroubleshootingModal
          isVisible={showTroubleshootingModal}
          onClose={() => setShowTroubleshootingModal(false)}
          glassesModelName={glassesModelName}
        />
      </Screen>
    )
  }

  return (
    <Screen preset="fixed" style={themed($screen)}>
      <Header
        leftIcon="caretLeft"
        onLeftPress={handleForgetGlasses}
        RightActionComponent={
          <PillButton
            text="Help"
            variant="icon"
            onPress={() => setShowTroubleshootingModal(true)}
            buttonStyle={themed($pillButton)}
          />
        }
      />
      <ScrollView style={themed($scrollView)}>
        <View style={themed($contentContainer)}>
          <PairingDeviceInfo glassesModelName={glassesModelName} />
          {getPairingGuide(glassesModelName)}
          <TouchableOpacity style={themed($helpButton)} onPress={() => setShowTroubleshootingModal(true)}>
            <Icon name="question-circle" size={16} color="#FFFFFF" style={{marginRight: 8}} />
            <Text style={themed($helpButtonText)}>Need Help Pairing?</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      <GlassesTroubleshootingModal
        isVisible={showTroubleshootingModal}
        onClose={() => setShowTroubleshootingModal(false)}
        glassesModelName={glassesModelName}
      />
    </Screen>
  )
}

const $screen: ThemedStyle<ViewStyle> = ({spacing}) => ({
  paddingHorizontal: spacing.md,
})

const $pillButton: ThemedStyle<ViewStyle> = ({spacing}) => ({
  marginRight: spacing.md,
})

const $scrollView: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $contentContainer: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  justifyContent: "flex-start",
})

const $helpButton: ThemedStyle<ViewStyle> = ({isDark}) => ({
  alignItems: "center",
  borderRadius: 8,
  flexDirection: "row",
  justifyContent: "center",
  marginBottom: 30,
  marginTop: 20,
  paddingHorizontal: 20,
  paddingVertical: 12,
  backgroundColor: isDark ? "#3b82f6" : "#007BFF",
})

const $helpButtonText: ThemedStyle<TextStyle> = ({typography}) => ({
  color: "#FFFFFF",
  fontFamily: typography.primary.normal,
  fontSize: 16,
  fontWeight: "600",
})
