import React, {useRef, useCallback, PropsWithChildren, useState, useEffect} from "react"
import {View, Animated, Platform, ViewStyle, TextStyle} from "react-native"
import {useNavigation, useFocusEffect, useRoute} from "@react-navigation/native"
import type {NavigationProp} from "@react-navigation/native"
import {Header, Screen} from "@/components/ignite"
import AppsActiveList from "@/components/misc/AppsActiveList"
import AppsInactiveList from "@/components/misc/AppsInactiveList"
import {useStatus} from "@/contexts/AugmentOSStatusProvider"
import {useAppStatus} from "@/contexts/AppStatusProvider"
import BackendServerComms from "@/backend_comms/BackendServerComms"
import semver from "semver"
import Constants from "expo-constants"
import CloudConnection from "@/components/misc/CloudConnection"
import {loadSetting} from "@/utils/SettingsHelper"
import DefaultButton from "@/components/ui/Button"
import SensingDisabledWarning from "@/components/misc/SensingDisabledWarning"
import {SETTINGS_KEYS} from "@/consts"
import NonProdWarning from "@/components/misc/NonProdWarning"
import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"
import MicIcon from "assets/icons/MicIcon"
import NotificationOff from "assets/icons/NotificationOff"
import {router} from "expo-router"
import SolarLineIconsSet4 from "assets/icons/SolarLineIconsSet4"
import {translate} from "@/i18n"

interface AnimatedSectionProps extends PropsWithChildren {
  delay?: number
}

