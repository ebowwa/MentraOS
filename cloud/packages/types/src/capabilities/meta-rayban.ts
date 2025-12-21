/**
 * @fileoverview Meta Ray-Ban Hardware Capabilities
 *
 * Capability profile for the Meta Ray-Ban smart glasses.
 * These glasses connect via the Meta AI app, not directly via Bluetooth.
 */

import type { Capabilities } from "@mentra/sdk";

/**
 * Meta Ray-Ban capability profile
 */
export const metaRayBan: Capabilities = {
    modelName: "Meta Ray-Ban",

    // Camera capabilities - Meta Ray-Ban has a 12MP camera with video streaming
    hasCamera: true,
    camera: {
        resolution: { width: 3024, height: 4032 }, // 12MP
        hasHDR: true,
        hasFocus: true,
        video: {
            canRecord: true,
            canStream: true,
            supportedStreamTypes: ["dat"], // Meta DAT SDK streaming
            supportedResolutions: [
                { width: 1920, height: 1080 },
                { width: 1280, height: 720 },
            ],
        },
    },

    // Display capabilities - Meta Ray-Ban does not have a heads-up display
    hasDisplay: false,
    display: null,

    // Microphone capabilities - Meta Ray-Ban has 5 microphones for spatial audio
    hasMicrophone: true,
    microphone: {
        count: 5,
        hasVAD: true,
    },

    // Speaker capabilities - Meta Ray-Ban has open-ear speakers
    hasSpeaker: true,
    speaker: {
        count: 2,
        isPrivate: false, // Open-ear speakers, not bone conduction
    },

    // IMU capabilities - Meta Ray-Ban has sensors for head tracking
    hasIMU: true,
    imu: {
        axisCount: 6,
        hasAccelerometer: true,
        hasCompass: true,
        hasGyroscope: true,
    },

    // Button capabilities - Meta Ray-Ban has capture button and touch controls
    hasButton: true,
    button: {
        count: 1,
        buttons: [
            {
                type: "press",
                events: ["press", "long_press"],
                isCapacitive: false,
            },
        ],
    },

    // Light capabilities - Meta Ray-Ban has LED privacy indicator
    hasLight: true,
    light: {
        count: 1,
        lights: [
            {
                isFullColor: false,
                color: "white",
            },
        ],
    },

    // Power capabilities - Meta Ray-Ban charging case
    power: {
        hasExternalBattery: true, // Has charging case
    },

    // WiFi capabilities - No direct WiFi, connects via Meta AI app on phone
    hasWifi: false,
};
