import {create} from "zustand"

interface GlassesInfo {
  connected: boolean
  deviceModelName: string | null
  deviceFwVersion: string | null
  glasses_use_wifi: boolean
  glasses_wifi_connected?: boolean
  glasses_wifi_ssid?: string | null
  battery_level: number | null
  is_charging: boolean
  battery_level_case?: number | null
  is_case_charging?: boolean
}

interface GlassesState extends GlassesInfo {
  setGlassesInfo: (info: Partial<GlassesInfo>) => void
  setConnected: (connected: boolean) => void
  setBatteryInfo: (
    battery_level: number,
    is_charging: boolean,
    battery_level_case?: number,
    is_case_charging?: boolean,
  ) => void
  setWifiInfo: (wifi_connected: boolean, wifi_ssid: string | null) => void
  reset: () => void
}

const initialState: GlassesInfo = {
  connected: false,
  deviceModelName: null,
  deviceFwVersion: null,
  glasses_use_wifi: false,
  glasses_wifi_connected: undefined,
  glasses_wifi_ssid: null,
  battery_level: null,
  is_charging: false,
  battery_level_case: undefined,
  is_case_charging: false,
}

export const useGlassesStore = create<GlassesState>(set => ({
  ...initialState,

  setGlassesInfo: info => set(state => ({...state, ...info})),

  setConnected: connected => set({connected}),

  setBatteryInfo: (battery_level, is_charging, battery_level_case, is_case_charging) =>
    set({
      battery_level,
      is_charging,
      battery_level_case,
      is_case_charging: is_case_charging ?? false,
    }),

  setWifiInfo: (wifi_connected, wifi_ssid) =>
    set({
      glasses_wifi_connected: wifi_connected,
      glasses_wifi_ssid: wifi_ssid,
    }),

  reset: () => set(initialState),
}))
