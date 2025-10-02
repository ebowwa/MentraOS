import {translate, TxKeyPath} from "@/i18n"
import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"
import SearchIcon from "assets/icons/component/SearchIcon"
import {router as _router} from "expo-router"
import {View, TextStyle, ViewStyle, Pressable} from "react-native"

import {Text} from "@/components/ignite"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"

const AppsHeader = ({showSearchIcon = true, title}: {showSearchIcon?: boolean; title: TxKeyPath}) => {
  const {themed, theme} = useAppTheme()
  const {push} = useNavigationHistory()

  return (
    <View style={themed($listHeaderIcon)}>
      <View style={themed($tableHeader)}>
        <Text text={translate(title)} style={themed($appsHeader)} />
      </View>
      {showSearchIcon && (
        <Pressable
          style={themed($wrapper)}
          onPress={() => {
            push("/search/search")
          }}>
          <SearchIcon color={theme.colors.icon} />
        </Pressable>
      )}
    </View>
  )
}

export default AppsHeader

const $appsHeader: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 15,
  letterSpacing: 0.6,
  lineHeight: 20,
  fontWeight: "500",
  color: colors.text,
  textAlign: "left",
})

const $tableHeader: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
})

const $listHeaderIcon: ThemedStyle<ViewStyle> = () => ({
  marginBottom: 12,
  flex: 1,
  alignItems: "center",
  justifyContent: "space-between",
  paddingVertical: 0,
  gap: 0,
  flexDirection: "row",
  width: "100%",
})
const $wrapper: ThemedStyle<ViewStyle> = () => ({
  width: 24,
  height: 20,
})
