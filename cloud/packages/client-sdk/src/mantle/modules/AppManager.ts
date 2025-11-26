import { IPlatform } from "../../interfaces/IPlatform";
import { AppletState } from "../state/applets";
import { StoreApi } from "zustand/vanilla";
import { CloudToGlassesMessage, CloudToGlassesMessageType, AppletInterface } from "@mentra/types";
import { AuthManager } from "./AuthManager";

export class AppManager {
    constructor(
        private platform: IPlatform,
        private store: StoreApi<AppletState>,
        private authManager: AuthManager,
        private host: string,
        private secure: boolean = true
    ) { }

    get state() {
        return this.store.getState();
    }

    get list() {
        return this.store.getState().installedApps;
    }

    /**
     * Handle incoming messages from Cloud
     */
    handleMessage(message: CloudToGlassesMessage) {
        switch (message.type) {
            case CloudToGlassesMessageType.APP_STATE_CHANGE:
                console.log("[AppManager] Received APP_STATE_CHANGE, syncing apps...");
                this.syncInstalledApps();
                break;

            case CloudToGlassesMessageType.APP_STARTED:
                if ('packageName' in message && typeof message.packageName === 'string') {
                    this.store.getState().addRunningApp(message.packageName);
                    this.store.getState().setForegroundApp(message.packageName);
                }
                break;

            case CloudToGlassesMessageType.APP_STOPPED:
                if ('packageName' in message && typeof message.packageName === 'string') {
                    this.store.getState().removeRunningApp(message.packageName);
                }
                break;
        }
    }

    /**
     * Sync installed apps from Cloud
     */
    async syncInstalledApps(): Promise<void> {
        try {
            const token = await this.authManager.getCoreToken();
            if (!token) {
                console.warn("[AppManager] No token available for sync");
                return;
            }

            // Construct full URL
            const protocol = this.host.startsWith("http") ? "" : (this.secure ? "https://" : "http://");
            const endpoint = `${protocol}${this.host}/api/apps/installed`;

            const response = await this.platform.transport.request<{ success: boolean; data: AppletInterface[] }>(
                "GET",
                endpoint,
                undefined,
                token
            );

            if (response && response.success && Array.isArray(response.data)) {
                this.store.getState().setInstalledApps(response.data);
                console.log(`[AppManager] Synced ${response.data.length} apps`);
            }
        } catch (error) {
            console.error("[AppManager] Failed to sync apps:", error);
        }
    }

    async install(packageName: string): Promise<void> {
        await this.makeAuthenticatedRequest("POST", `/api/apps/install/${packageName}`);
    }

    async uninstall(packageName: string): Promise<void> {
        await this.makeAuthenticatedRequest("POST", `/api/apps/uninstall/${packageName}`);
    }

    async start(packageName: string): Promise<void> {
        await this.makeAuthenticatedRequest("POST", `/api/apps/${packageName}/start`);
    }

    async stop(packageName: string): Promise<void> {
        await this.makeAuthenticatedRequest("POST", `/api/apps/${packageName}/stop`);
    }

    private async makeAuthenticatedRequest(method: string, path: string, data?: any): Promise<any> {
        const token = await this.authManager.getCoreToken();
        if (!token) throw new Error("No authentication token");

        const protocol = this.host.startsWith("http") ? "" : (this.secure ? "https://" : "http://");
        const endpoint = `${protocol}${this.host}${path}`;

        return this.platform.transport.request(method, endpoint, data, token);
    }
}
