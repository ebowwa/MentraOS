// src/messages/app-cloud.ts

import { BaseMessage } from "./base"
import { ExtendedStreamType, LocationStreamRequest, StreamType } from "../streams"
import { Layout } from "../layouts"
import { DashboardContentUpdate, DashboardModeChange, DashboardSystemUpdate, DashboardMode } from "../dashboard"
import { VideoConfig, AudioConfig, StreamConfig } from "../rtmp-stream"
import { LedColor, RtmpStreamStatus, PhotoResponse, RgbLedControlResponse, LocationUpdate, CalendarEvent } from "./client-cloud"
import { AppConfig, AppSettings, Capabilities } from "../index"
// AppSession import removed to avoid circular dependency

// Actually AppSession is a class in SDK, not a type in types package.
// We should probably use `any` or a simplified interface for ActiveSession if it's just for ID.
// In `ToolCall`, activeSession is used.
// Let's define a minimal interface or use `any` for now to avoid circular dependency or moving the whole session logic.

/**
 * Types of messages from Apps to cloud
 */
export enum AppToCloudMessageType {
    // Commands
    CONNECTION_INIT = "tpa_connection_init",
    SUBSCRIPTION_UPDATE = "subscription_update",
    LOCATION_POLL_REQUEST = "location_poll_request",

    // Requests
    DISPLAY_REQUEST = "display_event",
    PHOTO_REQUEST = "photo_request",
    AUDIO_PLAY_REQUEST = "audio_play_request",
    AUDIO_STOP_REQUEST = "audio_stop_request",
    RGB_LED_CONTROL = "rgb_led_control",
    REQUEST_WIFI_SETUP = "request_wifi_setup",

    // RTMP streaming
    RTMP_STREAM_REQUEST = "rtmp_stream_request",
    RTMP_STREAM_STOP = "rtmp_stream_stop",

    // Managed RTMP streaming
    MANAGED_STREAM_REQUEST = "managed_stream_request",
    MANAGED_STREAM_STOP = "managed_stream_stop",

    // Stream status check (both managed and unmanaged)
    STREAM_STATUS_CHECK = "stream_status_check",

    // Dashboard requests
    DASHBOARD_CONTENT_UPDATE = "dashboard_content_update",
    DASHBOARD_MODE_CHANGE = "dashboard_mode_change",
    DASHBOARD_SYSTEM_UPDATE = "dashboard_system_update",

    // TODO(isaiah): Remove after confirming not in use.
    // App-to-App Communication
    APP_BROADCAST_MESSAGE = "app_broadcast_message",
    APP_DIRECT_MESSAGE = "app_direct_message",
    APP_USER_DISCOVERY = "app_user_discovery",
    APP_ROOM_JOIN = "app_room_join",
    APP_ROOM_LEAVE = "app_room_leave",
}

/**
 * Types of messages from cloud to Apps
 */
export enum CloudToAppMessageType {
    // Responses
    CONNECTION_ACK = "tpa_connection_ack",
    CONNECTION_ERROR = "tpa_connection_error",

    // Updates
    APP_STOPPED = "app_stopped",
    SETTINGS_UPDATE = "settings_update",
    CAPABILITIES_UPDATE = "capabilities_update",

    // Dashboard updates
    DASHBOARD_MODE_CHANGED = "dashboard_mode_changed",
    DASHBOARD_ALWAYS_ON_CHANGED = "dashboard_always_on_changed",

    // Stream data
    DATA_STREAM = "data_stream",

    // Media responses
    PHOTO_RESPONSE = "photo_response",
    AUDIO_PLAY_RESPONSE = "audio_play_response",
    RGB_LED_CONTROL_RESPONSE = "rgb_led_control_response",
    RTMP_STREAM_STATUS = "rtmp_stream_status",
    MANAGED_STREAM_STATUS = "managed_stream_status",
    STREAM_STATUS_CHECK_RESPONSE = "stream_status_check_response",

    WEBSOCKET_ERROR = "websocket_error",

    // Permissions
    PERMISSION_ERROR = "permission_error",

    // General purpose messaging
    CUSTOM_MESSAGE = "custom_message",

