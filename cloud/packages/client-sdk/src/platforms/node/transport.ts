import WebSocket from 'ws';
import { INetworkTransport } from '../../interfaces/network';
import { GlassesToCloudMessage, CloudToGlassesMessage } from '@mentra/types';

export class NodeTransport implements INetworkTransport {
    private ws: WebSocket | null = null;
    private messageHandler: ((message: CloudToGlassesMessage) => void) | null = null;
    private statusHandler: ((isConnected: boolean) => void) | null = null;

    async connect(url: string, token: string): Promise<void> {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(url);

            this.ws.on('open', () => {
                this.statusHandler?.(true);
                resolve();
            });

            this.ws.on('message', (data: WebSocket.RawData) => {
                if (this.messageHandler) {
                    try {
                        const message = JSON.parse(data.toString()) as CloudToGlassesMessage;
                        this.messageHandler(message);
                    } catch (err) {
                        console.error('Failed to parse message:', err);
                    }
                }
            });

            this.ws.on('close', () => {
                this.statusHandler?.(false);
            });

            this.ws.on('error', (err) => {
                console.error('WebSocket error:', err);
                reject(err);
            });
        });
    }

    disconnect(): void {
        this.ws?.close();
        this.ws = null;
    }

    send(message: GlassesToCloudMessage): void {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        } else {
            console.warn('Cannot send message, WebSocket is not open');
        }
    }

    onMessage(callback: (message: CloudToGlassesMessage) => void): void {
        this.messageHandler = callback;
    }

    onStatusChange(callback: (isConnected: boolean) => void): void {
        this.statusHandler = callback;
    }
}
