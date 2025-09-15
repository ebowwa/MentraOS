import React, {useState, useEffect, useMemo} from "react"
import {View, ScrollView, Switch, Platform, TextInput, Image} from "react-native"
import {useRouter} from "expo-router"
import {NativeModules} from "react-native"

import {Screen, Text, Header} from "@/components/ignite"
import {useAppTheme} from "@/utils/useAppTheme"

const {NotificationApps} = NativeModules

interface NotificationApp {
  packageName: string
  appName: string
  icon?: string
  enabled?: boolean
}

export default function NotificationSettingsScreen() {
  const {theme} = useAppTheme()
  const router = useRouter()

  const [apps, setApps] = useState<NotificationApp[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")

  useEffect(() => {
    loadApps()
  }, [])

  const loadApps = async () => {
    try {
      console.log("🔍 Loading all installed apps...")
      const allApps = await NotificationApps.getAllInstalledApps()
      console.log("📱 Total apps discovered:", allApps.length)

      // Look for Discord specifically
      const discordApp = allApps.find(
        (app: any) =>
          app.packageName.toLowerCase().includes("discord") || app.appName.toLowerCase().includes("discord"),
      )

      if (discordApp) {
        console.log("🎮 DISCORD FOUND!")
        console.log(`   Name: ${discordApp.appName}`)
        console.log(`   Package: ${discordApp.packageName}`)
        console.log(`   Has Icon: ${discordApp.icon ? "YES" : "NO"}`)
        console.log(`   Category: ${discordApp.category}`)
      } else {
        console.log("❌ DISCORD NOT FOUND IN FILTERED LIST")
      }

      const appsWithToggle = allApps.map((app: any) => ({
        ...app,
        enabled: true, // Default all to enabled for now
      }))

      console.log("✅ Apps loaded for UI:", appsWithToggle.length)
      setApps(appsWithToggle)
    } catch (error) {
      console.error("❌ Error loading apps:", error)
    } finally {
      setLoading(false)
    }
  }

  const toggleApp = (packageName: string, enabled: boolean) => {
    setApps(prevApps => prevApps.map(app => (app.packageName === packageName ? {...app, enabled} : app)))
  }

  // Filter apps based on search query (app name only)
  const filteredApps = useMemo(() => {
    if (!searchQuery) return apps

    const query = searchQuery.toLowerCase()
    return apps.filter(app => app.appName.toLowerCase().includes(query))
  }, [apps, searchQuery])

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
          <Text style={{color: theme.colors.textDim}}>Loading apps...</Text>
        </View>
      </Screen>
    )
  }

  return (
    <Screen preset="fixed" style={{paddingHorizontal: theme.spacing.md}}>
      <Header title="Notification Settings" leftIcon="caretLeft" onLeftPress={() => router.back()} />

      {/* Search Bar */}
      <View
        style={{
          backgroundColor: theme.colors.palette.neutral200,
          borderRadius: 8,
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.sm,
          marginBottom: theme.spacing.md,
        }}>
        <TextInput
          placeholder="Search apps..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={{
            fontSize: 16,
            color: theme.colors.text,
          }}
          placeholderTextColor={theme.colors.textDim}
        />
      </View>

      <ScrollView style={{flex: 1}} showsVerticalScrollIndicator={false}>
        <Text
          style={{
            fontSize: 16,
            color: theme.colors.text,
            marginBottom: theme.spacing.md,
            textAlign: "center",
          }}>
          {searchQuery
            ? `${filteredApps.filter(app => app.enabled).length} of ${filteredApps.length} apps enabled (filtered)`
            : `${apps.filter(app => app.enabled).length} of ${apps.length} apps enabled`}
        </Text>

        {filteredApps.map(app => (
          <View
            key={app.packageName}
            style={{
              backgroundColor: theme.colors.background,
              borderRadius: 8,
              padding: theme.spacing.md,
              marginBottom: theme.spacing.sm,
              flexDirection: "row",
              alignItems: "center",
              borderWidth: 1,
              borderColor: theme.colors.palette.neutral200,
            }}>
            {/* App Icon */}
            <Image
              source={{uri: app.icon}}
              style={{
                width: 32,
                height: 32,
                marginRight: theme.spacing.md,
                borderRadius: 6,
              }}
              onError={() => {
                console.log(`❌ Icon failed to load for ${app.appName}`)
              }}
            />

            {/* App Name */}
            <Text
              style={{
                fontSize: 16,
                color: theme.colors.text,
                flex: 1,
                marginRight: theme.spacing.md,
              }}>
              {app.appName}
            </Text>

            {/* Toggle Switch */}
            <Switch
              value={app.enabled}
              onValueChange={enabled => toggleApp(app.packageName, enabled)}
              trackColor={{
                false: theme.colors.palette.neutral300,
                true: theme.colors.tint,
              }}
              thumbColor={app.enabled ? "#ffffff" : "#f4f3f4"}
            />
          </View>
        ))}
      </ScrollView>
    </Screen>
  )
}