    // TODO(isaiah): Remove after confirming not in use.
    // App-to-App Communication Responses
    APP_MESSAGE_RECEIVED = "app_message_received",
    APP_USER_JOINED = "app_user_joined",
    APP_USER_LEFT = "app_user_left",
    APP_ROOM_UPDATED = "app_room_updated",
    APP_DIRECT_MESSAGE_RESPONSE = "app_direct_message_response",
}

/**
 * Dashboard message types
 */
export const DashboardMessageTypes = [
    AppToCloudMessageType.DASHBOARD_CONTENT_UPDATE,
    AppToCloudMessageType.DASHBOARD_MODE_CHANGE,
    AppToCloudMessageType.DASHBOARD_SYSTEM_UPDATE,
    CloudToAppMessageType.DASHBOARD_MODE_CHANGED,
    CloudToAppMessageType.DASHBOARD_ALWAYS_ON_CHANGED,
] as const

// ===========================================================
// App to Cloud Messages
// ===========================================================

// a subscription can now be either a simple string or our new rich object
export type SubscriptionRequest = ExtendedStreamType | LocationStreamRequest

/**
 * Connection initialization from App
 */
export interface AppConnectionInit extends BaseMessage {
    type: AppToCloudMessageType.CONNECTION_INIT
    packageName: string
    sessionId: string
    apiKey: string
}

/**
 * Subscription update from App
 */
export interface AppSubscriptionUpdate extends BaseMessage {
    type: AppToCloudMessageType.SUBSCRIPTION_UPDATE
    packageName: string
    subscriptions: SubscriptionRequest[]
}

/**
 * Photo request from App
 */
export interface PhotoRequest extends BaseMessage {
    type: AppToCloudMessageType.PHOTO_REQUEST
    packageName: string
    requestId: string // SDK-generated request ID to track the request
    saveToGallery?: boolean
    customWebhookUrl?: string // Custom webhook URL to override TPA's default
    authToken?: string // Auth token for custom webhook authentication
    /** Desired photo size sent by App. Defaults to 'medium' if omitted. */
    size?: "small" | "medium" | "large"
    /** Image compression level: none, medium, or heavy. Defaults to none. */
    compress?: "none" | "medium" | "heavy"
}

/**
 * RGB LED control request from App
 */
export interface RgbLedControlRequest extends BaseMessage {
    type: AppToCloudMessageType.RGB_LED_CONTROL
    packageName: string
    requestId: string // SDK-generated request ID to track the request
    action: "on" | "off" // Only low-level on/off actions
    color?: LedColor // LED color name
    ontime?: number // LED on duration in ms
    offtime?: number // LED off duration in ms
    count?: number // Number of on/off cycles
}

/**
 * RTMP stream request from App
 */
export interface RtmpStreamRequest extends BaseMessage {
    type: AppToCloudMessageType.RTMP_STREAM_REQUEST
    packageName: string
    rtmpUrl: string
    video?: VideoConfig
    audio?: AudioConfig
    stream?: StreamConfig
}

/**
 * RTMP stream stop request from App
 */
export interface RtmpStreamStopRequest extends BaseMessage {
    type: AppToCloudMessageType.RTMP_STREAM_STOP
    packageName: string
    streamId?: string // Optional stream ID to specify which stream to stop
}

// defines the structure for our new on-demand location poll command
export interface AppLocationPollRequest extends BaseMessage {
    type: AppToCloudMessageType.LOCATION_POLL_REQUEST
    packageName: string
    sessionId: string
    accuracy: string
    correlationId: string
}

/**
 * Re-stream destination for managed streams
 */
export interface RestreamDestination {
    /** RTMP URL like rtmp://youtube.com/live/STREAM-KEY */
    url: string
    /** Optional friendly name like "YouTube" or "Twitch" */
    name?: string
}

/**
 * Managed RTMP stream request from App
 * The cloud handles the RTMP endpoint and returns HLS/DASH URLs
 */
