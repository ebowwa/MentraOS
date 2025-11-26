// src/rtmp-stream.ts

import type { RtmpStreamStatus } from "./messages/client-cloud";

/**
 * RTMP Streaming Types
 */

/**
 * Video configuration options for RTMP streaming
 */
export interface VideoConfig {
    /** Optional width in pixels (e.g., 1280) */
    width?: number;
    /** Optional height in pixels (e.g., 720) */
    height?: number;
    /** Optional bitrate in bits per second (e.g., 2000000 for 2 Mbps) */
    bitrate?: number;
    /** Optional frame rate in frames per second (e.g., 30) */
    frameRate?: number;
}

/**
 * Audio configuration options for RTMP streaming
 */
export interface AudioConfig {
    /** Optional audio bitrate in bits per second (e.g., 128000 for 128 kbps) */
    bitrate?: number;
    /** Optional audio sample rate in Hz (e.g., 44100) */
    sampleRate?: number;
    /** Optional flag to enable echo cancellation */
    echoCancellation?: boolean;
    /** Optional flag to enable noise suppression */
    noiseSuppression?: boolean;
}

/**
 * Stream configuration options for RTMP streaming
 */
export interface StreamConfig {
    /** Optional maximum duration in seconds (e.g., 1800 for 30 minutes) */
    durationLimit?: number;
}

/**
 * Type for stream status event handler
 */
export type StreamStatusHandler = (status: RtmpStreamStatus) => void;
