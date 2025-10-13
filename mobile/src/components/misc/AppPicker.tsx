import {useState, useMemo, useCallback, useEffect, FC} from "react"
import {View, TouchableOpacity, ViewStyle, TextStyle, Modal, ScrollView, TextInput, Platform} from "react-native"
import {Text} from "@/components/ignite"
import AppIcon from "./AppIcon"
import {useAppTheme} from "@/utils/useAppTheme"
import {ThemedStyle} from "@/theme"
import {translate} from "@/i18n"
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons"
import {AppletInterface, isOfflineApp} from "@/types/AppletTypes"

interface AppPickerProps {
  visible: boolean
  onClose: () => void
  onSelect: (app: AppletInterface) => void
  apps: AppletInterface[]
  selectedPackageName?: string
  title?: string
  filterPredicate?: (app: AppletInterface) => boolean
  showCompatibilityWarnings?: boolean
}

/**
 * AppPicker Component
 *
 * A reusable modal for selecting apps with search, filtering, and compatibility warnings.
 *
 * @param visible - Whether the modal is visible
 * @param onClose - Callback when modal is closed
 * @param onSelect - Callback when an app is selected
 * @param apps - Array of apps to display
 * @param selectedPackageName - Currently selected app package name
 * @param title - Modal title (default: "Select App")
 * @param filterPredicate - Optional filter function to show only certain apps
 * @param showCompatibilityWarnings - Whether to show compatibility warnings (default: true)
 */
export const AppPicker: FC<AppPickerProps> = ({
  visible,
  onClose,
  onSelect,
  apps,
  selectedPackageName,
  title = "Select App",
  filterPredicate,
  showCompatibilityWarnings = true,
}) => {
  const {themed, theme} = useAppTheme()
  const [searchQuery, setSearchQuery] = useState("")

  // Debug logging when modal opens
  useEffect(() => {
    if (visible) {
      console.log("🔍 AppPicker opened with", apps.length, "total apps")
      console.log("🔍 Filter predicate exists:", !!filterPredicate)
      if (filterPredicate) {
        const filtered = apps.filter(filterPredicate)
        console.log("🔍 After filter predicate:", filtered.length, "apps")
        console.log(
          "🔍 Filtered apps:",
          filtered.map(a => ({name: a.name, type: a.type, compatible: a.compatibility?.isCompatible})),
        )
      }
    }
  }, [visible, apps, filterPredicate])

  // Filter and search apps
  const filteredApps = useMemo(() => {
    let result = apps

    // Apply custom filter predicate if provided
    if (filterPredicate) {
      result = result.filter(filterPredicate)
    }

    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter(
        app =>
          app.name.toLowerCase().includes(query) ||
          app.packageName.toLowerCase().includes(query) ||
          app.developerName?.toLowerCase().includes(query),
      )
    }

    // Sort: compatible first, then alphabetically by name
    return result.sort((a, b) => {
      // Compatible apps first
      const aCompatible = a.compatibility?.isCompatible !== false
      const bCompatible = b.compatibility?.isCompatible !== false

      if (aCompatible !== bCompatible) {
        return aCompatible ? -1 : 1
      }

      // Then alphabetically
      return a.name.localeCompare(b.name)
    })
  }, [apps, searchQuery, filterPredicate])

  const handleAppPress = useCallback(
    (app: AppletInterface) => {
      onSelect(app)
      onClose()
      setSearchQuery("") // Reset search
    },
    [onSelect, onClose],
  )

  const handleClose = useCallback(() => {
    setSearchQuery("") // Reset search
    onClose()
  }, [onClose])

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={handleClose}>
      <View style={themed($modalOverlay)}>
        <View style={themed($modalContent)}>
          {/* Header */}
          <View style={themed($header)}>
            <Text text={title} style={themed($title)} />
            <TouchableOpacity onPress={handleClose} style={themed($closeButton)}>
              <MaterialCommunityIcons name="close" size={24} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          {/* Search Bar */}
          <View style={themed($searchContainer)}>
            <MaterialCommunityIcons name="magnify" size={20} color={theme.colors.textDim} style={themed($searchIcon)} />
            <TextInput
              style={themed($searchInput)}
              placeholder="Search"
              placeholderTextColor={theme.colors.textDim}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery("")} style={themed($clearButton)}>
                <MaterialCommunityIcons name="close-circle" size={20} color={theme.colors.textDim} />
              </TouchableOpacity>
            )}
          </View>

          {/* App List */}
          <ScrollView style={themed($scrollView)} contentContainerStyle={themed($scrollContent)}>
            {/* Debug text */}
            <Text style={{color: theme.colors.text, padding: 10}}>Showing {filteredApps.length} apps</Text>

            {filteredApps.length === 0 ? (
              <View style={themed($emptyState)}>
                <MaterialCommunityIcons name="application-outline" size={48} color={theme.colors.textDim} />
                <Text
                  text={searchQuery ? translate("common:noResults") : translate("common:noApps")}
                  style={themed($emptyText)}
                />
              </View>
            ) : (
              filteredApps.map(app => {
                const isSelected = app.packageName === selectedPackageName
                const isCompatible = app.compatibility?.isCompatible !== false
                const compatibilityMessage = app.compatibility?.message || ""
                const isOffline = isOfflineApp(app)

                return (
                  <TouchableOpacity
                    key={app.packageName}
                    style={themed($appItem)}
                    onPress={() => handleAppPress(app)}
                    disabled={!isCompatible && showCompatibilityWarnings}>
                    <View style={themed($appItemContent)}>
                      <AppIcon app={app} style={themed($appIconSmall)} />
                      <View style={themed($appInfo)}>
                        <View style={themed($appNameRow)}>
                          <Text text={app.name} style={themed($appName)} numberOfLines={1} />
                          {isOffline && (
                            <View style={themed($badge)}>
                              <MaterialCommunityIcons name="home" size={12} color={theme.colors.text} />
                            </View>
                          )}
                          {isSelected && (
                            <MaterialCommunityIcons
                              name="check-circle"
                              size={20}
                              color={theme.colors.palette.primary400}
                            />
                          )}
                        </View>
                        {!isCompatible && showCompatibilityWarnings && compatibilityMessage && (
                          <View style={themed($warningContainer)}>
                            <MaterialCommunityIcons name="alert-circle" size={14} color={theme.colors.error} />
                            <Text text={compatibilityMessage} style={themed($warningText)} numberOfLines={2} />
                          </View>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                )
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

// Styles
const $modalOverlay: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  backgroundColor: "rgba(0, 0, 0, 0.5)",
  justifyContent: "flex-end",
})

const $modalContent: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.background,
  borderTopLeftRadius: spacing.lg,
  borderTopRightRadius: spacing.lg,
  height: "90%", // Changed from maxHeight to height for consistent sizing
  paddingBottom: Platform.OS === "ios" ? spacing.xl : spacing.lg,
})

const $header: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  padding: spacing.lg,
  paddingBottom: spacing.md,
})

