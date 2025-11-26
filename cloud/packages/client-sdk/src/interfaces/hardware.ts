export interface IHardware {
    /**
     * Scan for Mentra Glasses.
     */
    scan(): Promise<void>;

    /**
     * Connect to a specific device.
     */
    connect(deviceId: string): Promise<void>;

    /**
     * Disconnect from the device.
     */
    disconnect(): Promise<void>;

    /**
     * Send a raw command to the glasses.
     */
    sendToDevice(command: any): Promise<void>;

    /**
     * Register a callback for hardware events (button presses, etc.).
     */
    onEvent(callback: (event: any) => void): void;
}
