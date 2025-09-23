// SensingDisabledWarning.tsx
import React, {useCallback, useEffect, useState} from "react"
import {StyleSheet, TouchableOpacity, TextStyle} from "react-native"
import {useFocusEffect} from "expo-router"
import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"
import {MaterialCommunityIcons} from "@expo/vector-icons"
import showAlert from "@/utils/AlertUtils"
import {translate} from "@/i18n"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {SETTINGS_KEYS, useSetting, useSettingsStore} from "@/stores/settings"

export default function NonProdWarning() {
  const {theme, themed} = useAppTheme()
  const [isProdBackend, setIsProdBackend] = useState(true)
  const {push} = useNavigationHistory()
  const [customBackendUrl, setCustomBackendUrl] = useSetting(SETTINGS_KEYS.CUSTOM_BACKEND_URL)

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

const $warningText: ThemedStyle<TextStyle> = ({colors}) => ({
  marginLeft: 10,
  fontSize: 14,
  fontWeight: "500",
  color: colors.error,
  flex: 1,
})

const styles = StyleSheet.create({
  sensingWarningContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 12, // Match ConnectedDeviceInfo
    borderWidth: 1, // Restore border for the warning
    marginBottom: 16,
    marginTop: 16, // Added spacing above the warning
    marginHorizontal: 0,
    width: "100%",
  },

  settingsButtonTextBlue: {
    color: "#007AFF",
    fontSize: 14,
    fontWeight: "bold",
  },
  warningContent: {
    alignItems: "center",
    flexDirection: "row",
    flex: 1,
  },
})