export default function Homepage() {
  const navigation = useNavigation<NavigationProp<any>>()
  const {appStatus, refreshAppStatus} = useAppStatus()
  const {status} = useStatus()
  const [isSimulatedPuck, setIsSimulatedPuck] = React.useState(false)
  const [isCheckingVersion, setIsCheckingVersion] = useState(false)
  const [isInitialLoading, setIsInitialLoading] = useState(true)
  const [nonProdBackend, setNonProdBackend] = useState(false)
  const route = useRoute()

  const fadeAnim = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(-50)).current
  const {themed, theme} = useAppTheme()

  // Reset loading state when connection status changes
  useEffect(() => {
    if (status.core_info.cloud_connection_status === "CONNECTED") {
      setIsInitialLoading(true)
      const timer = setTimeout(() => {
        setIsInitialLoading(false)
      }, 10000)
      return () => clearTimeout(timer)
    }
  }, [status.core_info.cloud_connection_status])

  const checkNonProdBackend = async () => {
    const url = await loadSetting(SETTINGS_KEYS.CUSTOM_BACKEND_URL, null)
    setNonProdBackend(url && !url.includes("prod.augmentos.cloud") && !url.includes("global.augmentos.cloud"))
  }

  // Clear loading state if apps are loaded
  useEffect(() => {
    if (appStatus.length > 0) {
      setIsInitialLoading(false)
    }
  }, [appStatus.length])

  // Get local version from env file
  const getLocalVersion = () => {
    try {
      const version = Constants.expoConfig?.extra?.AUGMENTOS_VERSION
      console.log("Local version from env:", version)
      return version || null
    } catch (error) {
      console.error("Error getting local version:", error)
      return null
    }
  }

  // Check cloud version and navigate if needed
  const checkCloudVersion = async () => {
    if (isCheckingVersion) return
    setIsCheckingVersion(true)

    try {
      // Check if version checks are being ignored this session
      const ignoreCheck = await loadSetting("ignoreVersionCheck", false)
      if (ignoreCheck) {
        console.log("Version check skipped due to user preference")
        setIsCheckingVersion(false)
        return
      }

      const backendComms = BackendServerComms.getInstance()
      const localVer = getLocalVersion()

      if (!localVer) {
        console.error("Failed to get local version from env file")
        // Navigate to update screen with connection error
        // router.push({pathname: "/version-update", params: {
        //   connectionError: "true",
        // }})
        setIsCheckingVersion(false)
        return
      }

      // Call the endpoint to get cloud version
      await backendComms.restRequest("/apps/version", null, {
        onSuccess: data => {
          const cloudVer = data.version
          console.log(`Comparing local version (${localVer}) with cloud version (${cloudVer})`)

          // Compare versions using semver
          if (semver.lt(localVer, cloudVer)) {
            console.log("A new version is available. Navigate to update screen.")
            // Navigate to update screen with version mismatch
            // router.push({pathname: "/version-update", params: {
            //   localVersion: localVer,
            //   cloudVersion: cloudVer,
            // }})
          } else {
            console.log("Local version is up-to-date.")
            // Stay on homepage, no navigation needed
          }
          setIsCheckingVersion(false)
        },
        onFailure: errorCode => {
          console.error("Failed to fetch cloud version:", errorCode)
          // Navigate to update screen with connection error
          // router.push({pathname: "/version-update", params: {
          //   connectionError: "true",
          // }})
          setIsCheckingVersion(false)
        },
      })
      // console.log('Version check completed');
    } catch (error) {
      console.error("Error checking cloud version:", error)
      // Navigate to update screen with connection error
      // router.push({pathname: "/version-update", params: {
      //   connectionError: "true",
      // }})
      setIsCheckingVersion(false)
    }
  }

  // Check version once on mount
  useEffect(() => {
    if (Platform.OS == "android") {
      checkCloudVersion()
    }
  }, [])

  // Simple animated wrapper so we do not duplicate logic
  const AnimatedSection: React.FC<AnimatedSectionProps> = useCallback(
    ({children}) => (
      <Animated.View
        style={{
          opacity: fadeAnim,
          transform: [{translateY: slideAnim}],
        }}>
        {children}
      </Animated.View>
    ),
    [fadeAnim, slideAnim],
  )

  useFocusEffect(
    useCallback(() => {
      checkNonProdBackend()

      // Reset animations when screen is about to focus
      fadeAnim.setValue(0)
      slideAnim.setValue(-50)

      // Start animations after a short delay
      const animationTimeout = setTimeout(() => {
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
          }),
        ]).start()
      }, 50)

      return () => {
        clearTimeout(animationTimeout)
        fadeAnim.setValue(0)
        slideAnim.setValue(-50)
      }
    }, [fadeAnim, slideAnim]),
  )

  return (
    <Screen preset="auto" style={themed($screen)}>
      <AnimatedSection>
        <Header
          leftTx="home:title"
          RightActionComponent={
            <View style={themed($headerRight)}>
              <NotificationOff />
              <MicIcon withBackground />
            </View>
          }
        />
      </AnimatedSection>
      {/* <ScrollView
        style={{flex: 1, paddingHorizontal: 16}}
        contentContainerStyle={{paddingBottom: 0, flexGrow: 1}} // Force content to fill available space
      > */}
      {status.core_info.cloud_connection_status !== "CONNECTED" && (
        <AnimatedSection>
          <CloudConnection />
        </AnimatedSection>
      )}

      {/* Sensing Disabled Warning */}
      <AnimatedSection>
        <SensingDisabledWarning isSensingEnabled={status.core_info.sensing_enabled} />
      </AnimatedSection>

      {nonProdBackend && (
        <AnimatedSection>
          <NonProdWarning />
        </AnimatedSection>
      )}

      {status.glasses_info?.model_name && status.glasses_info.model_name.toLowerCase().includes("simulated") ? (
              <DefaultButton
                icon={<SolarLineIconsSet4 />}
                onPress={() => {
                  router.push("/pairing/select-glasses-model");
                }}
                title={translate("home:pairGlasses")}
              />
            ) : (
              <DefaultButton
                icon={<SolarLineIconsSet4 />}
                onPress={() => {
                  router.push("/pairing/select-glasses-model");
                }}
                title={translate("home:connectGlasses")}
              />
            )}
      
         <AnimatedSection>
                  <AppsActiveList isDarkTheme={theme.isDark} />
                </AnimatedSection>

          <AnimatedSection>
                  <AppsInactiveList isDarkTheme={theme.isDark} key={`apps-list-${appStatus.length}`} />
                </AnimatedSection>
              
        {/* <View style={{height: 1000}} /> */}
      {/* </ScrollView> */}
    </Screen>
  )
}

const $contentContainer: ThemedStyle<ViewStyle> = ({colors}) => ({
  paddingBottom: 0,
  flexGrow: 1,
})

const $noAppsContainer: ThemedStyle<ViewStyle> = ({colors}) => ({
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
})

const $noAppsText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 16,
  color: colors.text,
  textAlign: "center",
})

const $loadingContainer: ThemedStyle<ViewStyle> = ({colors}) => ({
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
})

const $loadingText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 16,
  color: colors.text,
  textAlign: "center",
})

const $screen: ThemedStyle<ViewStyle> = () => ({
  paddingHorizontal: 20,
})

const $headerRight: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
})
