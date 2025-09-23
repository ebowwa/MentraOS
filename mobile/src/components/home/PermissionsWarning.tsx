import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {checkFeaturePermissions, PermissionFeatures} from "@/utils/PermissionsUtils"
import {useAppTheme} from "@/utils/useAppTheme"
import {useFocusEffect} from "@react-navigation/native"
import NotificationOn from "assets/icons/component/NotificationOn"
import {useCallback, useRef, useState} from "react"
import {Animated, Platform, TouchableOpacity, View} from "react-native"

export default function PermissionsWarning() {
  const {themed, theme} = useAppTheme()
  const [hasMissingPermissions, setHasMissingPermissions] = useState(false)

  const fadeAnim = useRef(new Animated.Value(0)).current
  const {push} = useNavigationHistory()

  const handleBellPress = () => {
    push("/settings/privacy")
  }

  const checkPermissions = async () => {
    const hasCalendar = await checkFeaturePermissions(PermissionFeatures.CALENDAR)
    const hasNotifications =
      Platform.OS === "android" ? await checkFeaturePermissions(PermissionFeatures.READ_NOTIFICATIONS) : true

    const hasLocation = await checkFeaturePermissions(PermissionFeatures.BACKGROUND_LOCATION)

    const shouldShowBell = !hasCalendar || !hasNotifications || !hasLocation
    setHasMissingPermissions(shouldShowBell)

    // Animate bell in if needed
    if (shouldShowBell) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start()
    }
  }

  // Simple animated wrapper so we do not duplicate logic
  useFocusEffect(
    useCallback(() => {
      // Reset animations when screen is about to focus
      fadeAnim.setValue(0)

      // Start animations after a short delay
      const animationTimeout = setTimeout(() => {
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ]).start()
      }, 50)

      return () => {
        clearTimeout(animationTimeout)
        fadeAnim.setValue(0)
      }
    }, [fadeAnim]),
  )

  // check for permissions when the screen is focused:
  useFocusEffect(
    useCallback(() => {
      checkPermissions()
    }, []),
  )

  return (
    <>
      {hasMissingPermissions && (
        <Animated.View style={{opacity: fadeAnim}}>
          <TouchableOpacity onPress={handleBellPress}>
            <NotificationOn />
          </TouchableOpacity>
        </Animated.View>
      )}
    </>
  )
}
