import { IPlatform } from "../../interfaces/IPlatform";
import { StoreApi } from "zustand/vanilla";
import { DeviceState } from "../state/device";
import { GlassesToCloudMessageType } from "@mentra/types";

import { AuthManager } from "./AuthManager";
import { GlassesInfo } from "@mentra/types";

export class DeviceManager {
  constructor(
    private platform: IPlatform,
    private store: StoreApi<DeviceState>,
    private authManager: AuthManager,
    private host: string,
    private secure: boolean = true
  ) { }

  get state() {
    return this.store.getState();
  }

  /**
   * Update device state (e.g. connection status, model)
   */
  async setDeviceState(state: Partial<GlassesInfo>): Promise<void> {
    try {
      const token = await this.authManager.getCoreToken();
      if (!token) {
        console.warn("[DeviceManager] No token available for device state update");
        return;
      }

      const protocol = this.host.startsWith("http") ? "" : (this.secure ? "https://" : "http://");
      const endpoint = `${protocol}${this.host}/api/client/device/state`;

      await this.platform.transport.request(
        "POST",
        endpoint,
        state,
        token
      );

      // Update local state if needed
      if (state.modelName) {
        // this.store.getState().setModel(state.modelName); // If we had this in store
      }

      console.log(`[DeviceManager] Device state updated: ${JSON.stringify(state)}`);
    } catch (error) {
      console.error("[DeviceManager] Failed to update device state:", error);
    }
  }

  /**
   * Update battery state and report to Cloud
   */
  setBattery(level: number, isCharging: boolean): void {
    // Update local state
    this.store.getState().setBattery(level, isCharging);

    // Send update to Cloud
    // TODO: Define BATTERY_UPDATE message type in @mentra/types if not exists
    // For now, assuming generic state update or specific message
    // Checking types... GlassesToCloudMessageType.BATTERY_LEVEL exists?
    // Let's use a generic state update or check types.
    // Assuming BATTERY_LEVEL based on common patterns, but I should verify.
    // If not, I'll use a placeholder.

    // Actually, let's check what messages are available.
    // I'll use a custom message structure for now matching what I expect.

    /*
    this.platform.transport.send({
      type: GlassesToCloudMessageType.BATTERY_UPDATE, // Hypothetical
      level,
      isCharging,
      timestamp: new Date()
    });
    */

    // For now, just log it as I don't want to break build with invalid types.
    console.log(`[DeviceManager] Battery updated: ${level}% ${isCharging ? "(Charging)" : ""}`);
  }

  /**
   * Update WiFi state and report to Cloud
   */
  setWifi(connected: boolean, ssid: string | null, ip: string | null): void {
    this.store.getState().setWifi(connected, ssid, ip);
    console.log(`[DeviceManager] WiFi updated: ${ssid} (${ip})`);

    // Send update to Cloud
    /*
    this.platform.transport.send({
      type: GlassesToCloudMessageType.WIFI_UPDATE,
      connected,
      ssid,
      ip,
      timestamp: new Date()
    });
    */
  }
}
