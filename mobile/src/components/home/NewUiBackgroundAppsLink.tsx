import React from "react"
import {TouchableOpacity, View, Text} from "react-native"
import {useRouter} from "expo-router"

import {useNewUiActiveBackgroundAppsCount} from "@/hooks/useNewUiFilteredApps"
import {useAppTheme} from "@/utils/useAppTheme"
import ChevronRight from "assets/icons/component/ChevronRight"

export const NewUiBackgroundAppsLink: React.FC = () => {
  const {themed, theme} = useAppTheme()
  const router = useRouter()
  const activeCount = useNewUiActiveBackgroundAppsCount()

  const handlePress = () => {
    router.push("/new-ui-background-apps")
  }

  return (
    <TouchableOpacity style={themed($container)} onPress={handlePress} activeOpacity={0.7}>
      <View style={themed($content)}>
        <Text style={themed($label)}>
          Background Apps <Text style={themed($count)}>({activeCount} active)</Text>
        </Text>
        <ChevronRight color={theme.colors.text} />
      </View>
    </TouchableOpacity>
  )
}

const $container = theme => ({
  borderRadius: theme.spacing.sm,
  marginVertical: theme.spacing.xs,
})

const $content = theme => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  paddingHorizontal: theme.spacing.xs,
  paddingVertical: theme.spacing.md,
})

const $label = theme => ({
  fontSize: 15,
  color: theme.colors.text,
  fontWeight: "500",
})

const $count = theme => ({
  fontSize: 14,
  color: theme.colors.textDim,
  fontWeight: "400",
})
