import React, {useState, useEffect} from "react"
import {View, ScrollView, Switch, Platform, TextInput, TouchableOpacity} from "react-native"
import {useRouter} from "expo-router"
import Toast from "react-native-toast-message"

import {Screen, Text, Header} from "@/components/ignite"
import {useAppTheme} from "@/utils/useAppTheme"
import {NotificationPreferences} from "@/utils/NotificationPreferences"
import showAlert from "@/utils/AlertUtils"

interface BlacklistedApp {
  name: string
  blocked: boolean
}

export default function NotificationSettingsScreen() {
  const {theme} = useAppTheme()
  const router = useRouter()

  const [blacklistedApps, setBlacklistedApps] = useState<BlacklistedApp[]>([])
  const [newAppName, setNewAppName] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadBlacklistedApps()
  }, [])

  const loadBlacklistedApps = async () => {
    try {
      console.log("📋 Loading notification blacklist...")
      const appPrefs = await NotificationPreferences.getAppPreferences()

      // Only load apps that are actually in the blacklist (manual apps)
      const manualApps = Object.values(appPrefs)
        .filter(pref => pref.packageName.startsWith("manual."))
        .map(pref => ({
          name: pref.appName,
          blocked: !pref.enabled, // Inverted: enabled=false means blocked=true
        }))

      console.log("✅ Loaded blacklisted apps:", manualApps.length)
      setBlacklistedApps(manualApps)
    } catch (error) {
      console.error("❌ Error loading blocked apps:", error)
    } finally {
      setLoading(false)
    }
  }

  const addApp = async () => {
    if (!newAppName.trim()) {
      Toast.show({
        type: "error",
        text1: "Please enter an app name",
      })
      return
    }

    const appName = newAppName.trim()

    // Check if app already exists
    if (blacklistedApps.some(app => app.name.toLowerCase() === appName.toLowerCase())) {
      Toast.show({
        type: "error",
        text1: "App already in blacklist",
      })
      return
    }

    try {
      console.log(`🚫 Adding app to blacklist: ${appName}`)

      // Save to preferences (blocked = enabled false)
      const packageName = `manual.${appName.toLowerCase().replace(/\s+/g, ".")}`
      await NotificationPreferences.setAppPreference(packageName, appName, false) // false = blocked

      // Add to local state
      const newApp = {name: appName, blocked: true} // Added to blacklist = blocked
      setBlacklistedApps(prev => [...prev, newApp].sort((a, b) => a.name.localeCompare(b.name)))

      setNewAppName("")

      console.log(`✅ Added app to blacklist: ${appName}`)
    } catch (error) {
      console.error("❌ Error adding app:", error)
      Toast.show({
        type: "error",
        text1: "Failed to add app",
      })
    }
  }

  const removeApp = async (appName: string) => {
    try {
      console.log(`🗑️ Completely removing app: ${appName}`)

      // Completely remove from preferences storage
      const packageName = `manual.${appName.toLowerCase().replace(/\s+/g, ".")}`
      await NotificationPreferences.removeAppPreference(packageName)

      // Remove from local state
      setBlacklistedApps(prev => prev.filter(app => app.name !== appName))

      console.log(`✅ Completely removed app from storage: ${appName}`)
    } catch (error) {
      console.error("❌ Error removing app:", error)
      Toast.show({
        type: "error",
        text1: "Failed to remove app",
      })
    }
  }

  const toggleApp = async (appName: string, blocked: boolean) => {
    try {
      console.log(`🔄 ${blocked ? "BLOCKING" : "UNBLOCKING"} ${appName}`)

      // Save to preferences (inverted logic: blocked=true means enabled=false)
      const packageName = `manual.${appName.toLowerCase().replace(/\s+/g, ".")}`
      await NotificationPreferences.setAppPreference(packageName, appName, !blocked) // Invert for storage

      // Update local state
      setBlacklistedApps(prev => prev.map(app => (app.name === appName ? {...app, blocked} : app)))

      Toast.show({
        type: blocked ? "error" : "success",
        text1: `${appName} ${blocked ? "blocked" : "unblocked"}`,
      })

      console.log(`✅ ${blocked ? "BLOCKED" : "UNBLOCKED"} ${appName}`)
    } catch (error) {
      console.error("❌ Error toggling app:", error)
      Toast.show({
        type: "error",
        text1: "Failed to update app",
      })
    }
  }

  // Show iOS message if on iOS
  if (Platform.OS === "ios") {
    return (
      <Screen preset="fixed" style={{paddingHorizontal: theme.spacing.md}}>
        <Header title="Notification Settings" leftIcon="caretLeft" onLeftPress={() => router.back()} />
        <View style={{flex: 1, justifyContent: "center", alignItems: "center", padding: theme.spacing.lg}}>
          <Text
            style={{
              fontSize: 18,
              fontWeight: "600",
              color: theme.colors.text,
              textAlign: "center",
              marginBottom: theme.spacing.md,
            }}>
            iOS Notification Settings
          </Text>
          <Text style={{color: theme.colors.textDim, textAlign: "center", lineHeight: 22}}>
            Notification settings are managed through iOS System Settings. Go to Settings → Notifications → MentraOS to
            control notification preferences.
          </Text>
        </View>
      </Screen>
    )
  }

  if (loading) {
    return (
      <Screen preset="fixed" style={{paddingHorizontal: theme.spacing.md}}>
        <Header title="Notification Settings" leftIcon="caretLeft" onLeftPress={() => router.back()} />
        <View style={{flex: 1, justifyContent: "center", alignItems: "center"}}>
          <Text style={{color: theme.colors.textDim}}>Loading...</Text>
        </View>
      </Screen>
    )
  }

  return (
    <Screen preset="fixed" style={{paddingHorizontal: theme.spacing.md}}>
      <Header title="Notification Settings" leftIcon="caretLeft" onLeftPress={() => router.back()} />

      {/* Add New App */}
      <View
        style={{
          backgroundColor: "rgba(255, 255, 255, 0.05)",
          borderRadius: 12,
          padding: theme.spacing.lg,
          marginBottom: theme.spacing.lg,
          borderWidth: 1,
          borderColor: "rgba(255, 255, 255, 0.1)",
        }}>
        <Text
          style={{
            fontSize: 18,
            fontWeight: "700",
            color: theme.colors.text,
            marginBottom: theme.spacing.sm,
          }}>
          🚫 Notification Blacklist
        </Text>

        <Text
          style={{
            fontSize: 14,
            color: theme.colors.textDim,
            marginBottom: theme.spacing.md,
            lineHeight: 20,
          }}>
          Add apps to block their notifications from reaching your glasses
        </Text>

        <View style={{flexDirection: "row", alignItems: "center"}}>
          <TextInput
            placeholder="App name"
            value={newAppName}
            onChangeText={setNewAppName}
            style={{
              flex: 1,
              fontSize: 16,
              color: theme.colors.text,
              backgroundColor: "rgba(255, 255, 255, 0.1)",
              borderRadius: 8,
              paddingHorizontal: theme.spacing.md,
              paddingVertical: theme.spacing.sm,
              marginRight: theme.spacing.sm,
              borderWidth: 1,
              borderColor: "rgba(255, 255, 255, 0.2)",
            }}
            placeholderTextColor={theme.colors.textDim}
            onSubmitEditing={addApp}
            returnKeyType="done"
          />

          <TouchableOpacity
            onPress={addApp}
            style={{
              backgroundColor: theme.colors.error,
              paddingHorizontal: theme.spacing.lg,
              paddingVertical: theme.spacing.sm,
              borderRadius: 8,
              minWidth: 60,
              alignItems: "center",
            }}>
            <Text style={{color: "white", fontWeight: "600", fontSize: 16}}>Block</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Stats */}
      <View
        style={{
          backgroundColor: "rgba(255, 255, 255, 0.05)",
          padding: theme.spacing.md,
          borderRadius: 8,
          marginBottom: theme.spacing.md,
          borderWidth: 1,
          borderColor: "rgba(255, 255, 255, 0.1)",
        }}>
        <Text style={{fontSize: 14, color: theme.colors.textDim, textAlign: "center"}}>
          {blacklistedApps.filter(app => app.blocked).length} of {blacklistedApps.length} apps blocked
        </Text>
      </View>

      {/* Apps List */}
      <ScrollView style={{flex: 1}} showsVerticalScrollIndicator={false}>
        {blacklistedApps.length === 0 ? (
          <View style={{padding: theme.spacing.lg, alignItems: "center"}}>
            <Text style={{color: theme.colors.textDim, textAlign: "center", fontSize: 16}}>
              No apps blacklisted yet
            </Text>
            <Text style={{color: theme.colors.textDim, textAlign: "center", marginTop: theme.spacing.sm}}>
              Add app names above to block their notifications
            </Text>
          </View>
        ) : (
          blacklistedApps.map(app => (
            <View
              key={app.name}
              style={{
                backgroundColor: "rgba(255, 255, 255, 0.05)",
                borderRadius: 12,
                padding: theme.spacing.md,
                marginBottom: theme.spacing.md,
                flexDirection: "row",
                alignItems: "center",
                borderWidth: 1,
                borderColor: app.blocked ? theme.colors.error : "rgba(255, 255, 255, 0.1)",
              }}>
              {/* App Icon (Letter) */}
              <View
                style={{
                  width: 48,
                  height: 48,
                  marginRight: theme.spacing.md,
                  backgroundColor: app.blocked ? theme.colors.error : theme.colors.palette.primary100,
                  borderRadius: 12,
                  justifyContent: "center",
                  alignItems: "center",
                }}>
                <Text
                  style={{
                    fontSize: 18,
                    color: "white",
                    fontWeight: "700",
                  }}>
                  {app.name.charAt(0).toUpperCase()}
                </Text>
              </View>

              {/* App Info */}
              <View style={{flex: 1, marginRight: theme.spacing.md}}>
                <Text
                  style={{
                    fontSize: 17,
                    fontWeight: "600",
                    color: theme.colors.text,
                    marginBottom: 2,
                  }}>
                  {app.name}
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    color: app.blocked ? theme.colors.error : theme.colors.palette.success500,
                    fontWeight: "500",
                  }}>
                  {app.blocked ? "🚫 Notifications blocked" : "✅ Notifications allowed"}
                </Text>
              </View>

              {/* Block Toggle */}
              <View style={{alignItems: "center", marginRight: theme.spacing.sm}}>
                <Switch
                  value={app.blocked}
                  onValueChange={blocked => toggleApp(app.name, blocked)}
                  trackColor={{
                    false: theme.colors.palette.success100,
                    true: theme.colors.error,
                  }}
                  thumbColor="#ffffff"
                />
              </View>

              {/* Remove Button */}
              <TouchableOpacity
                onPress={() => {
                  showAlert("Remove from Blacklist", `Remove ${app.name} from the notification blacklist?`, [
                    {text: "Cancel", style: "cancel"},
                    {text: "Remove", style: "destructive", onPress: () => removeApp(app.name)},
                  ])
                }}
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.1)",
                  borderRadius: 8,
                  padding: theme.spacing.sm,
                  marginLeft: theme.spacing.xs,
                  borderWidth: 1,
                  borderColor: "rgba(255, 255, 255, 0.2)",
                }}>
                <Text style={{fontSize: 16}}>🗑️</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
    </Screen>
  )
}
