import { ISystem } from '../../interfaces/system';
import os from 'os';

export class NodeSystem implements ISystem {
    async getDeviceId(): Promise<string> {
        return 'NODE-TEST-DEVICE-001';
    }

    async getModel(): Promise<string> {
        return 'Mentra Simulator (Node.js)';
    }

    async getOsVersion(): Promise<string> {
        return `${os.type()} ${os.release()}`;
    }

    async getBatteryLevel(): Promise<number> {
        return 100;
    }
}
