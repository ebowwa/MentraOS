import { EventEmitter } from "eventemitter3";

export interface TransportEvents {
    open: () => void;
    close: (code: number, reason: string) => void;
    message: (data: any) => void;
    error: (error: Error) => void;
}

export abstract class TransportLayer extends EventEmitter<TransportEvents> {
    abstract connect(url: string, protocols?: string | string[]): Promise<void>;
    abstract send(data: any): void;
    abstract close(): void;
    abstract get isConnected(): boolean;
}
