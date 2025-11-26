import { CloudToGlassesMessage, GlassesToCloudMessage } from "@mentra/types";

export interface INetworkTransport {
    /**
     * Connect to the Mentra Cloud
     * @param url WebSocket URL
     * @param token Authentication token
     */
    connect(url: string, token: string): Promise<void>;

    /**
     * Disconnect from the Mentra Cloud
     */
    disconnect(): void;

    /**
     * Send a message to the Cloud via WebSocket
     * @param message The message to send
     */
    send(message: GlassesToCloudMessage): void;

    /**
     * Send binary data to the Cloud via WebSocket
     * @param data The binary data to send
     */
    sendBinary(data: ArrayBuffer | Buffer): void;

    /**
     * Make a REST API request
     * @param method HTTP method
     * @param endpoint API endpoint (e.g., "/api/v1/resource")
     * @param data Request body
     * @param token Auth token (optional override)
     */
    request<T>(method: string, endpoint: string, data?: any, token?: string): Promise<T>;

    /**
     * Register a callback for incoming messages
     */
    onMessage(callback: (message: CloudToGlassesMessage) => void): void;

    /**
     * Register a callback for connection events
     */
    onConnect(callback: () => void): void;

    /**
     * Register a callback for disconnection events
     */
    onDisconnect(callback: (code: number, reason: string) => void): void;

    /**
     * Register a callback for errors
     */
    onError(callback: (error: Error) => void): void;
}
