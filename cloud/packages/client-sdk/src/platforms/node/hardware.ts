import { IHardware } from '../../interfaces/hardware';

export class MockHardware implements IHardware {
    private eventHandler: ((event: any) => void) | null = null;

    async scan(): Promise<void> {
        console.log('[MockHardware] Scanning for devices...');
        // Simulate finding a device
        setTimeout(() => {
            console.log('[MockHardware] Found device: MOCK-GLASSES-01');
        }, 500);
    }

    async connect(deviceId: string): Promise<void> {
        console.log(`[MockHardware] Connected to ${deviceId}`);
    }

    async disconnect(): Promise<void> {
        console.log('[MockHardware] Disconnected');
    }

    async sendToDevice(command: any): Promise<void> {
        console.log('[MockHardware] Sending command:', command);
    }

    onEvent(callback: (event: any) => void): void {
        this.eventHandler = callback;
    }

    // Helper for tests to trigger events
    public simulateEvent(event: any) {
        this.eventHandler?.(event);
    }
}
