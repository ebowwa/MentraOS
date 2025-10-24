import {Fragment, useMemo} from "react"
import {ScrollView, TextStyle, TouchableOpacity, View, ViewStyle} from "react-native"
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons"

import {Header, Screen, Switch, Text} from "@/components/ignite"
import AppIcon from "@/components/misc/AppIcon"
import Divider from "@/components/misc/Divider"
import {GetMoreAppsIcon} from "@/components/misc/GetMoreAppsIcon"
import {Spacer} from "@/components/ui/Spacer"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {ClientAppletInterface, useBackgroundApps, useStartApplet, useStopApplet} from "@/stores/applets"
import {SETTINGS_KEYS, useSetting} from "@/stores/settings"
import {ThemedStyle} from "@/theme"
import {showAlert} from "@/utils/AlertUtils"
import {askPermissionsUI} from "@/utils/PermissionsUtils"
import {useAppTheme} from "@/utils/useAppTheme"
import ChevronRight from "assets/icons/component/ChevronRight"

export default function BackgroundAppsScreen() {
  const {themed, theme} = useAppTheme()
  const {push, goBack} = useNavigationHistory()
  const [defaultWearable, _setDefaultWearable] = useSetting(SETTINGS_KEYS.default_wearable)
  const {active, inactive} = useBackgroundApps()
  const startApplet = useStartApplet()
  const stopApplet = useStopApplet()

  const incompatibleApplets = useMemo(
    () => inactive.filter(app => app.compatibility != null && app.compatibility.isCompatible === false),
    [inactive],
  )

  const inactiveApplets = useMemo(() => inactive.filter(app => app.compatibility?.isCompatible === true), [inactive])

  const toggleApp = async (app: ClientAppletInterface) => {
    if (app.running) {
      await stopApplet(app.packageName)
    } else {
      await startApp(app.packageName)
    }
  }

  const startApp = async (packageName: string) => {
    const app = inactive.find(a => a.packageName === packageName)
    if (!app) {
      console.error("App not found:", packageName)
      return
    }

    const permissionResult = await askPermissionsUI(app, theme)
    if (permissionResult === -1) {
      return
    } else if (permissionResult === 0) {
      await startApp(packageName) // start over / ask again
      return
    }
    await startApplet(packageName)
  }

  const openAppSettings = (app: ClientAppletInterface) => {
    if (app.webviewUrl && app.offline === false) {
      push("/applet/webview", {
        webviewURL: app.webviewUrl,
        appName: app.name,
        packageName: app.packageName,
      })
    } else {
      push("/applet/settings", {
        packageName: app.packageName,
        appName: app.name,
      })
    }
  }

  const renderAppItem = (app: ClientAppletInterface, index: number, isLast: boolean) => {
    const handleRowPress = () => {
      if (app.running) {
        openAppSettings(app)
      }
    }

    return (
      <Fragment key={app.packageName}>
        <TouchableOpacity
          style={themed($appRow)}
          onPress={handleRowPress}
          activeOpacity={app.running ? 0.7 : 1}
          disabled={!app.running}>
          <View style={themed($appContent)}>
            <AppIcon app={app} style={themed($appIcon)} />
            <View style={themed($appInfo)}>
              <Text
                text={app.name}
                style={[themed($appName), app.offline && themed($offlineApp)]}
                numberOfLines={1}
                ellipsizeMode="tail"
              />
              {app.offline && (
                <View style={themed($offlineRow)}>
                  <MaterialCommunityIcons name="alert-circle" size={14} color={theme.colors.error} />
                  <Text text="Offline" style={themed($offlineText)} />
                </View>
              )}
            </View>
          </View>
          <View style={themed($rightControls)}>
            {app.running && (
              <TouchableOpacity
                onPress={e => {
                  e.stopPropagation()
                  openAppSettings(app)
                }}
                style={themed($gearButton)}
                hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
                <MaterialCommunityIcons name="cog" size={22} color={theme.colors.textDim} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={e => {
                e.stopPropagation()
                toggleApp(app)
              }}
              activeOpacity={1}>
              <Switch value={app.running} onValueChange={() => toggleApp(app)} />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
        {!isLast && <Divider />}
      </Fragment>
    )
  }

  return (
    <Screen preset="fixed" style={themed($screen)}>
      <Header leftIcon="back" onLeftPress={goBack} title="Background Apps" />

      <View style={themed($headerInfo)}>
        <Text style={themed($headerText)}>Multiple background apps can be active at once.</Text>
      </View>

      <ScrollView
        style={themed($scrollView)}
        contentContainerStyle={themed($scrollViewContent)}
        showsVerticalScrollIndicator={false}>
        {inactive.length === 0 && active.length === 0 ? (
          <View style={themed($emptyContainer)}>
            <Text style={themed($emptyText)}>No background apps available</Text>
          </View>
        ) : (
          <>
            {active.length > 0 ? (
              <>
                <Text style={themed($sectionHeader)}>Active Background Apps</Text>
                <View style={themed($sectionContent)}>
                  {active.map((app, index) => renderAppItem(app, index, index === active.length - 1))}
                </View>
                <Spacer height={theme.spacing.lg} />
              </>
            ) : (
              <>
                <Text style={themed($sectionHeader)} tx="home:activeBackgroundApps" />
                <View style={themed($tipContainer)}>
                  <View style={themed($tipContent)}>
                    <Text style={themed($tipText)} tx="home:activateAnApp" />
                    <Text style={themed($tipSubtext)} tx="home:tapAnAppSwitch" />
                  </View>
                  <Switch value={false} onValueChange={() => {}} disabled={false} />
                </View>
                <Spacer height={theme.spacing.lg} />
              </>
            )}

            {inactiveApplets.length > 0 && (
              <>
                <Text style={themed($sectionHeader)} tx="home:inactiveBackgroundApps" />
                <View style={themed($sectionContent)}>
                  {inactiveApplets.map((app, index) => renderAppItem(app, index, false))}
                  <TouchableOpacity style={themed($appRow)} onPress={() => push("/store")} activeOpacity={0.7}>
                    <View style={themed($appContent)}>
                      <GetMoreAppsIcon size="medium" />
                      <View style={themed($appInfo)}>
                        <Text text="Get More Apps" style={themed($appName)} />
                        <Text text="Explore the MentraOS Store" style={themed($getMoreAppsSubtext)} />
                      </View>
                    </View>
                    <ChevronRight color={theme.colors.textDim} />
                  </TouchableOpacity>
                </View>
              </>
            )}

            {incompatibleApplets.length > 0 && (
              <>
                <Spacer height={theme.spacing.lg} />
                <Text style={themed($sectionHeader)}>{`Incompatible with ${defaultWearable}`}</Text>
                <View style={themed($sectionContent)}>
                  {incompatibleApplets.map((app, index) => (
                    <Fragment key={app.packageName}>
                      <TouchableOpacity
                        style={themed($appRow)}
                        onPress={() => {
                          const missingHardware =
                            app.compatibility?.missingRequired?.map(req => req.type.toLowerCase()).join(", ") ||
                            "required features"
                          showAlert(
                            "Hardware Incompatible",
                            `${app.name} requires ${missingHardware} which is not available on your connected glasses`,
                            [{text: "OK"}],
                            {
                              iconName: "alert-circle-outline",
                              iconColor: theme.colors.error,
                            },
                          )
                        }}
                        activeOpacity={0.7}>
                        <View style={themed($appContent)}>
                          <AppIcon app={app} style={themed($incompatibleAppIcon)} />
                          <View style={themed($appInfo)}>
                            <Text
                              text={app.name}
                              style={themed($incompatibleAppName)}
                              numberOfLines={1}
                              ellipsizeMode="tail"
                            />
                          </View>
                        </View>
                      </TouchableOpacity>
                      {index < incompatibleApplets.length - 1 && <Divider />}
                    </Fragment>
                  ))}
                </View>
              </>
            )}
          </>
        )}

        <Spacer height={theme.spacing.xxl} />
      </ScrollView>
    </Screen>
  )
}

const $screen: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $headerInfo: ThemedStyle<ViewStyle> = ({spacing, colors}) => ({
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
  borderBottomWidth: 1,
  borderBottomColor: colors.border,
})

const $headerText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 14,
  color: colors.textDim,
  textAlign: "center",
})

