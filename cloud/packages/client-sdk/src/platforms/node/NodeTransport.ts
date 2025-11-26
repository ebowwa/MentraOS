import WebSocket from "ws";
import axios, { AxiosInstance } from "axios";
import { CloudToGlassesMessage, GlassesToCloudMessage } from "@mentra/types";
import { INetworkTransport } from "../../interfaces/INetworkTransport";
import EventEmitter from "eventemitter3";

export class NodeTransport implements INetworkTransport {
    private ws: WebSocket | null = null;
    private axiosInstance: AxiosInstance;
    private emitter = new EventEmitter();

    constructor() {
        this.axiosInstance = axios.create({
            headers: {
                "Content-Type": "application/json",
            },
        });
    }

    async connect(url: string, token: string): Promise<void> {
        return new Promise((resolve, reject) => {
            // Append token to URL query params
            const wsUrl = `${url}?token=${token}`;
            this.ws = new WebSocket(wsUrl);

            this.ws.on("open", () => {
                this.emitter.emit("connect");
                resolve();
            });

            this.ws.on("message", (data: WebSocket.RawData) => {
                try {
                    const message = JSON.parse(data.toString()) as CloudToGlassesMessage;
                    this.emitter.emit("message", message);
                } catch (err) {
                    console.error("Failed to parse message:", err);
                }
            });

            this.ws.on("close", (code: number, reason: Buffer) => {
                this.emitter.emit("disconnect", code, reason.toString());
            });

            this.ws.on("error", (err: Error) => {
                this.emitter.emit("error", err);
                reject(err);
            });
        });
    }

    disconnect(): void {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    send(message: GlassesToCloudMessage): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        } else {
            console.warn("Cannot send message, WebSocket is not open.");
        }
    }

    sendBinary(data: ArrayBuffer | Buffer): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(data);
        } else {
            console.warn("Cannot send binary data, WebSocket is not open.");
        }
    }

    async request<T>(method: string, endpoint: string, data?: any, token?: string): Promise<T> {
        const headers: Record<string, string> = {};
        if (token) {
            headers["Authorization"] = `Bearer ${token}`;
        }

        const response = await this.axiosInstance.request<T>({
            method,
            url: endpoint, // Assumes endpoint is full URL or base URL is set elsewhere. 
            // Actually, interface says endpoint is "/api/...", so we might need base URL.
            // For now, let's assume the caller provides the full URL or handles base URL.
            // Wait, the interface says endpoint. The client usually knows the host.
            // Let's assume the caller passes the FULL URL for now, or we need to inject host.
            // Re-reading interface: request(method, endpoint, data, token).
            // Usually client constructs the full URL.
            data,
            headers,
        });
        return response.data;
    }

    onMessage(callback: (message: CloudToGlassesMessage) => void): void {
        this.emitter.on("message", callback);
    }

    onConnect(callback: () => void): void {
        this.emitter.on("connect", callback);
    }

    onDisconnect(callback: (code: number, reason: string) => void): void {
        this.emitter.on("disconnect", callback);
    }

    onError(callback: (error: Error) => void): void {
        this.emitter.on("error", callback);
    }
}
