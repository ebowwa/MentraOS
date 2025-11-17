import {Text} from "@/components/ignite"
import {Header} from "@/components/ignite/Header"
import {PillButton} from "@/components/ignite/PillButton"
import {Screen} from "@/components/ignite/Screen"
import GlassesPairingLoader from "@/components/misc/GlassesPairingLoader"
import GlassesTroubleshootingModal from "@/components/misc/GlassesTroubleshootingModal"
import {AudioPairingPrompt} from "@/components/pairing/AudioPairingPrompt"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {useGlassesStore} from "@/stores/glasses"
import {$styles, ThemedStyle} from "@/theme"
import GlobalEventEmitter from "@/utils/GlobalEventEmitter"
import {useAppTheme} from "@/utils/useAppTheme"
import {useRoute} from "@react-navigation/native"
import CoreModule from "core"
import {useEffect, useRef, useState} from "react"
import {BackHandler, Platform, ScrollView, TextStyle, TouchableOpacity, View, ViewStyle} from "react-native"
import Icon from "react-native-vector-icons/FontAwesome"

export default function GlassesPairingGuideScreen() {
  const {replace, clearHistoryAndGoHome, goBack} = useNavigationHistory()
  const route = useRoute()
  const {themed} = useAppTheme()
  const {glassesModelName} = route.params as {glassesModelName: string}
  const [showTroubleshootingModal, setShowTroubleshootingModal] = useState(false)
  const [pairingInProgress, setPairingInProgress] = useState(true)
  const [audioPairingNeeded, setAudioPairingNeeded] = useState(false)
  const [audioDeviceName, setAudioDeviceName] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const failureErrorRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasAlertShownRef = useRef(false)
  const backHandlerRef = useRef<any>(null)
  const glassesConnected = useGlassesStore(state => state.connected)

  useEffect(() => {
    if (Platform.OS !== "android") return

    const onBackPress = () => {
      goBack()
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
  }, [goBack])

  const handlePairFailure = (error: string) => {
    CoreModule.forget()
    replace("/pairing/failure", {error: error, glassesModelName: glassesModelName})
  }

  useEffect(() => {
    GlobalEventEmitter.on("PAIR_FAILURE", handlePairFailure)
    return () => {
      GlobalEventEmitter.off("PAIR_FAILURE", handlePairFailure)
    }
  }, [])

  // Audio pairing event handlers
  // Note: These events are only sent from iOS native code, so no need to gate on Platform.OS
  useEffect(() => {
    const handleAudioPairingNeeded = (data: {deviceName: string}) => {
      console.log("Audio pairing needed:", data.deviceName)
      setAudioPairingNeeded(true)
      setAudioDeviceName(data.deviceName)
      setPairingInProgress(false)
    }

    const handleAudioConnected = (data: {deviceName: string}) => {
      console.log("Audio connected:", data.deviceName)
      setAudioPairingNeeded(false)
      // Continue to home after audio is connected
      clearHistoryAndGoHome()
    }

    GlobalEventEmitter.on("AUDIO_PAIRING_NEEDED", handleAudioPairingNeeded)
    GlobalEventEmitter.on("AUDIO_CONNECTED", handleAudioConnected)

    return () => {
      GlobalEventEmitter.off("AUDIO_PAIRING_NEEDED", handleAudioPairingNeeded)
      GlobalEventEmitter.off("AUDIO_CONNECTED", handleAudioConnected)
    }
  }, [replace])

  useEffect(() => {
    hasAlertShownRef.current = false
    setPairingInProgress(true)

    timerRef.current = setTimeout(() => {
      if (!glassesConnected && !hasAlertShownRef.current) {
        hasAlertShownRef.current = true
      }
    }, 30000)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (failureErrorRef.current) clearTimeout(failureErrorRef.current)
    }
  }, [])

  useEffect(() => {
    if (!glassesConnected) return

    // Don't navigate to home if we're waiting for audio pairing
    if (audioPairingNeeded) return

    if (timerRef.current) clearTimeout(timerRef.current)
    if (failureErrorRef.current) clearTimeout(failureErrorRef.current)
    clearHistoryAndGoHome()
  }, [glassesConnected, clearHistoryAndGoHome, audioPairingNeeded])

  if (pairingInProgress) {
    return (
      <Screen preset="fixed" style={themed($styles.screen)}>
        <Header
          leftIcon="chevron-left"
          onLeftPress={goBack}
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

  // Show audio pairing prompt if needed
  // Note: This will only trigger on iOS since the events are only sent from iOS native code
  if (audioPairingNeeded && audioDeviceName) {
    return (
      <Screen preset="fixed" style={themed($styles.screen)}>
        <Header
          leftIcon="chevron-left"
          onLeftPress={goBack}
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
            <AudioPairingPrompt
              deviceName={audioDeviceName}
              onSkip={() => {
                setAudioPairingNeeded(false)
                clearHistoryAndGoHome()
              }}
            />
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

  return (
    <Screen preset="fixed" style={themed($screen)}>
      <Header
        leftIcon="chevron-left"
        onLeftPress={goBack}
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
  paddingHorizontal: spacing.s4,
})

const $pillButton: ThemedStyle<ViewStyle> = ({spacing}) => ({
  marginRight: spacing.s4,
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
