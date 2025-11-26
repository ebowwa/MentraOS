import EventEmitter from "eventemitter3";
import { IPlatform } from "../interfaces/IPlatform";
import { CloudToGlassesMessage, GlassesToCloudMessage } from "@mentra/types";
import { StoreApi } from "zustand/vanilla";
import { DeviceState, createDeviceStore } from "./state/device";
import { AppletState, createAppletStore } from "./state/applets";
import { AuthManager } from "./modules/AuthManager";
import { AppManager } from "./modules/AppManager";
import { DeviceManager } from "./modules/DeviceManager";

export interface ClientConfig {
    host: string;
    token?: string;
    secure?: boolean;
    platform: IPlatform;
}

export class MentraClient extends EventEmitter {
    private config: ClientConfig;
    private platform: IPlatform;
    private state: StoreApi<DeviceState>;

    // State Stores
    // Modules
    public readonly auth: AuthManager;
    public readonly apps: AppManager;
    public readonly device: DeviceManager;

    constructor(config: ClientConfig) {
        super();
        this.config = { secure: true, ...config };
        this.platform = config.platform;

        // Initialize Stores
        // Initialize Stores
        this.state = createDeviceStore();
        const appStore = createAppletStore();

        // Initialize Modules
        this.auth = new AuthManager(this.platform);
        this.apps = new AppManager(this.platform, appStore, this.auth, this.config.host, this.config.secure);
        this.device = new DeviceManager(this.platform, this.state, this.auth, this.config.host, this.config.secure);

        // Pre-set token if provided
        if (config.token) {
            this.auth.setCoreToken(config.token).catch(console.error);
        }

        this.setupTransportListeners();
    }

    private setupTransportListeners() {
        this.platform.transport.onConnect(() => {
            this.state.getState().setConnected(true);
            this.emit("connected");
        });

        this.platform.transport.onDisconnect((code, reason) => {
            this.state.getState().setConnected(false);
            this.emit("disconnected", { code, reason });
        });

        this.platform.transport.onError((error) => {
            this.emit("error", error);
        });

        this.platform.transport.onMessage((message: CloudToGlassesMessage) => {
            this.emit("message", message);

            // Dispatch to modules
            this.apps.handleMessage(message);

            // Emit specific event type
            if (message.type) {
                this.emit(message.type, message);
            }
        });
    }

    async connect(): Promise<void> {
        const token = await this.auth.getCoreToken();
        if (!token) {
            throw new Error("Cannot connect: No Core Token found. Call auth.setCoreToken() or auth.exchangeToken() first.");
        }

        const protocol = this.config.secure ? "wss" : "ws";
        const url = `${protocol}://${this.config.host}/glasses-ws`;

        await this.platform.transport.connect(url, token);
    }

    disconnect(): void {
        this.platform.transport.disconnect();
    }

    send(message: GlassesToCloudMessage): void {
        this.platform.transport.send(message);
    }

    sendAudioChunk(data: ArrayBuffer | Buffer): void {
        this.platform.transport.sendBinary(data);
    }

    get hardware() {
        return this.platform.hardware;
    }
}