const $title: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 20,
  fontWeight: "600",
  color: colors.text,
  flex: 1,
})

const $closeButton: ThemedStyle<ViewStyle> = ({spacing}) => ({
  padding: spacing.xs,
})

const $searchContainer: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  flexDirection: "row",
  alignItems: "center",
  backgroundColor: colors.backgroundAlt,
  borderRadius: spacing.sm,
  marginHorizontal: spacing.lg,
  marginBottom: spacing.md,
  paddingHorizontal: spacing.sm,
  borderWidth: 1,
  borderColor: colors.border,
})

const $searchIcon: ThemedStyle<ViewStyle> = ({spacing}) => ({
  marginRight: spacing.xs,
})

const $searchInput: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  flex: 1,
  fontSize: 16,
  color: colors.text,
  paddingVertical: spacing.sm,
})

const $clearButton: ThemedStyle<ViewStyle> = ({spacing}) => ({
  padding: spacing.xs,
})

const $scrollView: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  minHeight: 400, // Ensure minimum height for scrollview
})

const $scrollContent: ThemedStyle<ViewStyle> = ({spacing}) => ({
  paddingHorizontal: spacing.lg,
  paddingBottom: spacing.lg,
  flexGrow: 1, // Ensure content can grow
})

const $emptyState: ThemedStyle<ViewStyle> = ({spacing}) => ({
  alignItems: "center",
  justifyContent: "center",
  paddingVertical: spacing.xxl,
})

const $emptyText: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 16,
  color: colors.textDim,
  marginTop: spacing.md,
})

const $appItem: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.backgroundAlt,
  borderRadius: spacing.sm,
  marginBottom: spacing.sm,
  padding: spacing.md,
  borderWidth: 2,
  borderColor: colors.border,
  minHeight: 70, // Ensure minimum height
})

const $appItemContent: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
})

const $appIconSmall: ThemedStyle<ViewStyle> = ({spacing}) => ({
  width: spacing.xxl,
  height: spacing.xxl,
  borderRadius: spacing.sm,
})

const $appInfo: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $appNameRow: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
})

const $appName: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 16,
  fontWeight: "600",
  color: colors.text,
  flex: 1,
})

const $badge: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.palette.secondary400,
  borderRadius: spacing.xs,
  padding: spacing.xxs,
  paddingHorizontal: spacing.xs,
})

const $warningContainer: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  flexDirection: "row",
  alignItems: "flex-start",
  marginTop: spacing.xs,
  gap: spacing.xs,
  backgroundColor: colors.palette.angry100,
  padding: spacing.xs,
  borderRadius: spacing.xs,
})

const $warningText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 12,
  color: colors.error,
  flex: 1,
})