export interface ManagedStreamRequest extends BaseMessage {
    type: AppToCloudMessageType.MANAGED_STREAM_REQUEST
    packageName: string
    quality?: "720p" | "1080p"
    enableWebRTC?: boolean
    video?: VideoConfig
    audio?: AudioConfig
    stream?: StreamConfig
    /** Optional RTMP destinations to re-stream to (YouTube, Twitch, etc) */
    restreamDestinations?: RestreamDestination[]
}

/**
 * Managed RTMP stream stop request from App
 */
export interface ManagedStreamStopRequest extends BaseMessage {
    type: AppToCloudMessageType.MANAGED_STREAM_STOP
    packageName: string
}

/**
 * Stream status check request from App
 * Checks if there are any existing streams (managed or unmanaged) for the current user
 */
export interface StreamStatusCheckRequest extends BaseMessage {
    type: AppToCloudMessageType.STREAM_STATUS_CHECK
    packageName: string
    sessionId: string
}

/**
 * Audio play request from App
 */
export interface AudioPlayRequest extends BaseMessage {
    type: AppToCloudMessageType.AUDIO_PLAY_REQUEST
    packageName: string
    requestId: string // SDK-generated request ID to track the request
    audioUrl: string // URL to audio file for download and play
    volume?: number // Volume level 0.0-1.0, defaults to 1.0
    stopOtherAudio?: boolean // Whether to stop other audio playback, defaults to true
    /**
     * Track ID for audio playback (defaults to 0)
     * - 0: speaker (default audio playback)
     * - 1: app_audio (app-specific audio)
     * - 2: tts (text-to-speech audio)
     * Use different track IDs to play multiple audio streams simultaneously (mixing)
     */
    trackId?: number
}

/**
 * Audio stop request from App
 */
export interface AudioStopRequest extends BaseMessage {
    type: AppToCloudMessageType.AUDIO_STOP_REQUEST
    packageName: string
    /**
     * Track ID to stop (optional)
     * 0: speaker (default audio playback)
     * 1: app_audio (app-specific audio)
     * 2: tts (text-to-speech audio)
     * If omitted, stops all tracks
     */
    trackId?: number
    sessionId?: string // Session ID for routing
}

/**
 * WiFi setup request from App
 */
export interface RequestWifiSetup extends BaseMessage {
    type: AppToCloudMessageType.REQUEST_WIFI_SETUP
    packageName: string
    sessionId: string
    reason?: string
}

export interface DisplayRequest extends BaseMessage {
    type: AppToCloudMessageType.DISPLAY_REQUEST;
    packageName: string;
    view: any; // ViewType is in enums, need to import or use any for now to avoid circular dep if enums depends on this (it shouldn't)
    layout: Layout;
    durationMs?: number;
    forceDisplay?: boolean;
}

/**
 * Broadcast message to all users with the same App active
 */
export interface AppBroadcastMessage extends BaseMessage {
    type: AppToCloudMessageType.APP_BROADCAST_MESSAGE
    packageName: string
    sessionId: string
    payload: any
    messageId: string
    senderUserId: string
}

/**
 * Direct message to a specific user with the same App active
 */
export interface AppDirectMessage extends BaseMessage {
    type: AppToCloudMessageType.APP_DIRECT_MESSAGE
    packageName: string
    sessionId: string
    targetUserId: string
    payload: any
    messageId: string
    senderUserId: string
}

/**
 * Request to discover other users with the same App active
 */
export interface AppUserDiscovery extends BaseMessage {
    type: AppToCloudMessageType.APP_USER_DISCOVERY
    packageName: string
    sessionId: string
    includeUserProfiles?: boolean
}

/**
 * Join a communication room for group messaging
 */
export interface AppRoomJoin extends BaseMessage {
    type: AppToCloudMessageType.APP_ROOM_JOIN
    packageName: string
    sessionId: string
    roomId: string
    roomConfig?: {
        maxUsers?: number
        isPrivate?: boolean
        metadata?: any
    }
}

/**
 * Leave a communication room
 */
export interface AppRoomLeave extends BaseMessage {
    type: AppToCloudMessageType.APP_ROOM_LEAVE
    packageName: string
    sessionId: string
    roomId: string
}

/**
 * Union type for all messages from Apps to cloud
 */
