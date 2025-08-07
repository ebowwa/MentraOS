import React, {useState, useRef, useMemo} from "react"
import {View, ScrollView, ViewStyle, TextStyle, Dimensions, NativeSyntheticEvent, NativeScrollEvent} from "react-native"
import {AppsGridView} from "./AppsGridView"
import {useAppTheme} from "@/utils/useAppTheme"
import {ThemedStyle} from "@/theme"
import {Text} from "@/components/ignite"
import {translate} from "@/i18n"

interface AppModel {
  name: string
  packageName: string
  is_running?: boolean
  is_foreground?: boolean
  appType?: string
  webviewURL?: string
  compatibility?: {
    isCompatible: boolean
    message?: string
  }
}

interface AppsCombinedGridViewProps {
  activeApps: AppModel[]
  inactiveApps: AppModel[]
  onStartApp: (packageName: string) => void
  onStopApp: (packageName: string) => void
  onOpenSettings: (app: AppModel) => void
  onOpenWebView?: (app: AppModel) => void
}

const SCREEN_WIDTH = Dimensions.get("window").width

export const AppsCombinedGridView: React.FC<AppsCombinedGridViewProps> = ({
  activeApps,
  inactiveApps,
  onStartApp,
  onStopApp,
  onOpenSettings,
  onOpenWebView,
}) => {
  const {themed, theme} = useAppTheme()
  const [currentPage, setCurrentPage] = useState(0)
  const scrollViewRef = useRef<ScrollView>(null)

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x
    const page = Math.round(offsetX / SCREEN_WIDTH)
    setCurrentPage(page)
  }

  const hasActiveApps = activeApps.length > 0
  const hasInactiveApps = inactiveApps.length > 0

  // Combine pages if both have apps, otherwise show single page
  const pages = useMemo(() => {
    const pageList = []
    if (hasActiveApps) {
      pageList.push({
        title: translate("home:activeApps"),
        apps: activeApps,
        type: "active" as const,
      })
    }
    if (hasInactiveApps) {
      pageList.push({
        title: translate("home:inactiveApps"),
        apps: inactiveApps,
        type: "inactive" as const,
      })
    }
    return pageList
  }, [activeApps, inactiveApps, hasActiveApps, hasInactiveApps])

  if (pages.length === 0) {
    return (
      <View style={themed($emptyContainer)}>
        <Text text={translate("home:noAppsInstalled")} style={themed($emptyText)} />
      </View>
    )
  }

  // If only one type of apps, don't use scrollview
  if (pages.length === 1) {
    const page = pages[0]
    return (
      <View style={themed($container)}>
        <Text style={themed($sectionTitle)} text={page.title} />
        <AppsGridView
          apps={page.apps}
          onStartApp={onStartApp}
          onStopApp={onStopApp}
          onOpenSettings={onOpenSettings}
          onOpenWebView={onOpenWebView}
        />
      </View>
    )
  }

  return (
    <View style={themed($container)}>
      <View style={themed($headerContainer)}>
        <Text style={themed($sectionTitle)} text={pages[currentPage].title} />
        <View style={themed($pageIndicatorContainer)}>
          {pages.map((_, index) => (
            <View key={index} style={[themed($pageIndicator), index === currentPage && themed($pageIndicatorActive)]} />
          ))}
        </View>
      </View>

      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        style={themed($scrollView)}>
        {pages.map((page, index) => (
          <View key={index} style={themed($page)}>
            <AppsGridView
              apps={page.apps}
              onStartApp={onStartApp}
              onStopApp={onStopApp}
              onOpenSettings={onOpenSettings}
              onOpenWebView={onOpenWebView}
            />
          </View>
        ))}
      </ScrollView>

      <Text
        style={themed($swipeHint)}
        text={translate("home:swipeToView", {
          target: currentPage === 0 ? translate("home:inactiveApps") : translate("home:activeApps"),
        })}
      />
    </View>
  )
}

const $container: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $headerContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  paddingHorizontal: spacing.md,
  marginBottom: spacing.md,
})

const $sectionTitle: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 20,
  fontWeight: "600",
  color: colors.text,
})

const $scrollView: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $page: ThemedStyle<ViewStyle> = () => ({
  width: SCREEN_WIDTH,
})

const $pageIndicatorContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  gap: spacing.xs,
})

const $pageIndicator: ThemedStyle<ViewStyle> = ({colors}) => ({
  width: 8,
  height: 8,
  borderRadius: 4,
  backgroundColor: colors.separator,
})

const $pageIndicatorActive: ThemedStyle<ViewStyle> = ({colors}) => ({
  backgroundColor: colors.primary,
})

const $swipeHint: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 12,
  color: colors.textDim,
  textAlign: "center",
  marginTop: spacing.sm,
  fontStyle: "italic",
})

const $emptyContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
  padding: spacing.xl,
})

const $emptyText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 16,
  color: colors.textDim,
  textAlign: "center",
})
