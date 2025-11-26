import WebSocket from "ws";
import { EventEmitter } from "eventemitter3";
import { TransportLayer, TransportEvents } from "./interface";

export class NodeTransport extends TransportLayer {
    private ws: WebSocket | null = null;

    constructor() {
        super();
    }

    get isConnected(): boolean {
        return this.ws?.readyState === WebSocket.OPEN;
    }

    connect(url: string, protocols?: string | string[]): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(url, protocols);

                this.ws.on("open", () => {
                    this.emit("open");
                    resolve();
                });

                this.ws.on("close", (code, reason) => {
                    this.emit("close", code, reason.toString());
                    this.ws = null;
                });

                this.ws.on("message", (data) => {
                    try {
                        const parsed = JSON.parse(data.toString());
                        this.emit("message", parsed);
                    } catch (err) {
                        console.error("Failed to parse message:", err);
                    }
                });

                this.ws.on("error", (err) => {
                    this.emit("error", err);
                    // If connecting, reject the promise
                    if (this.ws?.readyState === WebSocket.CONNECTING) {
                        reject(err);
                    }
                });
            } catch (err) {
                reject(err);
            }
        });
    }

    send(data: any): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error("WebSocket is not connected");
        }
        this.ws.send(JSON.stringify(data));
    }

    close(): void {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}