export type AppToCloudMessage =
    | AppConnectionInit
    | AppSubscriptionUpdate
    | AppLocationPollRequest
    | DisplayRequest
    | PhotoRequest
    | RgbLedControlRequest
    | AudioPlayRequest
    | AudioStopRequest
    | RtmpStreamRequest
    | RtmpStreamStopRequest
    | ManagedStreamRequest
    | ManagedStreamStopRequest
    | StreamStatusCheckRequest
    | DashboardContentUpdate
    | DashboardModeChange
    | DashboardSystemUpdate
    | RequestWifiSetup
    // New App-to-App communication messages
    | AppBroadcastMessage
    | AppDirectMessage
    | AppUserDiscovery
    | AppRoomJoin
    | AppRoomLeave


// ===========================================================
// Cloud to App Messages
// ===========================================================

/**
 * Connection acknowledgment to App
 */
export interface AppConnectionAck extends BaseMessage {
    type: CloudToAppMessageType.CONNECTION_ACK
    settings?: AppSettings
    mentraosSettings?: Record<string, any> // MentraOS system settings
    config?: AppConfig // App config sent from cloud
    capabilities?: Capabilities // Device capability profile
}

/**
 * Connection error to App
 */
export interface AppConnectionError extends BaseMessage {
    type: CloudToAppMessageType.CONNECTION_ERROR
    message: string
    code?: string
}

/**
 * Permission error detail for a specific stream
 */
export interface PermissionErrorDetail {
    /** The stream type that was rejected */
    stream: string
    /** The permission required for this stream */
    requiredPermission: string
    /** Detailed message explaining the rejection */
    message: string
}

/**
 * Permission error notification to App
 * Sent when subscriptions are rejected due to missing permissions
 */
export interface PermissionError extends BaseMessage {
    type: CloudToAppMessageType.PERMISSION_ERROR
    /** General error message */
    message: string
    /** Array of details for each rejected stream */
    details: PermissionErrorDetail[]
}

/**
 * App stopped notification to App
 */
export interface AppStopped extends BaseMessage {
    type: CloudToAppMessageType.APP_STOPPED
    reason: "user_disabled" | "system_stop" | "error"
    message?: string
}

/**
 * Settings update to App
 */
export interface SettingsUpdate extends BaseMessage {
    type: CloudToAppMessageType.SETTINGS_UPDATE
    packageName: string
    settings: AppSettings
}

/**
 * Device capabilities update to App
 * Sent when the connected glasses model changes or capabilities are updated
 */
export interface CapabilitiesUpdate extends BaseMessage {
    type: CloudToAppMessageType.CAPABILITIES_UPDATE
    capabilities: Capabilities | null
    modelName: string | null
}

/**
 * MentraOS settings update to App
 */
export interface MentraosSettingsUpdate extends BaseMessage {
    type: "augmentos_settings_update"
    sessionId: string
    settings: Record<string, any>
    timestamp: Date
}

/**
 * Transcription data
 */
export interface TranscriptionData extends BaseMessage {
    type: StreamType.TRANSCRIPTION
    text: string // The transcribed text
    isFinal: boolean // Whether this is a final transcription
    transcribeLanguage?: string // Detected language code
    startTime: number // Start time in milliseconds
    endTime: number // End time in milliseconds
    speakerId?: string // ID of the speaker if available
    duration?: number // Audio duration in milliseconds
    provider?: string // The transcription provider (e.g., "azure", "soniox")
    confidence?: number // Confidence score (0-1)
    metadata?: TranscriptionMetadata // Token-level metadata (always included)
}

/**
 * Metadata for transcription containing token-level details
 */
export interface TranscriptionMetadata {
    provider: "soniox" | "azure" | string
    soniox?: {
        tokens: SonioxToken[]
    }
    azure?: {
        // Azure-specific metadata can be added later
        tokens?: any[]
    }
    alibaba?: {
        // Alibaba-specific metadata can be added later
        tokens?: any[]
    }
}

/**
 * Soniox token with word-level details
 */
export interface SonioxToken {
    text: string
    startMs?: number
    endMs?: number
    confidence: number
    isFinal: boolean
    speaker?: string
}

