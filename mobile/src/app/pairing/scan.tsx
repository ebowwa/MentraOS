import {Button, Header, Screen, Text} from "@/components/ignite"
import {PillButton} from "@/components/ignite/PillButton"
import GlassesTroubleshootingModal from "@/components/misc/GlassesTroubleshootingModal"
import Divider from "@/components/ui/Divider"
import {Group} from "@/components/ui/Group"
import {Spacer} from "@/components/ui/Spacer"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {SearchResultDevice, useSearchResults} from "@/contexts/SearchResultsContext"
import {translate} from "@/i18n"
import {useGlassesStore} from "@/stores/glasses"
import {SETTINGS_KEYS, useSettingsStore} from "@/stores/settings"
import {$styles, ThemedStyle} from "@/theme"
import showAlert from "@/utils/AlertUtils"
import {MOCK_CONNECTION} from "@/utils/Constants"
import {getGlassesOpenImage} from "@/utils/getGlassesImage"
import GlobalEventEmitter from "@/utils/GlobalEventEmitter"
import {PermissionFeatures, requestFeaturePermissions} from "@/utils/PermissionsUtils"
import {useAppTheme} from "@/utils/useAppTheme"
import {useFocusEffect} from "@react-navigation/native"
import CoreModule from "core"
import {router, useLocalSearchParams} from "expo-router"
import {useCallback, useEffect, useRef, useState} from "react"
import {
  ActivityIndicator,
  BackHandler,
  Image,
  ImageStyle,
  Platform,
  ScrollView,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native"
import {useSharedValue, withDelay, withTiming} from "react-native-reanimated"
import Icon from "react-native-vector-icons/FontAwesome"

export default function SelectGlassesBluetoothScreen() {
  const {searchResults, setSearchResults} = useSearchResults()
  const {glassesModelName}: {glassesModelName: string} = useLocalSearchParams()
  const {theme, themed} = useAppTheme()
  const {goBack, replace, clearHistoryAndGoHome} = useNavigationHistory()
  const [showTroubleshootingModal, setShowTroubleshootingModal] = useState(false)
  // Create a ref to track the current state of searchResults
  const searchResultsRef = useRef<SearchResultDevice[]>(searchResults)
  const glassesConnected = useGlassesStore(state => state.connected)

  const scrollViewOpacity = useSharedValue(0)
  useEffect(() => {
    scrollViewOpacity.value = withDelay(2000, withTiming(1, {duration: 1000}))
  }, [])

  // Keep the ref updated whenever searchResults changes
  useEffect(() => {
    searchResultsRef.current = searchResults
  }, [searchResults])

  // Clear search results when screen comes into focus to prevent stale data
  useFocusEffect(
    useCallback(() => {
      setSearchResults([])
    }, [setSearchResults]),
  )

  // Handle Android hardware back button
  useEffect(() => {
    // Only handle on Android
    if (Platform.OS !== "android") return

    const onBackPress = () => {
      // Call our custom back handler
      goBack()
      // Return true to prevent default back behavior and stop propagation
      return true
    }

    // Use setTimeout to ensure our handler is registered after NavigationHistoryContext
    const timeout = setTimeout(() => {
      // Add the event listener - this will be on top of the stack
      const backHandler = BackHandler.addEventListener("hardwareBackPress", onBackPress)

      // Store the handler for cleanup
      backHandlerRef.current = backHandler
    }, 100)

    // Cleanup function
    return () => {
      clearTimeout(timeout)
      if (backHandlerRef.current) {
        backHandlerRef.current.remove()
        backHandlerRef.current = null
      }
    }
  }, [goBack])

  // Ref to store the back handler for cleanup
  const backHandlerRef = useRef<any>(null)

  useEffect(() => {
    const handleSearchResult = ({
      modelName,
      deviceName,
      deviceAddress,
    }: {
      modelName: string
      deviceName: string
      deviceAddress: string
    }) => {
      // console.log("GOT SOME SEARCH RESULTS:");
      // console.log("ModelName: " + modelName);
      // console.log("DeviceName: " + deviceName);

      if (deviceName === "NOTREQUIREDSKIP") {
        console.log("SKIPPING")

        // Quick hack // bugfix => we get NOTREQUIREDSKIP twice in some cases, so just stop after the initial one
        GlobalEventEmitter.removeListener("COMPATIBLE_GLASSES_SEARCH_RESULT", handleSearchResult)

        triggerGlassesPairingGuide(glassesModelName as string, deviceName)
        return
      }

      setSearchResults(prevResults => {
        const isDuplicate = deviceAddress
          ? prevResults.some(device => device.deviceAddress === deviceAddress)
          : prevResults.some(device => device.deviceName === deviceName)

        if (!isDuplicate) {
          const newDevice = new SearchResultDevice(modelName, deviceName, deviceAddress)
          return [...prevResults, newDevice]
        }
        return prevResults
      })
    }

    const stopSearch = ({modelName}: {modelName: string}) => {
      console.log("SEARCH RESULTS:")
      console.log(JSON.stringify(searchResults))
      if (searchResultsRef.current.length === 0) {
        showAlert(
          "No " + modelName + " found",
          "Retry search?",
          [
            {
              text: "No",
              onPress: () => goBack(), // Navigate back if user chooses "No"
              style: "cancel",
            },
            {
              text: "Yes",
              onPress: () => CoreModule.findCompatibleDevices(glassesModelName), // Retry search
            },
          ],
          {cancelable: false}, // Prevent closing the alert by tapping outside
        )
      }
    }

    if (!MOCK_CONNECTION) {
      GlobalEventEmitter.on("COMPATIBLE_GLASSES_SEARCH_RESULT", handleSearchResult)
      GlobalEventEmitter.on("COMPATIBLE_GLASSES_SEARCH_STOP", stopSearch)
    }

    return () => {
      if (!MOCK_CONNECTION) {
        GlobalEventEmitter.removeListener("COMPATIBLE_GLASSES_SEARCH_RESULT", handleSearchResult)
        GlobalEventEmitter.removeListener("COMPATIBLE_GLASSES_SEARCH_STOP", stopSearch)
      }
    }
  }, [])

  useEffect(() => {
    const initializeAndSearchForDevices = async () => {
      console.log("Searching for compatible devices for: ", glassesModelName)
      setSearchResults([])
      CoreModule.findCompatibleDevices(glassesModelName)
    }

    if (Platform.OS === "ios") {
      // on ios, we need to wait for the core communicator to be fully initialized and sending this twice is just the easiest way to do that
      // initializeAndSearchForDevices()
      setTimeout(() => {
        initializeAndSearchForDevices()
      }, 3000)
    } else {
      initializeAndSearchForDevices()
    }
  }, [])

  useEffect(() => {
    // If pairing successful, return to home
    if (glassesConnected) {
      clearHistoryAndGoHome()
    }
  }, [glassesConnected])

  const triggerGlassesPairingGuide = async (glassesModelName: string, deviceName: string) => {
    // On Android, we need to check both microphone and location permissions
    if (Platform.OS === "android") {
      // First check location permission, which is required for Bluetooth scanning on Android
      const hasLocationPermission = await requestFeaturePermissions(PermissionFeatures.LOCATION)

      if (!hasLocationPermission) {
        // Inform the user that location permission is required for Bluetooth scanning
        showAlert(
          "Location Permission Required",
          "Location permission is required to scan for and connect to smart glasses on Android. This is a requirement of the Android Bluetooth system.",
          [{text: "OK"}],
        )
        return // Stop the connection process
      }
    }

    // Next, check microphone permission for all platforms
    const hasMicPermission = await requestFeaturePermissions(PermissionFeatures.MICROPHONE)

    // Only proceed if permission is granted
    if (!hasMicPermission) {
      // Inform the user that microphone permission is required
      showAlert(
        "Microphone Permission Required",
        "Microphone permission is required to connect to smart glasses. Voice control and audio features are essential for the AR experience.",
        [{text: "OK"}],
      )
      return // Stop the connection process
    }

    // update the preferredmic to be the phone mic:
    await useSettingsStore.getState().setSetting(SETTINGS_KEYS.preferred_mic, "phone")

    // All permissions granted, proceed with connecting to the wearable
    setTimeout(() => {
      CoreModule.connectByName(deviceName)
    }, 2000)
    replace("/pairing/loading", {glassesModelName: glassesModelName})
  }

  return (
    <Screen preset="fixed" style={themed($styles.screen)} safeAreaEdges={["bottom"]}>
      <Header
        leftIcon="chevron-left"
        onLeftPress={goBack}
        RightActionComponent={
          <PillButton
            text="Help"
            variant="icon"
            onPress={() => setShowTroubleshootingModal(true)}
            buttonStyle={{marginRight: theme.spacing.s6}}
          />
        }
      />
      <View style={themed($container)}>
        <View style={themed($contentContainer)}>
          <Image source={getGlassesOpenImage(glassesModelName)} style={themed($glassesImage)} />
          <Text
            style={themed($scanningText)}
            text={translate("pairing:scanningForGlassesModel", {model: glassesModelName})}
          />

          {!searchResults || searchResults.length === 0 ? (
            <View style={{justifyContent: "center", flex: 1}}>
              <ActivityIndicator size="large" color={theme.colors.text} />
            </View>
          ) : (
            <ScrollView style={{maxHeight: 300}}>
              <Group>
                {searchResults.map((device, index) => (
                  <TouchableOpacity
                    key={index}
                    style={themed($settingItem)}
                    onPress={() => triggerGlassesPairingGuide(device.deviceMode, device.deviceName)}>
                    <View style={themed($settingsTextContainer)}>
                      <Text
                        text={`${glassesModelName}  ${device.deviceName}`}
                        style={themed($label)}
                        numberOfLines={2}
                      />
                    </View>
                    <Icon name="angle-right" size={24} color={theme.colors.text} />
                  </TouchableOpacity>
                ))}
              </Group>
            </ScrollView>
          )}
          <Spacer height={theme.spacing.s4} />
          <Divider />
          <Button flex={false} compact={true} tx="common:cancel" preset="alternate" onPress={() => goBack()} />
        </View>
      </View>
      <GlassesTroubleshootingModal
        isVisible={showTroubleshootingModal}
        onClose={() => setShowTroubleshootingModal(false)}
        glassesModelName={glassesModelName}
      />
    </Screen>
  )
}

const $container: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  justifyContent: "center",
})

const $contentContainer: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  // height: 520,
  backgroundColor: colors.primary_foreground,
  borderRadius: spacing.s6,
  padding: spacing.s6,
  gap: spacing.s6,
  // paddingBottom: spacing.s16,
})

const $settingItem: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  paddingVertical: spacing.s3,
  paddingHorizontal: spacing.s4,
  backgroundColor: colors.background,
  height: 50,
})

const $scanningText: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 20,
  fontWeight: "600",
  color: colors.textDim,
  marginBottom: spacing.s6,
  textAlign: "center",
})

const $glassesImage: ThemedStyle<ImageStyle> = () => ({
  width: "100%",
  resizeMode: "contain",
  height: 90,
})

const $label: ThemedStyle<TextStyle> = () => ({
  fontSize: 10,
  fontWeight: "600",
  flexWrap: "wrap",
  marginTop: 5,
})

const $settingsTextContainer: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  paddingHorizontal: 10,
})
