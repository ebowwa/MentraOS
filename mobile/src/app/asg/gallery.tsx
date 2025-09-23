import React, {useCallback} from "react"
import {GalleryScreen} from "../../components/glasses/Gallery/GalleryScreen"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {useFocusEffect} from "expo-router"
import {BackHandler, View, ViewStyle} from "react-native"
import {Header, Screen} from "@/components/ignite"
import {useAppTheme} from "@/utils/useAppTheme"
import {ThemedStyle} from "@/theme"

export default function AsgGallery() {
  const {theme, themed} = useAppTheme()
  const {goBack} = useNavigationHistory()

  const handleGoBack = useCallback(() => {
    goBack()
    return true // Prevent default back behavior
  }, [goBack])

  // Handle Android back button
  useFocusEffect(
    useCallback(() => {
      const backHandler = BackHandler.addEventListener("hardwareBackPress", handleGoBack)
      return () => backHandler.remove()
    }, [handleGoBack]),
  )

  return (
    <Screen preset="fixed" style={{paddingHorizontal: theme.spacing.lg}}>
      <GalleryScreen />
    </Screen>
  )
}

const $screenContainer: ThemedStyle<ViewStyle> = ({colors}) => ({
  flex: 1,
  backgroundColor: colors.background,
})

const $container: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})