/**
 * Translation data
 */
export interface TranslationData extends BaseMessage {
    type: StreamType.TRANSLATION
    text: string // The transcribed text
    originalText?: string // The original transcribed text before translation
    isFinal: boolean // Whether this is a final transcription
    startTime: number // Start time in milliseconds
    endTime: number // End time in milliseconds
    speakerId?: string // ID of the speaker if available
    duration?: number // Audio duration in milliseconds
    transcribeLanguage?: string // The language code of the transcribed text
    translateLanguage?: string // The language code of the translated text
    didTranslate?: boolean // Whether the text was translated
    provider?: string // The translation provider (e.g., "azure", "google")
    confidence?: number // Confidence score (0-1)
}

/**
 * Audio chunk data
 */
export interface AudioChunk extends BaseMessage {
    type: StreamType.AUDIO_CHUNK
    arrayBuffer: ArrayBufferLike // The audio data
    sampleRate?: number // Audio sample rate (e.g., 16000 Hz)
}

/**
 * Tool call from cloud to App
 * Represents a tool invocation with filled parameters
 */
export interface ToolCall {
    toolId: string // The ID of the tool that was called
    toolParameters: Record<string, string | number | boolean> // The parameters of the tool that was called
    timestamp: Date // Timestamp when the tool was called
    userId: string // ID of the user who triggered the tool call
    activeSession: any // AppSession | null - using any to avoid circular dep
}

/**
 * Stream data to App
 */
export interface DataStream extends BaseMessage {
    type: CloudToAppMessageType.DATA_STREAM
    streamType: ExtendedStreamType
    data: unknown // Type depends on the streamType
}

/**
 * Dashboard mode changed notification
 */
export interface DashboardModeChanged extends BaseMessage {
    type: CloudToAppMessageType.DASHBOARD_MODE_CHANGED
    mode: DashboardMode
}

/**
 * Dashboard always-on state changed notification
 */
export interface DashboardAlwaysOnChanged extends BaseMessage {
    type: CloudToAppMessageType.DASHBOARD_ALWAYS_ON_CHANGED
    enabled: boolean
}

/**
 * Standard connection error (for server compatibility)
 */
export interface StandardConnectionError extends BaseMessage {
    type: "connection_error"
    message: string
}

/**
 * Custom message for general-purpose communication (cloud to App)
 */
export interface CustomMessage extends BaseMessage {
    type: CloudToAppMessageType.CUSTOM_MESSAGE
    action: string // Identifies the specific action/message type
    payload: any // Custom data payload
}

/**
 * Output status for a re-stream destination
 */
export interface OutputStatus {
    /** The destination URL */
    url: string
    /** Friendly name if provided */
    name?: string
    /** Status of this output */
    status: "active" | "error" | "stopped"
    /** Error message if status is error */
    error?: string
}

/**
 * Managed RTMP stream status update
 * Sent when managed stream status changes or URLs are ready
 */
export interface ManagedStreamStatus extends BaseMessage {
    type: CloudToAppMessageType.MANAGED_STREAM_STATUS
    status: "initializing" | "preparing" | "active" | "stopping" | "stopped" | "error"
    hlsUrl?: string
    dashUrl?: string
    webrtcUrl?: string
    /** Cloudflare Stream player/preview URL for embedding */
    previewUrl?: string
    /** Thumbnail image URL */
    thumbnailUrl?: string
    message?: string
    streamId?: string
    /** Status of re-stream outputs if configured */
    outputs?: OutputStatus[]
}

/**
 * Stream status check response
 * Returns information about any existing streams for the user
 */
export interface StreamStatusCheckResponse extends BaseMessage {
    type: CloudToAppMessageType.STREAM_STATUS_CHECK_RESPONSE
    hasActiveStream: boolean
    streamInfo?: {
        type: "managed" | "unmanaged"
        streamId: string
        status: string
        createdAt: Date
        // For managed streams
        hlsUrl?: string
        dashUrl?: string
        webrtcUrl?: string
        previewUrl?: string
        thumbnailUrl?: string
        activeViewers?: number
        // For unmanaged streams
        rtmpUrl?: string
        requestingAppId?: string
    }
}

