import { createStore } from "zustand/vanilla";

export interface DeviceState {
    // Connection
    isConnected: boolean;

    // Battery
    batteryLevel: number;
    isCharging: boolean;

    // WiFi
    wifiConnected: boolean;
    wifiSSID: string | null;
    wifiIP: string | null;

    // Location
    location: { lat: number; lng: number } | null;

    // Actions
    setConnected: (connected: boolean) => void;
    setBattery: (level: number, charging: boolean) => void;
    setWifi: (connected: boolean, ssid: string | null, ip: string | null) => void;
    setLocation: (lat: number, lng: number) => void;
}

export const createDeviceStore = () => {
    return createStore<DeviceState>((set) => ({
        isConnected: false,
        batteryLevel: 100,
        isCharging: false,
        wifiConnected: false,
        wifiSSID: null,
        wifiIP: null,
        location: null,

        setConnected: (connected) => set({ isConnected: connected }),
        setBattery: (level, charging) => set({ batteryLevel: level, isCharging: charging }),
        setWifi: (connected, ssid, ip) => set({ wifiConnected: connected, wifiSSID: ssid, wifiIP: ip }),
        setLocation: (lat, lng) => set({ location: { lat, lng } }),
    }));
};
