import { SETTINGS_KEYS, useSettingsStore } from '@/stores/settings'
import { Appearance } from 'react-native'


export const getCurrentTheme = async (): Promise<"light" | "dark"> => {
    const theme = await useSettingsStore.getState().getSetting(SETTINGS_KEYS.theme_preference)
    if (theme === "system") {
        return Appearance.getColorScheme() === "dark" ? "dark" : "light"
    }
    if (theme === "light" || theme === "dark") {
        return theme as "light" | "dark"
    }
    return "light"
}

export const getThemeIsDark = async (): Promise<boolean> => {
    const theme = await getCurrentTheme()
    return theme === "dark"
}