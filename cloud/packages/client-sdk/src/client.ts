import { EventEmitter } from "eventemitter3";
import { TransportLayer } from "./transport/interface";
import { NodeTransport } from "./transport/node";
import {
    GlassesToCloudMessage,
    CloudToGlassesMessage,
    GlassesToCloudMessageType,
    CloudToGlassesMessageType,
    ConnectionInit,
    GlassesConnectionState,
    GlassesBatteryUpdate,
} from "@mentra/types";

export interface ClientConfig {
    host: string;
    token: string;
    secure?: boolean;
    transport?: TransportLayer;
    deviceInfo?: {
        modelName: string;
        firmwareVersion: string;
    };
}

import { AppModule } from "./modules/apps";
import { HardwareModule } from "./modules/hardware";
import { DeviceState } from "./state/device-state";
import { CapabilityManager, DEFAULT_CAPABILITIES } from "./state/capabilities";

export class MentraClient extends EventEmitter {
    private transport: TransportLayer;
    public readonly config: ClientConfig;
    private heartbeatInterval: NodeJS.Timeout | null = null;

    public hardware: HardwareModule;
    public apps: AppModule;
    public state: DeviceState;
    public capabilities: CapabilityManager;

    constructor(config: ClientConfig) {
        super();
        this.config = {
            secure: true,
            deviceInfo: {
                modelName: "Mentra Headless Client",
                firmwareVersion: "0.0.1",
            },
            ...config,
        };
        this.transport = config.transport || new NodeTransport();
        this.hardware = new HardwareModule(this);
        this.apps = new AppModule(this);
        this.state = new DeviceState(this.config.deviceInfo!.modelName);
        this.capabilities = new CapabilityManager(DEFAULT_CAPABILITIES);

        this.setupTransportListeners();
    }

    private setupTransportListeners() {
        this.transport.on("open", () => {
            this.emit("connected");
            this.sendInit();
            this.startHeartbeat();
        });

        this.transport.on("close", (code, reason) => {
            this.emit("disconnected", { code, reason });
            this.stopHeartbeat();
        });

        this.transport.on("error", (err) => {
            this.emit("error", err);
        });

        this.transport.on("message", (msg: CloudToGlassesMessage) => {
            this.handleMessage(msg);
        });
    }

    public async connect() {
        const protocol = this.config.secure ? "wss" : "ws";
        const url = `${protocol}://${this.config.host}/glasses-ws?token=${this.config.token}`;
        await this.transport.connect(url);
    }

    public disconnect() {
        this.transport.close();
    }

    public send(message: GlassesToCloudMessage) {
        this.transport.send(message);
    }

    private sendInit() {
        const initMsg: ConnectionInit = {
            type: GlassesToCloudMessageType.CONNECTION_INIT,
            // modelName and firmwareVersion are sent in GLASSES_CONNECTION_STATE or separate handshake if needed
            // Checking type definition, ConnectionInit might be empty or have different props
            // Based on protocol spec, it might be empty for now or just type
        };
        this.send(initMsg);
    }

    private startHeartbeat() {
        this.stopHeartbeat();
        this.heartbeatInterval = setInterval(() => {
            this.sendHeartbeat();
        }, 30000); // 30s heartbeat
        this.sendHeartbeat(); // Send immediately
    }

    private stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    private sendHeartbeat() {
        const stateMsg = this.state.getConnectionState();
        // Ensure type is correct enum value
        stateMsg.type = GlassesToCloudMessageType.GLASSES_CONNECTION_STATE;
        this.send(stateMsg);

        const batteryMsg = this.state.getBatteryUpdate();
        // Ensure type is correct enum value
        batteryMsg.type = GlassesToCloudMessageType.GLASSES_BATTERY_UPDATE;
        this.send(batteryMsg);
    }

    private async handleMessage(msg: CloudToGlassesMessage) {
        // Update internal state based on message type
        switch (msg.type) {
            case CloudToGlassesMessageType.APP_STATE_CHANGE:
                try {
                    const apps = await this.apps.listApps();
                    this.state.setApps(apps.map(a => a.packageName));
                } catch (err) {
                    console.error("Failed to update app list on state change", err);
                }
                break;
            case CloudToGlassesMessageType.DISPLAY_EVENT:
                // Default to "main" view as it's not provided in the event
                this.state.setDisplay("main", msg.layout);
                break;
            case CloudToGlassesMessageType.MICROPHONE_STATE_CHANGE:
                this.state.setMicrophone(msg.bypassVad ?? false, msg.requiredData);
                break;
            case CloudToGlassesMessageType.CONNECTION_ACK:
                this.emit("authenticated", msg);
                break;
        }

        // Emit generic message event
        this.emit("message", msg);

        // Emit specific event based on message type
        this.emit(msg.type, msg);
    }
}
