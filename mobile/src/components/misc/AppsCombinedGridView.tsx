import React, {useState} from "react"
import {View, TouchableOpacity, ViewStyle, TextStyle} from "react-native"
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

export const AppsCombinedGridView: React.FC<AppsCombinedGridViewProps> = ({
  activeApps,
  inactiveApps,
  onStartApp,
  onStopApp,
  onOpenSettings,
  onOpenWebView,
}) => {
  const {themed} = useAppTheme()
  const [selectedTab, setSelectedTab] = useState<"active" | "inactive">("active")

  const hasActiveApps = activeApps.length > 0
  const hasInactiveApps = inactiveApps.length > 0

  // If no apps at all
  if (!hasActiveApps && !hasInactiveApps) {
    return (
      <View style={themed($emptyContainer)}>
        <Text text={translate("home:noAppsInstalled")} style={themed($emptyText)} />
      </View>
    )
  }

  // If only one type of apps, show without tabs
  if (hasActiveApps && !hasInactiveApps) {
    return (
      <View style={themed($container)}>
        <Text style={themed($sectionTitle)} text={translate("home:activeApps")} />
        <AppsGridView
          apps={activeApps}
          onStartApp={onStartApp}
          onStopApp={onStopApp}
          onOpenSettings={onOpenSettings}
          onOpenWebView={onOpenWebView}
        />
      </View>
    )
  }

  if (!hasActiveApps && hasInactiveApps) {
    return (
      <View style={themed($container)}>
        <Text style={themed($sectionTitle)} text={translate("home:inactiveApps")} />
        <AppsGridView
          apps={inactiveApps}
          onStartApp={onStartApp}
          onStopApp={onStopApp}
          onOpenSettings={onOpenSettings}
          onOpenWebView={onOpenWebView}
        />
      </View>
    )
  }

  // Both types exist, use custom tabs
  return (
    <View style={themed($container)}>
      {/* Tab Bar */}
      <View style={themed($tabBar)}>
        <TouchableOpacity style={themed($tabButton)} onPress={() => setSelectedTab("active")} activeOpacity={0.7}>
          <Text
            text={translate("home:activeApps")}
            style={[themed($tabLabel), selectedTab === "active" && themed($tabLabelActive)]}
          />
          {selectedTab === "active" && <View style={themed($tabIndicator)} />}
        </TouchableOpacity>

        <TouchableOpacity style={themed($tabButton)} onPress={() => setSelectedTab("inactive")} activeOpacity={0.7}>
          <Text
            text={translate("home:inactiveApps")}
            style={[themed($tabLabel), selectedTab === "inactive" && themed($tabLabelActive)]}
          />
          {selectedTab === "inactive" && <View style={themed($tabIndicator)} />}
        </TouchableOpacity>
      </View>

      {/* Tab Content */}
      <View style={themed($tabContent)}>
        {selectedTab === "active" ? (
          <AppsGridView
            apps={activeApps}
            onStartApp={onStartApp}
            onStopApp={onStopApp}
            onOpenSettings={onOpenSettings}
            onOpenWebView={onOpenWebView}
          />
        ) : (
          <AppsGridView
            apps={inactiveApps}
            onStartApp={onStartApp}
            onStopApp={onStopApp}
            onOpenSettings={onOpenSettings}
            onOpenWebView={onOpenWebView}
          />
        )}
      </View>
    </View>
  )
}

const $container: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $sectionTitle: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 20,
  fontWeight: "600",
  color: colors.text,
  paddingHorizontal: spacing.md,
  marginBottom: spacing.md,
})

const $tabBar: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  flexDirection: "row",
  backgroundColor: colors.background,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
  paddingHorizontal: spacing.md,
})

const $tabButton: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  paddingVertical: spacing.sm,
  alignItems: "center",
  position: "relative",
})

const $tabLabel: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 16,
  fontWeight: "500",
  color: colors.textDim,
})

const $tabLabelActive: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.text,
  fontWeight: "600",
})

const $tabIndicator: ThemedStyle<ViewStyle> = ({colors}) => ({
  position: "absolute",
  bottom: 0,
  left: 0,
  right: 0,
  height: 3,
  backgroundColor: colors.primary,
})

const $tabContent: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  paddingTop: spacing.md,
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