const $scrollView: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $scrollViewContent: ThemedStyle<ViewStyle> = ({spacing}) => ({
  paddingTop: spacing.md,
})

const $sectionHeader: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 14,
  fontWeight: "600",
  color: colors.textDim,
  marginBottom: spacing.xs,
  paddingHorizontal: spacing.lg,
  textTransform: "uppercase",
  letterSpacing: 0.5,
})

const $sectionContent: ThemedStyle<ViewStyle> = ({spacing}) => ({
  paddingHorizontal: spacing.lg,
})

const $appRow: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  paddingVertical: spacing.md,
  minHeight: 72,
})

const $appContent: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  alignItems: "center",
  flex: 1,
  gap: spacing.sm,
})

const $appIcon: ThemedStyle<ViewStyle> = () => ({
  width: 48,
  height: 48,
})

const $appInfo: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  justifyContent: "center",
  marginRight: spacing.lg,
  paddingRight: spacing.sm,
})

const $appName: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 16,
  color: colors.text,
  marginBottom: 2,
})

const $rightControls: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
})

const $offlineApp: ThemedStyle<TextStyle> = ({colors}) => ({
  textDecorationLine: "line-through",
  color: colors.textDim,
})

const $offlineRow: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
  marginTop: 2,
})

const $offlineText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 12,
  color: colors.error,
})

const $tipContainer: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  marginHorizontal: spacing.lg,
  paddingVertical: spacing.md,
  paddingHorizontal: spacing.md,
  backgroundColor: colors.backgroundAlt,
  borderRadius: spacing.sm,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  borderWidth: 1,
  borderColor: colors.border,
})

const $tipContent: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  gap: spacing.xs,
})

const $tipText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 15,
  fontWeight: "500",
  color: colors.text,
})

const $tipSubtext: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 13,
  color: colors.textDim,
})

const $gearButton: ThemedStyle<ViewStyle> = ({spacing}) => ({
  padding: spacing.xs,
})

const $emptyContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  alignItems: "center",
  justifyContent: "center",
  paddingVertical: spacing.xxxl,
})

const $emptyText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 15,
  color: colors.textDim,
  textAlign: "center",
})

const $getMoreAppsSubtext: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 12,
  color: colors.textDim,
  marginTop: 2,
})

const $incompatibleAppIcon: ThemedStyle<ViewStyle> = () => ({
  width: 48,
  height: 48,
  opacity: 0.4,
})

const $incompatibleAppName: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 16,
  color: colors.textDim,
})
