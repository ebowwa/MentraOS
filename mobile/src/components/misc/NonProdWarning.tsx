// SensingDisabledWarning.tsx
import {useEffect, useState} from "react"
import {TouchableOpacity, ViewStyle} from "react-native"
import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"
import {MaterialCommunityIcons} from "@expo/vector-icons"
import showAlert from "@/utils/AlertUtils"
import {translate} from "@/i18n"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {SETTINGS_KEYS, useSetting} from "@/stores/settings"

export default function NonProdWarning() {
  const {theme, themed} = useAppTheme()
  const [isProdBackend, setIsProdBackend] = useState(true)
  const {push} = useNavigationHistory()
  const [customBackendUrl, _setCustomBackendUrl] = useSetting(SETTINGS_KEYS.CUSTOM_BACKEND_URL)

  const checkNonProdBackend = async () => {
    let isProd = false
    if (
      customBackendUrl.includes("prod.augmentos.cloud") ||
      customBackendUrl.includes("global.augmentos.cloud") ||
      customBackendUrl.includes("api.mentra.glass")
    ) {
      isProd = true
    }

    if (customBackendUrl.includes("devapi")) {
      isProd = false
    }

    setIsProdBackend(isProd)
  }

  useEffect(() => {
    checkNonProdBackend()
  }, [customBackendUrl])

  if (isProdBackend) {
    return null
  }

  // return (
  //   <View style={[styles.sensingWarningContainer, {backgroundColor: "#FFF3E0", borderColor: "#FFB74D"}]}>
  //     <View style={styles.warningContent}>
  //       <Icon name="alert" size={22} color="#FF9800" />
  //       <Text style={themed($warningText)} tx="warning:nonProdBackend" />
  //     </View>
  //     <TouchableOpacity
  //       style={styles.settingsButton}
  //       onPress={() => {
  //         push("/settings/developer")
  //       }}>
  //       <Text style={styles.settingsButtonTextBlue}>Settings</Text>
  //     </TouchableOpacity>
  //   </View>
  // )

  const nonProdWarning = () => {
    showAlert(translate("warning:nonProdBackend"), "", [
      {text: translate("common:ok"), onPress: () => {}},
      {
        text: translate("settings:developerSettings"),
        onPress: () => {
          push("/settings/developer")
        },
      },
    ])
  }

  return (
    <TouchableOpacity style={themed($settingsButton)} onPress={nonProdWarning}>
      <MaterialCommunityIcons name="alert" size={theme.spacing.lg} color={theme.colors.error} />
    </TouchableOpacity>
  )
}

const $settingsButton: ThemedStyle<ViewStyle> = ({spacing}) => ({
  padding: spacing.sm,
})