/**
 * Audio play response to App
 */
export interface AudioPlayResponse extends BaseMessage {
    type: CloudToAppMessageType.AUDIO_PLAY_RESPONSE
    requestId: string
    success: boolean
    error?: string // Error message (if failed)
    duration?: number // Duration of audio in milliseconds (if successful)
}

/**
 * Message received from another App user
 */
export interface AppMessageReceived extends BaseMessage {
    type: CloudToAppMessageType.APP_MESSAGE_RECEIVED
    payload: any
    messageId: string
    senderUserId: string
    senderSessionId: string
    roomId?: string
}

/**
 * Notification that a user joined the App
 */
export interface AppUserJoined extends BaseMessage {
    type: CloudToAppMessageType.APP_USER_JOINED
    userId: string
    sessionId: string
    joinedAt: Date
    userProfile?: any
    roomId?: string
}

/**
 * Notification that a user left the App
 */
export interface AppUserLeft extends BaseMessage {
    type: CloudToAppMessageType.APP_USER_LEFT
    userId: string
    sessionId: string
    leftAt: Date
    roomId?: string
}

/**
 * Room status update (members, config changes, etc.)
 */
export interface AppRoomUpdated extends BaseMessage {
    type: CloudToAppMessageType.APP_ROOM_UPDATED
    roomId: string
    updateType: "user_joined" | "user_left" | "config_changed" | "room_closed"
    roomData: {
        memberCount: number
        maxUsers?: number
        isPrivate?: boolean
        metadata?: any
    }
}

/**
 * Response to a direct message attempt
 */
export interface AppDirectMessageResponse extends BaseMessage {
    type: CloudToAppMessageType.APP_DIRECT_MESSAGE_RESPONSE
    messageId: string
    success: boolean
    error?: string
    targetUserId: string
}

/**
 * Union type for all messages from cloud to Apps
 */
export type CloudToAppMessage =
    | AppConnectionAck
    | AppConnectionError
    | StandardConnectionError
    | DataStream
    | AppStopped
    | SettingsUpdate
    | CapabilitiesUpdate
    | TranscriptionData
    | TranslationData
    | AudioChunk
    | LocationUpdate
    | CalendarEvent
    | PhotoResponse
    | DashboardModeChanged
    | DashboardAlwaysOnChanged
    | CustomMessage
    | ManagedStreamStatus
    | StreamStatusCheckResponse
    | MentraosSettingsUpdate
    // New App-to-App communication response messages
    | AppMessageReceived
    | AppUserJoined
    | AppUserLeft
    | AppRoomUpdated
    | AppDirectMessageResponse
    | AppAudioPlayResponse
    | AppPhotoResponse
    | AppRgbLedControlResponse
    | AppRtmpStreamStatus
    | PermissionError

/**
 * Photo response to App
 */
export interface AppPhotoResponse extends BaseMessage {
    type: CloudToAppMessageType.PHOTO_RESPONSE
    requestId: string
    success: boolean
    photoUrl?: string
    savedToGallery?: boolean
    error?: {
        code: string
        message: string
        details?: any
    }
}

/**
 * RGB LED control response to App
 */
export interface AppRgbLedControlResponse extends BaseMessage {
    type: CloudToAppMessageType.RGB_LED_CONTROL_RESPONSE
    requestId: string
    success: boolean
    error?: string
}

/**
 * RTMP stream status to App
 */
export interface AppRtmpStreamStatus extends BaseMessage {
    type: CloudToAppMessageType.RTMP_STREAM_STATUS
    streamId?: string
    status: string
    errorDetails?: string
    appId?: string
    stats?: {
        bitrate: number
        fps: number
        droppedFrames: number
        duration: number
    }
}

/**
 * Audio play response to App
 */
export interface AppAudioPlayResponse extends BaseMessage {
    type: CloudToAppMessageType.AUDIO_PLAY_RESPONSE
    requestId: string
    success: boolean
    error?: string
}


//===========================================================
// Type guards
//===========================================================

