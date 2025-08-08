/**
 * PhotoImage component that handles AVIF and other image formats
 * Shows a placeholder for AVIF files since React Native doesn't support them natively
 */

import React, {useState, useEffect} from "react"
import {View, Image, Text, ActivityIndicator} from "react-native"
import {ViewStyle, ImageStyle, TextStyle} from "react-native"
import {useAppTheme} from "@/utils/useAppTheme"
import {ThemedStyle} from "@/theme"
import {PhotoInfo} from "../../types"

interface PhotoImageProps {
  photo: PhotoInfo
  style?: ImageStyle
  showPlaceholder?: boolean
}

export function PhotoImage({photo, style, showPlaceholder = true}: PhotoImageProps) {
  const {theme, themed} = useAppTheme()
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [isAvif, setIsAvif] = useState(false)

  useEffect(() => {
    // Check if this is an AVIF file
    const checkIfAvif = async () => {
      // Check by mime type
      if (photo.mime_type === "image/avif") {
        setIsAvif(true)
        setIsLoading(false)
        return
      }

      // Check by filename (files without extensions might be AVIF)
      if (!photo.name.includes(".") || photo.name.match(/\.(avif|avifs)$/i)) {
        setIsAvif(true)
        setIsLoading(false)
        return
      }

      // Check if the URL returns AVIF data
      if (photo.url.includes("application/octet-stream") || photo.url.includes("image/avif")) {
        setIsAvif(true)
        setIsLoading(false)
        return
      }

      setIsLoading(false)
    }

    checkIfAvif()
  }, [photo])

  const handleLoadEnd = () => {
    setIsLoading(false)
  }

  const handleError = () => {
    setHasError(true)
    setIsLoading(false)
    // Might be AVIF if regular loading failed
    if (!photo.name.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i)) {
      setIsAvif(true)
    }
  }

  // Show AVIF placeholder
  if (isAvif && showPlaceholder) {
    return (
      <View style={[themed($placeholderContainer), style]}>
        <View style={themed($avifBadge)}>
          <Text style={themed($avifBadgeText)}>AVIF</Text>
        </View>
        <Text style={themed($placeholderText)}>📷</Text>
        <Text style={themed($placeholderSubtext)}>
          {photo.name.length > 15 ? photo.name.substring(0, 12) + "..." : photo.name}
        </Text>
      </View>
    )
  }

  // Show error placeholder
  if (hasError && showPlaceholder) {
    return (
      <View style={[themed($placeholderContainer), style]}>
        <Text style={themed($placeholderText)}>❌</Text>
        <Text style={themed($placeholderSubtext)}>Failed to load</Text>
      </View>
    )
  }

  return (
    <View style={style}>
      {isLoading && (
        <View style={[themed($loadingOverlay), style]}>
          <ActivityIndicator size="small" color={theme.colors.palette.primary500} />
        </View>
      )}
      <Image
        source={{uri: photo.url}}
        style={[style, isLoading && {opacity: 0}]}
        onLoadEnd={handleLoadEnd}
        onError={handleError}
        resizeMode="cover"
      />
    </View>
  )
}

const $placeholderContainer: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.palette.neutral200,
  justifyContent: "center",
  alignItems: "center",
  padding: spacing.sm,
  position: "relative",
})

const $avifBadge: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  position: "absolute",
  top: spacing.xs,
  right: spacing.xs,
  backgroundColor: colors.palette.primary500,
  paddingHorizontal: spacing.xs,
  paddingVertical: 2,
  borderRadius: 4,
})

const $avifBadgeText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 10,
  fontWeight: "bold",
  color: colors.background,
})

const $placeholderText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 32,
  color: colors.textDim,
})

const $placeholderSubtext: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 11,
  color: colors.textDim,
  marginTop: spacing.xs,
  textAlign: "center",
})

const $loadingOverlay: ThemedStyle<ViewStyle> = ({colors}) => ({
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: colors.palette.neutral100,
  justifyContent: "center",
  alignItems: "center",
  zIndex: 1,
})
