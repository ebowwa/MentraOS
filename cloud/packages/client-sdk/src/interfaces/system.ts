export interface ISystem {
    /**
     * Get the device's unique ID (e.g. UUID).
     */
    getDeviceId(): Promise<string>;

    /**
     * Get the device's model name.
     */
    getModel(): Promise<string>;

    /**
     * Get the OS version.
     */
    getOsVersion(): Promise<string>;

    /**
     * Get the battery level (0-100).
     */
    getBatteryLevel(): Promise<number>;
}
