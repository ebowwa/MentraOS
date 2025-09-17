import React, {useState, useEffect} from "react"
import {
  View,
  ScrollView,
  Switch,
  Platform,
  TextInput,
  TouchableOpacity,
  NativeModules,
  FlatList,
  ActivityIndicator,
  Image,
} from "react-native"
import {useRouter} from "expo-router"
import Toast from "react-native-toast-message"

import {Screen, Text, Header} from "@/components/ignite"
import {useAppTheme} from "@/utils/useAppTheme"

const {SimpleBlacklist} = NativeModules

interface InstalledApp {
  packageName: string
  appName: string
  isBlocked: boolean
  icon: string | null
}

export default function NotificationSettingsScreen() {
  const {theme} = useAppTheme()
  const router = useRouter()

  const [apps, setApps] = useState<InstalledApp[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    loadInstalledApps()
  }, [])

  const loadInstalledApps = async () => {
    try {
      console.log("Loading installed apps...")
      const installedApps = await SimpleBlacklist.getAllInstalledApps()

      // Sort alphabetically by app name
      const sortedApps = installedApps.sort((a: InstalledApp, b: InstalledApp) => a.appName.localeCompare(b.appName))

      setApps(sortedApps)
      console.log(`Loaded ${sortedApps.length} apps`)
    } catch (error) {
      console.error("Error loading apps:", error)
      Toast.show({
        type: "error",
        text1: "Failed to load apps",
        text2: "Please try again",
      })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const toggleApp = async (packageName: string, currentlyBlocked: boolean) => {
    try {
      const newBlockedState = !currentlyBlocked
      await SimpleBlacklist.toggleAppNotification(packageName, newBlockedState)

      // Update local state
      setApps(prev => prev.map(app => (app.packageName === packageName ? {...app, isBlocked: newBlockedState} : app)))

      Toast.show({
        type: newBlockedState ? "error" : "success",
        text1: newBlockedState ? "Notifications blocked" : "Notifications enabled",
        text2: apps.find(a => a.packageName === packageName)?.appName || packageName,
      })
    } catch (error) {
      console.error("Error toggling app:", error)
      Toast.show({
        type: "error",
        text1: "Failed to update setting",
      })
    }
  }

  const onRefresh = () => {
    setRefreshing(true)
    loadInstalledApps()
  }

  // Filter apps based on search query
  const filteredApps = apps.filter(
    app =>
      app.appName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.packageName.toLowerCase().includes(searchQuery.toLowerCase()),
  )

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
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={{color: theme.colors.textDim, marginTop: theme.spacing.md}}>Loading apps...</Text>
        </View>
      </Screen>
    )
  }

  const renderAppItem = ({item}: {item: InstalledApp}) => (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: theme.spacing.sm,
        paddingHorizontal: theme.spacing.md,
        backgroundColor: theme.colors.card,
        marginBottom: 1,
      }}>
      {/* App Icon */}
      <View
        style={{
          width: 40,
          height: 40,
          marginRight: theme.spacing.md,
          borderRadius: 8,
          backgroundColor: theme.colors.background,
          alignItems: "center",
          justifyContent: "center",
        }}>
        {item.icon ? (
          <Image
            source={{uri: `data:image/png;base64,${item.icon}`}}
            style={{width: 36, height: 36, borderRadius: 6}}
          />
        ) : (
          <Text style={{fontSize: 20}}>{item.appName.charAt(0)}</Text>
        )}
      </View>

      {/* App Info */}
      <View style={{flex: 1}}>
        <Text
          style={{
            fontSize: 15,
            fontWeight: "500",
            color: theme.colors.text,
            marginBottom: 2,
          }}>
          {item.appName}
        </Text>
        <Text
          style={{
            fontSize: 12,
            color: theme.colors.textDim,
          }}>
          {item.packageName}
        </Text>
      </View>

      {/* Toggle Switch */}
      <Switch
        value={!item.isBlocked}
        onValueChange={() => toggleApp(item.packageName, item.isBlocked)}
        trackColor={{false: "#767577", true: theme.colors.primary}}
        thumbColor={item.isBlocked ? "#f4f3f4" : "#f4f3f4"}
        ios_backgroundColor="#3e3e3e"
      />
    </View>
  )

  return (
    <Screen preset="fixed" style={{flex: 1}}>
      <Header title="Notification Settings" leftIcon="caretLeft" onLeftPress={() => router.back()} />

      {/* Search Bar */}
      <View
        style={{
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.sm,
          backgroundColor: theme.colors.background,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
        }}>
        <TextInput
          placeholder="Search apps..."
          placeholderTextColor={theme.colors.textDim}
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={{
            backgroundColor: theme.colors.card,
            borderRadius: 8,
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.xs,
            fontSize: 15,
            color: theme.colors.text,
          }}
        />
      </View>

      {/* Stats */}
      <View
        style={{
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.xs,
          backgroundColor: theme.colors.background,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
        }}>
        <Text style={{fontSize: 13, color: theme.colors.textDim}}>
          {filteredApps.filter(app => app.isBlocked).length} of {filteredApps.length} apps blocked
        </Text>
      </View>

      {/* Apps List */}
      <FlatList
        data={filteredApps}
        keyExtractor={item => item.packageName}
        renderItem={renderAppItem}
        contentContainerStyle={{paddingBottom: theme.spacing.xl}}
        onRefresh={onRefresh}
        refreshing={refreshing}
        ListEmptyComponent={
          <View style={{flex: 1, alignItems: "center", marginTop: theme.spacing.xxl}}>
            <Text style={{color: theme.colors.textDim}}>
              {searchQuery ? "No apps found matching your search" : "No apps found"}
            </Text>
          </View>
        }
      />
    </Screen>
  )
}
