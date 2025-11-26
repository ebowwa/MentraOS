import { Capabilities, HardwareRequirement } from "@mentra/types";

export class CapabilityManager {
    private capabilities: Capabilities;

    constructor(capabilities: Capabilities) {
        this.capabilities = capabilities;
    }

    public hasCapability(requirement: HardwareRequirement): boolean {
        // Simplified check - in a real implementation this would check specific capabilities
        // against the requirement. For now, we assume if the capability object exists, it's supported.
        return true;
    }

    public getCapabilities(): Capabilities {
        return this.capabilities;
    }
}

// Default capabilities for a standard Mentra device
export const DEFAULT_CAPABILITIES: Capabilities = {
    modelName: "Mentra Headless Client",
    hasCamera: true,
    camera: {
        video: {
            canRecord: true,
            canStream: true,
            supportedStreamTypes: ["rtmp"],
            supportedResolutions: [{ width: 1920, height: 1080 }],
        },
        resolution: { width: 1920, height: 1080 },
    },
    hasDisplay: true,
    display: {
        resolution: { width: 640, height: 480 },
        isColor: true,
        canDisplayBitmap: true,
    },
    hasMicrophone: true,
    microphone: {
        count: 1,
        hasVAD: true,
    },
    hasSpeaker: true,
    speaker: {
        count: 2,
        isPrivate: false,
    },
    hasIMU: true,
    imu: {
        axisCount: 6,
        hasAccelerometer: true,
        hasGyroscope: true,
    },
    hasButton: true,
    button: {
        count: 1,
        buttons: [{ type: "press", events: ["press", "double_press", "long_press"] }],
    },
    hasLight: true,
    light: {
        count: 1,
        lights: [{ id: "main", purpose: "general", isFullColor: true, position: "front_facing" }],
    },
    power: {
        hasExternalBattery: false,
    },
    hasWifi: true,
};
