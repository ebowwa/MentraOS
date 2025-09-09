import {useCoreStatus} from "@/contexts/CoreStatusProvider"
import {useDisplayStore} from "@/stores/display"
import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"
import React, {useState, useEffect, useRef} from "react"
import {View, Text, StyleSheet, Image, ViewStyle, TextStyle} from "react-native"
import Canvas, {Image as CanvasImage, ImageData} from "react-native-canvas"

interface GlassesDisplayMirrorProps {
  fallbackMessage?: string
  containerStyle?: any
  fullscreen?: boolean
}

const GlassesDisplayMirror: React.FC<GlassesDisplayMirrorProps> = ({
  fallbackMessage = "No display data available",
  containerStyle,
  fullscreen = false,
}) => {
  const {themed} = useAppTheme()
  const [processedImageUri, setProcessedImageUri] = useState<string | null>(null)
  const canvasRef = useRef<Canvas>(null)
  const containerRef = useRef<View | null>(null)
  const [containerWidth, setContainerWidth] = useState<number | null>(null)
  const {status} = useCoreStatus()
  const {currentEvent} = useDisplayStore()
  const layout = currentEvent.layout

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
      const WIDTH = img.width
      const HEIGHT = img.height

      let leftPadding = 0
      let topPadding = 0
      // console.log("WIDTH", WIDTH)
      // console.log("HEIGHT", HEIGHT)
      // special case for G1 bitmaps:
      if (WIDTH == 576 && HEIGHT == 135) {
        leftPadding = 29
        topPadding = 21
      }

      const ratio = (WIDTH - leftPadding) / (HEIGHT - topPadding)

      const targetWidth = containerWidth ? containerWidth : 400

      const croppedWidth = targetWidth
      const croppedHeight = targetWidth / ratio

      canvas.width = croppedWidth
      canvas.height = croppedHeight

      const x1 = -leftPadding
      const y1 = -topPadding
      const x2 = croppedWidth + leftPadding
      const y2 = croppedHeight + topPadding

      // console.log("croppedWidth", croppedWidth)
      // console.log("croppedHeight", croppedHeight)
      // console.log("x1", x1)
      // console.log("y1", y1)
      // console.log("x2", x2)
      // console.log("y2", y2)

      // Draw image to canvas
      ctx.drawImage(img, x1, y1, x2, y2)

      // Apply tint using composite operation
      ctx.globalCompositeOperation = "multiply" // or 'overlay', 'screen'
      ctx.fillStyle = "#00ff88" // Your tint color
      ctx.fillRect(0, 0, croppedWidth, croppedHeight)
    })
  }

  const parseText = (text: string) => {
    // if text contains $GBATT$, replace with battery level
    if (text.includes("$GBATT$")) {
      const batteryLevel = status.glasses_info?.battery_level
      if (batteryLevel) {
        return text.replace("$GBATT$", batteryLevel.toString() + "%")
      }
    }
    return text
  }

  /**
   * Render logic for each layoutType
   */
  const renderLayout = (
    layout: any,
    textStyle?: TextStyle,
    canvasRef?: React.RefObject<Canvas>,
    containerRef?: React.RefObject<View | null>,
    setContainerWidth?: (width: number) => void,
  ) => {
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
        let {text} = layout
        text = parseText(text)
        return <Text style={[styles.cardContent, textStyle]}>{text || text === "" ? text : ""}</Text>
      }
      case "double_text_wall": {
        let {topText, bottomText} = layout
        topText = parseText(topText)
        bottomText = parseText(bottomText)
        return (
          <View style={{flexDirection: "row", gap: 2}}>
            <Text style={[styles.cardContent, textStyle, {width: "50%"}]} numberOfLines={4}>
              {topText || topText === "" ? topText : ""}
            </Text>
            <Text style={[styles.cardContent, textStyle, {width: "50%"}]} numberOfLines={4}>
              {bottomText || bottomText === "" ? bottomText : ""}
            </Text>
          </View>
        )
      }
      case "text_rows": {
        const rows = layout.text || []
        return rows.map((row: string, index: number) => (
          <Text key={index} style={[styles.cardContent, textStyle]}>
            {parseText(row)}
          </Text>
        ))
      }
      case "bitmap_view": {
        return (
          <View
            ref={containerRef}
            style={{flex: 1, width: "100%", height: "100%", justifyContent: "center"}}
            onLayout={event => {
              const {width} = event.nativeEvent.layout
              if (setContainerWidth) {
                setContainerWidth(width)
              }
            }}>
            <Canvas ref={canvasRef} style={{width: "100%", alignItems: "center"}} />
          </View>
        )
      }
      default:
        return <Text style={[styles.cardContent, textStyle]}>Unknown layout type: {layout.layoutType}</Text>
    }
  }

  // Process bitmap data when layout or container width changes
  useEffect(() => {
    if (containerWidth) {
      processBitmap()
    }
  }, [layout, containerWidth])

  if (!layout || !layout.layoutType) {
    return (
      <View style={[themed($glassesScreen), containerStyle]}>
        <View style={themed($emptyContainer)}>
          <Text style={themed($emptyText)}>{fallbackMessage}</Text>
        </View>
      </View>
    )
  }

  const content = <>{renderLayout(layout, themed($glassesText), canvasRef, containerRef, setContainerWidth)}</>

  if (fullscreen) {
    return <View style={themed($glassesScreenFullscreen)}>{content}</View>
  }

  return <View style={[themed($glassesScreen), containerStyle]}>{content}</View>
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
  // color: colors.text,
  color: "#00ff88aa",
  fontFamily: "Montserrat-Regular",
  fontSize: 14,
  fontWeight: 600,
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
