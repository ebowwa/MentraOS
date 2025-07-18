import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"
import React, {useState, useEffect, useRef} from "react"
import {View, Text, StyleSheet, Image, ViewStyle, TextStyle} from "react-native"
import Canvas, {Image as CanvasImage, ImageData} from "react-native-canvas"

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
  const canvasRef = useRef<Canvas>(null)

  const processBitmap = async () => {
    if (layout?.layoutType !== "bitmap_view" || !layout.data) {
      return
    }

    // First process the BMP to get base64
    const uri = `data:image/bmp;base64,${layout.data}`
    if (!canvasRef.current) {
      return
    }

    // Process with canvas to make black pixels transparent
    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d")

    // Create image from base64
    const img = new CanvasImage(canvas)
    img.src = uri

    img.addEventListener("load", async () => {
      const WIDTH = img.width / 1.8
      const HEIGHT = img.height / 1.8
      const leftPadding = 25
      const topPadding = 20

      // Set canvas size to match image
      canvas.width = WIDTH - leftPadding * 2
      canvas.height = HEIGHT - topPadding * 2

      // Draw image to canvas
      ctx.drawImage(img, -leftPadding, -topPadding, WIDTH - leftPadding, HEIGHT - topPadding)

      // Apply tint using composite operation
      ctx.globalCompositeOperation = "multiply" // or 'overlay', 'screen'
      ctx.fillStyle = "#00ff88" // Your tint color
      ctx.fillRect(0, 0, WIDTH - leftPadding, HEIGHT - topPadding)
    })
  }

  // Process bitmap data when layout changes
  useEffect(() => {
    processBitmap()
  }, [layout])

  if (!layout || !layout.layoutType) {
    return (
      <View style={[themed($glassesScreen), containerStyle]}>
        <View style={themed($emptyContainer)}>
          <Text style={themed($emptyText)}>{fallbackMessage}</Text>
        </View>
      </View>
    )
  }

  const content = <>{renderLayout(layout, processedImageUri, containerStyle, themed($glassesText), canvasRef)}</>

  if (fullscreen) {
    return <View style={themed($glassesScreenFullscreen)}>{content}</View>
  }

  return <View style={[themed($glassesScreen), containerStyle]}>{content}</View>
}

/**
 * Render logic for each layoutType
 */
function renderLayout(
  layout: any,
  processedImageUri: string | null,
  containerStyle?: any,
  textStyle?: TextStyle,
  canvasRef?: React.RefObject<Canvas>,
) {
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
      const rows = layout.text || []
      return rows.map((row: string, index: number) => (
        <Text key={index} style={[styles.cardContent, textStyle]}>
          {row}
        </Text>
      ))
    }
    case "bitmap_view": {
      return (
        <View style={{flex: 1, width: "100%", height: "100%", justifyContent: "center"}}>
          <Canvas ref={canvasRef} style={{width: "100%", alignItems: "center"}} />
        </View>
      )
    }
    default:
      return <Text style={[styles.cardContent, textStyle]}>Unknown layout type: {layout.layoutType}</Text>
  }
}

const $glassesScreen: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  width: "100%",
  minHeight: 140,
  backgroundColor: colors.palette.neutral200,
  borderRadius: 10,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
  borderWidth: 2,
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
