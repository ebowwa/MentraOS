import { GlassesToCloudMessage, CloudToGlassesMessage } from '@mentra/types';

export interface INetworkTransport {
    /**
     * Connect to the Mentra Cloud.
     * @param url The WebSocket URL to connect to.
     * @param token The authentication token.
     */
    connect(url: string, token: string): Promise<void>;

    /**
     * Disconnect from the Cloud.
     */
    disconnect(): void;

    /**
     * Send a message to the Cloud.
     */
    send(message: GlassesToCloudMessage): void;

    /**
     * Register a callback for incoming messages.
     */
    onMessage(callback: (message: CloudToGlassesMessage) => void): void;

    /**
     * Register a callback for connection status changes.
     */
    onStatusChange(callback: (isConnected: boolean) => void): void;
}
