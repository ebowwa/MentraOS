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

    // console.log("starting canvas processing", uri.substring(0, 100))
    img.addEventListener("load", async () => {
      // const WIDTH = 400
      // const HEIGHT = 100
      const WIDTH = img.width / 2
      const HEIGHT = img.height / 2

      // Set canvas size to match image
      canvas.width = WIDTH
      canvas.height = HEIGHT

      // Draw image to canvas
      // ctx.drawImage(img, 0, 0, img.width / 1.8, img.height / 1.8)
      ctx.drawImage(img, 0, 0, WIDTH, HEIGHT)

      // ctx.drawImage(img, 0, 0, 100, 100)

      // Get image data
      const imageData = await ctx.getImageData(0, 0, WIDTH, HEIGHT)
      const data = Object.values(imageData.data)
      const len = Object.keys(data).length
      for (let i = 0; i < len; i += 4) {
        // console.log("🔍 data[i]", data[i], data[i + 1], data[i + 2])
        // @ts-ignore
        if (data[i] < 240 || data[i + 1] < 240 || data[i + 2] < 240) {
          data[i] = 0
          data[i + 1] = 0
          data[i + 2] = 0
          data[i + 3] = 0
        }
      }

      // console.log("🔍 imageData", imageData)

      // for (let i = 0; i < 2500; i++) {
      //   for (let j = 0; j < 4; j++) {
      //     data.push(0)
      //   }
      // }

      // console.log("🔍 data.length", data.length)
      // const newImageData = new ImageData(canvas, data, WIDTH, HEIGHT)
      // ctx.putImageData(newImageData, 0, 0)

      // Convert canvas to base64
      // canvas.toDataURL("image/png").then((processedUri: string) => {
      //   console.log("🔍 processedUri", processedUri.substring(0, 100))
      //   setProcessedImageUri(processedUri)
      // })
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
      console.log("🔍 bitmap_view.length", layout.data?.length)

      // if (!processedImageUri) {
      //   return <Text style={[styles.cardContent, textStyle]}>Processing image...</Text>
      // }

      // Post to webhook for debugging
      fetch("https://webhook.site/9143bed3-905f-4c62-89cb-7f211d27e667", {
        method: "POST",
        body: processedImageUri,
      })

      return <Canvas ref={canvasRef} style={{flex: 1, width: "100%"}} />

      // return (
      //   <Image
      //     source={{uri: processedImageUri}}
      //     style={{
      //       flex: 1,
      //       width: "100%",
      //       height: undefined,
      //       resizeMode: "contain",
      //     }}
      //   />
      // )
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