export function isAppConnectionInit(message: AppToCloudMessage): message is AppConnectionInit {
    return message.type === AppToCloudMessageType.CONNECTION_INIT
}

export function isAppSubscriptionUpdate(message: AppToCloudMessage): message is AppSubscriptionUpdate {
    return message.type === AppToCloudMessageType.SUBSCRIPTION_UPDATE
}

export function isDisplayRequest(message: AppToCloudMessage): message is DisplayRequest {
    return message.type === AppToCloudMessageType.DISPLAY_REQUEST
}

export function isRtmpStreamRequest(message: AppToCloudMessage): message is RtmpStreamRequest {
    return message.type === AppToCloudMessageType.RTMP_STREAM_REQUEST
}

export function isRtmpStreamStopRequest(message: AppToCloudMessage): message is RtmpStreamStopRequest {
    return message.type === AppToCloudMessageType.RTMP_STREAM_STOP
}

export function isPhotoRequest(message: AppToCloudMessage): message is PhotoRequest {
    return message.type === AppToCloudMessageType.PHOTO_REQUEST
}

export function isRgbLedControlRequest(message: AppToCloudMessage): message is RgbLedControlRequest {
    return message.type === AppToCloudMessageType.RGB_LED_CONTROL
}

export function isAppConnectionAck(message: CloudToAppMessage): message is AppConnectionAck {
    return message.type === CloudToAppMessageType.CONNECTION_ACK
}

export function isAppConnectionError(message: CloudToAppMessage): message is AppConnectionError {
    return message.type === CloudToAppMessageType.CONNECTION_ERROR
}

export function isAppStopped(message: CloudToAppMessage): message is AppStopped {
    return message.type === CloudToAppMessageType.APP_STOPPED
}

export function isSettingsUpdate(message: CloudToAppMessage): message is SettingsUpdate {
    return message.type === CloudToAppMessageType.SETTINGS_UPDATE
}

export function isCapabilitiesUpdate(message: CloudToAppMessage): message is CapabilitiesUpdate {
    return message.type === CloudToAppMessageType.CAPABILITIES_UPDATE
}

export function isDataStream(message: CloudToAppMessage): message is DataStream {
    return message.type === CloudToAppMessageType.DATA_STREAM
}

export function isAudioChunk(message: CloudToAppMessage): message is AudioChunk {
    return message.type === StreamType.AUDIO_CHUNK
}

export function isStreamStatusCheckResponse(message: CloudToAppMessage): message is StreamStatusCheckResponse {
    return message.type === CloudToAppMessageType.STREAM_STATUS_CHECK_RESPONSE
}

export function isDashboardModeChanged(message: CloudToAppMessage): message is DashboardModeChanged {
    return message.type === CloudToAppMessageType.DASHBOARD_MODE_CHANGED
}

export function isDashboardAlwaysOnChanged(message: CloudToAppMessage): message is DashboardAlwaysOnChanged {
    return message.type === CloudToAppMessageType.DASHBOARD_ALWAYS_ON_CHANGED
}

export function isManagedStreamStatus(message: CloudToAppMessage): message is ManagedStreamStatus {
    return message.type === CloudToAppMessageType.MANAGED_STREAM_STATUS
}

export function isPhotoResponse(message: CloudToAppMessage): message is AppPhotoResponse {
    return message.type === CloudToAppMessageType.PHOTO_RESPONSE
}

export function isRgbLedControlResponse(message: CloudToAppMessage): message is AppRgbLedControlResponse {
    return message.type === CloudToAppMessageType.RGB_LED_CONTROL_RESPONSE
}

export function isRtmpStreamStatus(message: CloudToAppMessage): message is AppRtmpStreamStatus {
    return message.type === CloudToAppMessageType.RTMP_STREAM_STATUS
}

export function isAudioPlayResponse(message: CloudToAppMessage): message is AppAudioPlayResponse {
    return message.type === CloudToAppMessageType.AUDIO_PLAY_RESPONSE
}

export function isPermissionError(message: CloudToAppMessage): message is PermissionError {
    return message.type === CloudToAppMessageType.PERMISSION_ERROR
}
