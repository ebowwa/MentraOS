import { MentraClient } from "../client";

export interface AppInfo {
    packageName: string;
    name: string;
    version: string;
}

export class AppModule {
    constructor(private client: MentraClient) { }

    private get baseUrl(): string {
        const protocol = this.client.config.secure ? "https" : "http";
        return `${protocol}://${this.client.config.host}`;
    }

    private get headers(): HeadersInit {
        return {
            "Authorization": `Bearer ${this.client.config.token}`,
            "Content-Type": "application/json",
        };
    }

    public async listApps(): Promise<AppInfo[]> {
        const response = await fetch(`${this.baseUrl}/api/client/apps`, {
            method: "GET",
            headers: this.headers,
        });
        if (!response.ok) {
            throw new Error(`Failed to list apps: ${response.statusText}`);
        }
        return response.json();
    }

    public async startApp(packageName: string): Promise<void> {
        const response = await fetch(`${this.baseUrl}/apps/${packageName}/start`, {
            method: "POST",
            headers: this.headers,
        });
        if (!response.ok) {
            throw new Error(`Failed to start app ${packageName}: ${response.statusText}`);
        }
    }

    public async stopApp(packageName: string): Promise<void> {
        const response = await fetch(`${this.baseUrl}/apps/${packageName}/stop`, {
            method: "POST",
            headers: this.headers,
        });
        if (!response.ok) {
            throw new Error(`Failed to stop app ${packageName}: ${response.statusText}`);
        }
    }

    public async uninstallApp(packageName: string): Promise<void> {
        const response = await fetch(`${this.baseUrl}/api/apps/uninstall/${packageName}`, {
            method: "POST",
            headers: this.headers,
        });
        if (!response.ok) {
            throw new Error(`Failed to uninstall app ${packageName}: ${response.statusText}`);
        }
    }
}
