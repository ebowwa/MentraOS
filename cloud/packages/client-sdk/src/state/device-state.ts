import { EventEmitter } from "eventemitter3";
import { GlassesBatteryUpdate, GlassesConnectionState, GlassesToCloudMessageType } from "@mentra/types";

export interface WifiState {
    connected: boolean;
    ssid?: string;
    ip?: string;
}

export class DeviceState extends EventEmitter {
    public batteryLevel: number = 100;
    public isCharging: boolean = false;
    public wifi: WifiState = { connected: false };
    public modelName: string;

    // New State Fields
    public apps: string[] = []; // List of running package names
    public display: { view: "main" | "dashboard"; layout?: any } = { view: "main" };
    public microphone: { bypassVad: boolean; requiredData: string[] } = { bypassVad: false, requiredData: [] };
    public location: { lat: number; lng: number } | null = null;

    constructor(modelName: string) {
        super();
        this.modelName = modelName;
    }

    public setBattery(level: number, charging: boolean) {
        this.batteryLevel = level;
        this.isCharging = charging;
        this.emit("battery", { level, charging });
    }

    public setWifi(connected: boolean, ssid?: string, ip?: string) {
        this.wifi = { connected, ssid, ip };
        this.emit("wifi", this.wifi);
    }

    public setApps(apps: string[]) {
        this.apps = apps;
        this.emit("apps", this.apps);
    }

    public setDisplay(view: "main" | "dashboard", layout?: any) {
        this.display = { view, layout };
        this.emit("display", this.display);
    }

    public setMicrophone(bypassVad: boolean, requiredData: string[]) {
        this.microphone = { bypassVad, requiredData };
        this.emit("microphone", this.microphone);
    }

    public setLocation(lat: number, lng: number) {
        this.location = { lat, lng };
        this.emit("location", this.location);
    }

    public getBatteryUpdate(): GlassesBatteryUpdate {
        return {
            type: GlassesToCloudMessageType.GLASSES_BATTERY_UPDATE,
            level: this.batteryLevel,
            charging: this.isCharging,
        };
    }

    public getConnectionState(): GlassesConnectionState {
        return {
            type: GlassesToCloudMessageType.GLASSES_CONNECTION_STATE,
            modelName: this.modelName,
            status: "CONNECTED",
            wifi: {
                connected: this.wifi.connected,
                ssid: this.wifi.ssid,
            },
        };
    }
}
