// src/messages/client-cloud.ts

import { StreamType } from "../streams"
import { BaseMessage } from "./base"
import { Layout } from "../layouts"

/**
 * Types of messages from glasses to cloud
 */
export enum GlassesToCloudMessageType {
    // Control actions
    CONNECTION_INIT = "connection_init",
    REQUEST_SETTINGS = "request_settings",

    START_APP = StreamType.START_APP,
    STOP_APP = StreamType.STOP_APP,

    DASHBOARD_STATE = "dashboard_state",
    OPEN_DASHBOARD = StreamType.OPEN_DASHBOARD,

    // Mentra Live
    PHOTO_RESPONSE = StreamType.PHOTO_RESPONSE,

    // Local Transcription
    LOCAL_TRANSCRIPTION = "local_transcription",

    // RTMP streaming
    RTMP_STREAM_STATUS = StreamType.RTMP_STREAM_STATUS,
    KEEP_ALIVE_ACK = "keep_alive_ack",

    BUTTON_PRESS = StreamType.BUTTON_PRESS,
    HEAD_POSITION = StreamType.HEAD_POSITION,
    TOUCH_EVENT = StreamType.TOUCH_EVENT,
    GLASSES_BATTERY_UPDATE = StreamType.GLASSES_BATTERY_UPDATE,
    PHONE_BATTERY_UPDATE = StreamType.PHONE_BATTERY_UPDATE,
    GLASSES_CONNECTION_STATE = StreamType.GLASSES_CONNECTION_STATE,
    LOCATION_UPDATE = StreamType.LOCATION_UPDATE,

    // TODO(isaiah): Remove VPS_COORDINATES once confirmed we don't use this system.
    VPS_COORDINATES = StreamType.VPS_COORDINATES,
    VAD = StreamType.VAD,

    // TODO(isaiah): Remove PHONE_NOTIFICATION, and PHONE_NOTIFICATION_DISMISSED after moving to REST request.
    PHONE_NOTIFICATION = StreamType.PHONE_NOTIFICATION,
    PHONE_NOTIFICATION_DISMISSED = StreamType.PHONE_NOTIFICATION_DISMISSED,

    // TODO(isaiah): Remove CALENDAR_EVENT after moving to REST request.
    CALENDAR_EVENT = StreamType.CALENDAR_EVENT,
    MENTRAOS_SETTINGS_UPDATE_REQUEST = StreamType.MENTRAOS_SETTINGS_UPDATE_REQUEST,

    // TODO(isaiah): Remove CORE_STATUS_UPDATE after moving to REST request.
    CORE_STATUS_UPDATE = StreamType.CORE_STATUS_UPDATE,

    PHOTO_TAKEN = StreamType.PHOTO_TAKEN,
    AUDIO_PLAY_RESPONSE = "audio_play_response",

    // RGB LED control
    RGB_LED_CONTROL_RESPONSE = "rgb_led_control_response",

    // LiveKit handshake
    LIVEKIT_INIT = "livekit_init",
}

/**
 * Types of messages from cloud to glasses
 */
export enum CloudToGlassesMessageType {
    // Responses
    CONNECTION_ACK = "connection_ack",
    CONNECTION_ERROR = "connection_error",
    AUTH_ERROR = "auth_error",

    // Updates
    DISPLAY_EVENT = "display_event",
    APP_STATE_CHANGE = "app_state_change",
    APP_STARTED = "app_started",
    APP_STOPPED = "app_stopped",
    MICROPHONE_STATE_CHANGE = "microphone_state_change",
    SETTINGS_UPDATE = "settings_update",

    // Requests
    PHOTO_REQUEST = "photo_request",
    AUDIO_PLAY_REQUEST = "audio_play_request",
    AUDIO_STOP_REQUEST = "audio_stop_request",
    RGB_LED_CONTROL = "rgb_led_control",
    SHOW_WIFI_SETUP = "show_wifi_setup",

    // RTMP streaming
    START_RTMP_STREAM = "start_rtmp_stream",
    STOP_RTMP_STREAM = "stop_rtmp_stream",
    KEEP_RTMP_STREAM_ALIVE = "keep_rtmp_stream_alive",

    // Dashboard updates
    DASHBOARD_MODE_CHANGE = "dashboard_mode_change",
    DASHBOARD_ALWAYS_ON_CHANGE = "dashboard_always_on_change",

    // Location Service
    SET_LOCATION_TIER = "set_location_tier",
    REQUEST_SINGLE_LOCATION = "request_single_location",

    WEBSOCKET_ERROR = "websocket_error",

    // LiveKit info (URL, room, token)
    LIVEKIT_INFO = "livekit_info",
}

/**
 * Control action message types (subset of GlassesToCloudMessageType)
 */
export const ControlActionTypes = [
    GlassesToCloudMessageType.CONNECTION_INIT,
    GlassesToCloudMessageType.START_APP,
    GlassesToCloudMessageType.STOP_APP,
    GlassesToCloudMessageType.DASHBOARD_STATE,
    GlassesToCloudMessageType.OPEN_DASHBOARD,
] as const

/**
 * Event message types (subset of GlassesToCloudMessageType)
 */
export const EventTypes = [
    GlassesToCloudMessageType.BUTTON_PRESS,
    GlassesToCloudMessageType.HEAD_POSITION,
    GlassesToCloudMessageType.GLASSES_BATTERY_UPDATE,
    GlassesToCloudMessageType.PHONE_BATTERY_UPDATE,
    GlassesToCloudMessageType.GLASSES_CONNECTION_STATE,
    GlassesToCloudMessageType.LOCATION_UPDATE,
    GlassesToCloudMessageType.VPS_COORDINATES,
    GlassesToCloudMessageType.VAD,
    GlassesToCloudMessageType.PHONE_NOTIFICATION,
    GlassesToCloudMessageType.PHONE_NOTIFICATION_DISMISSED,
    GlassesToCloudMessageType.CALENDAR_EVENT,
    GlassesToCloudMessageType.MENTRAOS_SETTINGS_UPDATE_REQUEST,
    GlassesToCloudMessageType.CORE_STATUS_UPDATE,
    GlassesToCloudMessageType.LOCAL_TRANSCRIPTION,
] as const

/**
 * Response message types (subset of CloudToGlassesMessageType)
 */
export const ResponseTypes = [
    CloudToGlassesMessageType.CONNECTION_ACK,
    CloudToGlassesMessageType.CONNECTION_ERROR,
    CloudToGlassesMessageType.AUTH_ERROR,
] as const

/**
 * Update message types (subset of CloudToGlassesMessageType)
 */
export const UpdateTypes = [
    CloudToGlassesMessageType.DISPLAY_EVENT,
    CloudToGlassesMessageType.APP_STATE_CHANGE,
    CloudToGlassesMessageType.MICROPHONE_STATE_CHANGE,
    CloudToGlassesMessageType.PHOTO_REQUEST,
    CloudToGlassesMessageType.AUDIO_PLAY_REQUEST,
    CloudToGlassesMessageType.AUDIO_STOP_REQUEST,
    CloudToGlassesMessageType.RGB_LED_CONTROL,
    CloudToGlassesMessageType.SETTINGS_UPDATE,
    CloudToGlassesMessageType.DASHBOARD_MODE_CHANGE,
    CloudToGlassesMessageType.DASHBOARD_ALWAYS_ON_CHANGE,
    CloudToGlassesMessageType.START_RTMP_STREAM,
    CloudToGlassesMessageType.STOP_RTMP_STREAM,
    CloudToGlassesMessageType.KEEP_RTMP_STREAM_ALIVE,
    CloudToGlassesMessageType.LIVEKIT_INFO,
] as const

//===========================================================
// Glasses to Cloud Messages
//===========================================================

/**
 * Connection initialization from glasses
 */
export function isCloudToGlassesMessage(message: any): message is CloudToGlassesMessage {
    return (
        isConnectionAck(message) ||
        isConnectionError(message) ||
        isAuthError(message) ||
        isDisplayEvent(message) ||
        isAppStateChange(message) ||
        isMicrophoneStateChange(message) ||
        isPhotoRequest(message) ||
        isRgbLedControl(message) ||
        isSettingsUpdate(message) ||
        isLiveKitInfo(message) ||
        isStartRtmpStream(message) ||
        isStopRtmpStream(message) ||
        isKeepRtmpStreamAlive(message) ||
        isSetLocationTier(message) ||
        isRequestSingleLocation(message) ||
        isAudioPlayRequestToGlasses(message) ||
        isAudioStopRequestToGlasses(message) ||
        isShowWifiSetup(message) ||
        isAppStarted(message) ||
        isAppStopped(message)
    );
}

export function isAppStarted(message: any): message is AppStarted {
    return message.type === CloudToGlassesMessageType.APP_STARTED;
}

export function isAppStopped(message: any): message is AppStopped {
    return message.type === CloudToGlassesMessageType.APP_STOPPED;
}

export function isLiveKitInfo(message: any): message is LiveKitInfo {
    return message.type === CloudToGlassesMessageType.LIVEKIT_INFO;
}

export function isSetLocationTier(message: any): message is SetLocationTier {
    return message.type === CloudToGlassesMessageType.SET_LOCATION_TIER;
}

export function isRequestSingleLocation(message: any): message is RequestSingleLocation {
    return message.type === CloudToGlassesMessageType.REQUEST_SINGLE_LOCATION;
}

export function isAudioPlayRequestToGlasses(message: any): message is AudioPlayRequestToGlasses {
    return message.type === CloudToGlassesMessageType.AUDIO_PLAY_REQUEST;
}

export function isAudioStopRequestToGlasses(message: any): message is AudioStopRequestToGlasses {
    return message.type === CloudToGlassesMessageType.AUDIO_STOP_REQUEST;
}

export function isShowWifiSetup(message: any): message is ShowWifiSetup {
    return message.type === CloudToGlassesMessageType.SHOW_WIFI_SETUP;
}

export interface WebSocketError {
    code: string
    message: string
    details?: unknown
}

export interface ConnectionInit extends BaseMessage {
    type: GlassesToCloudMessageType.CONNECTION_INIT
    userId?: string
    coreToken?: string
}

/**
 * Client requests LiveKit info (url, room, token)
 */
export interface LiveKitInit extends BaseMessage {
    type: GlassesToCloudMessageType.LIVEKIT_INIT
    mode?: "publish" | "subscribe"
}

export interface RequestSettings extends BaseMessage {
    type: GlassesToCloudMessageType.REQUEST_SETTINGS
    sessionId: string
}

/**
 * Start app request from glasses
 */
export interface StartApp extends BaseMessage {
    type: GlassesToCloudMessageType.START_APP
    packageName: string
}

/**
 * Stop app request from glasses
 */
export interface StopApp extends BaseMessage {
    type: GlassesToCloudMessageType.STOP_APP
    packageName: string
}

/**
 * Dashboard state update from glasses
 */
export interface DashboardState extends BaseMessage {
    type: GlassesToCloudMessageType.DASHBOARD_STATE
    isOpen: boolean
}

/**
 * Open dashboard request from glasses
 */
export interface OpenDashboard extends BaseMessage {
    type: GlassesToCloudMessageType.OPEN_DASHBOARD
}

/**
 * Button press event from glasses
 */
export interface ButtonPress extends BaseMessage {
    type: GlassesToCloudMessageType.BUTTON_PRESS
    buttonId: string
    pressType: "short" | "long"
}

/**
 * Head position event from glasses
 */
export interface HeadPosition extends BaseMessage {
    type: GlassesToCloudMessageType.HEAD_POSITION
    position: "up" | "down"
}

/**
 * Touch gesture event from glasses
 */
export interface TouchEvent extends BaseMessage {
    type: GlassesToCloudMessageType.TOUCH_EVENT
    device_model: string
    gesture_name: string
    timestamp: Date
}

/**
 * Glasses battery update from glasses
 */
export interface GlassesBatteryUpdate extends BaseMessage {
    type: GlassesToCloudMessageType.GLASSES_BATTERY_UPDATE
    level: number // 0-100
    charging: boolean
    timeRemaining?: number // minutes
}

/**
 * Phone battery update from glasses
 */
export interface PhoneBatteryUpdate extends BaseMessage {
    type: GlassesToCloudMessageType.PHONE_BATTERY_UPDATE
    level: number // 0-100
    charging: boolean
    timeRemaining?: number // minutes
}

/**
 * Glasses connection state from glasses
 */
export interface GlassesConnectionState extends BaseMessage {
    type: GlassesToCloudMessageType.GLASSES_CONNECTION_STATE
    modelName: string
    status: string

    // Optional WiFi details (only present for WiFi-capable glasses)
    wifi?: {
        connected: boolean
        ssid?: string | null
    }
}

/**
 * Location update from glasses
 */
export interface LocationUpdate extends BaseMessage {
    type: GlassesToCloudMessageType.LOCATION_UPDATE | StreamType.LOCATION_UPDATE
    lat: number
    lng: number
    accuracy?: number // Accuracy in meters
    correlationId?: string // for poll responses
}

/**
 * VPS coordinates update from glasses
 */
export interface VpsCoordinates extends BaseMessage {
    type: GlassesToCloudMessageType.VPS_COORDINATES | StreamType.VPS_COORDINATES
    deviceModel: string
    requestId: string
    x: number
    y: number
    z: number
    qx: number
    qy: number
    qz: number
    qw: number
    confidence: number
}

export interface LocalTranscription extends BaseMessage {
    type: GlassesToCloudMessageType.LOCAL_TRANSCRIPTION
    text: string
    isFinal: boolean
    startTime: number
    endTime: number
    speakerId: number
    transcribeLanguage: string
    provider: string
}

export interface CalendarEvent extends BaseMessage {
    type: GlassesToCloudMessageType.CALENDAR_EVENT | StreamType.CALENDAR_EVENT
    eventId: string
    title: string
    dtStart: string
    dtEnd: string
    timezone: string
    timeStamp: string
}

/**
 * Voice activity detection from glasses
 */
export interface Vad extends BaseMessage {
    type: GlassesToCloudMessageType.VAD
    status: boolean | "true" | "false"
}

/**
 * Phone notification from glasses
 */
export interface PhoneNotification extends BaseMessage {
    type: GlassesToCloudMessageType.PHONE_NOTIFICATION
    notificationId: string
    app: string
    title: string
    content: string
    priority: "low" | "normal" | "high"
}

/**
 * Notification dismissed from glasses
 */
export interface PhoneNotificationDismissed extends BaseMessage {
    type: GlassesToCloudMessageType.PHONE_NOTIFICATION_DISMISSED
    notificationId: string
    app: string
    title: string
    content: string
    notificationKey: string
}

/**
 * MentraOS settings update from glasses
 */
export interface MentraosSettingsUpdateRequest extends BaseMessage {
    type: GlassesToCloudMessageType.MENTRAOS_SETTINGS_UPDATE_REQUEST
}

/**
 * Core status update from glasses
 */
export interface CoreStatusUpdate extends BaseMessage {
    type: GlassesToCloudMessageType.CORE_STATUS_UPDATE
    status: string
    details?: Record<string, any>
}

/**
 * Photo error codes for detailed error reporting
 */
export enum PhotoErrorCode {
    CAMERA_INIT_FAILED = "CAMERA_INIT_FAILED",
    CAMERA_CAPTURE_FAILED = "CAMERA_CAPTURE_FAILED",
    CAMERA_TIMEOUT = "CAMERA_TIMEOUT",
    CAMERA_BUSY = "CAMERA_BUSY",
    UPLOAD_FAILED = "UPLOAD_FAILED",
    UPLOAD_TIMEOUT = "UPLOAD_TIMEOUT",
    BLE_TRANSFER_FAILED = "BLE_TRANSFER_FAILED",
    BLE_TRANSFER_BUSY = "BLE_TRANSFER_BUSY",
    BLE_TRANSFER_FAILED_TO_START = "BLE_TRANSFER_FAILED_TO_START",
    BLE_TRANSFER_TIMEOUT = "BLE_TRANSFER_TIMEOUT",
    COMPRESSION_FAILED = "COMPRESSION_FAILED",
    PERMISSION_DENIED = "PERMISSION_DENIED",
    STORAGE_FULL = "STORAGE_FULL",
    NETWORK_ERROR = "NETWORK_ERROR",
    // Phone-side error codes
    PHONE_GLASSES_NOT_CONNECTED = "PHONE_GLASSES_NOT_CONNECTED",
    PHONE_BLE_TRANSFER_FAILED = "PHONE_BLE_TRANSFER_FAILED",
    PHONE_UPLOAD_FAILED = "PHONE_UPLOAD_FAILED",
    PHONE_TIMEOUT = "PHONE_TIMEOUT",
    UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

/**
 * Photo processing stages for error context
 */
export enum PhotoStage {
    REQUEST_RECEIVED = "REQUEST_RECEIVED",
    CAMERA_INIT = "CAMERA_INIT",
    PHOTO_CAPTURE = "PHOTO_CAPTURE",
    COMPRESSION = "COMPRESSION",
    UPLOAD_START = "UPLOAD_START",
    UPLOAD_PROGRESS = "UPLOAD_PROGRESS",
    BLE_TRANSFER = "BLE_TRANSFER",
    RESPONSE_SENT = "RESPONSE_SENT",
}

/**
 * Connection state information for error diagnostics
 */
export interface ConnectionState {
    wifi: {
        connected: boolean
        ssid?: string
        hasInternet: boolean
    }
    ble: {
        connected: boolean
        transferInProgress: boolean
    }
    camera: {
        available: boolean
        initialized: boolean
    }
    storage: {
        availableSpace: number
        totalSpace: number
    }
}

/**
 * Detailed error information for photo failures
 */
export interface PhotoErrorDetails {
    stage: PhotoStage
    connectionState?: ConnectionState
    retryable: boolean
    suggestedAction?: string
    diagnosticInfo?: {
        timestamp: number
        duration: number
        retryCount: number
        lastSuccessfulStage?: PhotoStage
    }
}

/**
 * Enhanced photo response with error support
 */
export interface PhotoResponse extends BaseMessage {
    type: GlassesToCloudMessageType.PHOTO_RESPONSE
    requestId: string // Unique ID for the photo request
    success: boolean // Explicit success/failure flag

    // Success fields (only present when success = true)
    photoUrl?: string // URL of the uploaded photo
    savedToGallery?: boolean // Whether the photo was saved to gallery

    // Error fields (only present when success = false)
    error?: {
        code: PhotoErrorCode
        message: string
        details?: PhotoErrorDetails
    }
}

/**
 * RGB LED control response from glasses
 */
export interface RgbLedControlResponse extends BaseMessage {
    type: GlassesToCloudMessageType.RGB_LED_CONTROL_RESPONSE
    requestId: string
    success: boolean
    error?: string
}

/**
 * RTMP stream status update from glasses
 */
export interface RtmpStreamStatus extends BaseMessage {
    type: GlassesToCloudMessageType.RTMP_STREAM_STATUS
    streamId?: string // Unique identifier for the stream
    status:
    | "initializing"
    | "connecting"
    | "reconnecting"
    | "streaming"
    | "error"
    | "stopped"
    | "active"
    | "stopping"
    | "disconnected"
    | "timeout"
    | "reconnected"
    | "reconnect_failed"
    errorDetails?: string
    appId?: string // ID of the app that requested the stream
    stats?: {
        bitrate: number
        fps: number
        droppedFrames: number
        duration: number
    }
}

/**
 * Keep-alive acknowledgment from glasses
 */
export interface KeepAliveAck extends BaseMessage {
    type: GlassesToCloudMessageType.KEEP_ALIVE_ACK
    streamId: string // ID of the stream being kept alive
    ackId: string // Acknowledgment ID that was sent by cloud
}

/**
 * Photo taken event from glasses
 */
export interface PhotoTaken extends BaseMessage {
    type: GlassesToCloudMessageType.PHOTO_TAKEN
    photoData: ArrayBuffer
    mimeType: string
    timestamp: Date
}

/**
 * Audio play response from glasses/core
 */
export interface AudioPlayResponse extends BaseMessage {
    type: GlassesToCloudMessageType.AUDIO_PLAY_RESPONSE
    requestId: string
    success: boolean
    error?: string
    duration?: number
}

/**
 * Union type for all messages from glasses to cloud
 */
export type GlassesToCloudMessage =
    | ConnectionInit
    | LiveKitInit
    | RequestSettings
    | StartApp
    | StopApp
    | DashboardState
    | OpenDashboard
    | ButtonPress
    | HeadPosition
    | TouchEvent
    | GlassesBatteryUpdate
    | PhoneBatteryUpdate
    | GlassesConnectionState
    | LocationUpdate
    | VpsCoordinates
    | CalendarEvent
    | Vad
    | PhoneNotification
    | PhoneNotificationDismissed
    | MentraosSettingsUpdateRequest
    | CoreStatusUpdate
    | RtmpStreamStatus
    | KeepAliveAck
    | PhotoResponse
    | RgbLedControlResponse
    | PhotoTaken
    | AudioPlayResponse
    | LocalTranscription

//===========================================================
// Cloud to Glasses Messages
//===========================================================

/**
 * Connection acknowledgment to glasses
 */
export interface ConnectionAck extends BaseMessage {
    type: CloudToGlassesMessageType.CONNECTION_ACK
    sessionId: string
    livekit?: {
        url: string
        roomName: string
        token: string
    }
}

/**
 * Connection error to glasses
 */
export interface ConnectionError extends BaseMessage {
    type: CloudToGlassesMessageType.CONNECTION_ERROR
    code?: string
    message: string
}

/**
 * Authentication error to glasses
 */
export interface AuthError extends BaseMessage {
    type: CloudToGlassesMessageType.AUTH_ERROR
    message: string
}

/**
 * Display update to glasses
 */
export interface DisplayEvent extends BaseMessage {
    type: CloudToGlassesMessageType.DISPLAY_EVENT
    layout: Layout
    durationMs?: number
}

/**
 * App state change to glasses
 */
export interface AppStateChange extends BaseMessage {
    type: CloudToGlassesMessageType.APP_STATE_CHANGE
    error?: string
}

/**
 * Microphone state change to glasses
 */
export interface MicrophoneStateChange extends BaseMessage {
    type: CloudToGlassesMessageType.MICROPHONE_STATE_CHANGE
    isMicrophoneEnabled: boolean
    requiredData: Array<"pcm" | "transcription" | "pcm_or_transcription">
    bypassVad?: boolean
}

/**
 * Photo request to glasses
 */
export interface PhotoRequestToGlasses extends BaseMessage {
    type: CloudToGlassesMessageType.PHOTO_REQUEST
    requestId: string
    appId: string
    saveToGallery?: boolean
    webhookUrl?: string
    authToken?: string
    size?: "small" | "medium" | "large"
    compress?: "none" | "medium" | "heavy"
}

/**
 * LED color type for RGB LED control
 */
export type LedColor = "red" | "green" | "blue" | "orange" | "white"

/**
 * RGB LED control request to glasses
 */
export interface RgbLedControlToGlasses extends BaseMessage {
    type: CloudToGlassesMessageType.RGB_LED_CONTROL
    requestId: string
    appId: string
    action: "on" | "off"
    color?: LedColor
    ontime?: number
    offtime?: number
    count?: number
}

/**
 * Settings update to glasses
 */
export interface SettingsUpdate extends BaseMessage {
    type: CloudToGlassesMessageType.SETTINGS_UPDATE
    sessionId: string
    settings: {
        useOnboardMic: boolean
        contextualDashboard: boolean
        metricSystemEnabled: boolean
        headUpAngle: number
        brightness: number
        autoBrightness: boolean
        sensingEnabled: boolean
        alwaysOnStatusBar: boolean
        bypassVad: boolean
        bypassAudioEncoding: boolean
    }
}

/**
 * LiveKit info for client to connect & publish
 */
export interface LiveKitInfo extends BaseMessage {
    type: CloudToGlassesMessageType.LIVEKIT_INFO
    url: string
    roomName: string
    token: string
}

/**
 * Start RTMP stream command to glasses
 */
export interface StartRtmpStream extends BaseMessage {
    type: CloudToGlassesMessageType.START_RTMP_STREAM
    rtmpUrl: string
    appId: string
    streamId?: string
    video?: any
    audio?: any
    stream?: any
}

/**
 * Stop RTMP stream command to glasses
 */
export interface StopRtmpStream extends BaseMessage {
    type: CloudToGlassesMessageType.STOP_RTMP_STREAM
    appId: string
    streamId?: string
}

/**
 * Keep RTMP stream alive command to glasses
 */
export interface KeepRtmpStreamAlive extends BaseMessage {
    type: CloudToGlassesMessageType.KEEP_RTMP_STREAM_ALIVE
    streamId: string
    ackId: string
}

/**
 * Sets the continuous location update tier on the device.
 */
export interface SetLocationTier extends BaseMessage {
    type: CloudToGlassesMessageType.SET_LOCATION_TIER
    tier: "realtime" | "high" | "tenMeters" | "hundredMeters" | "kilometer" | "threeKilometers" | "reduced" | "standard"
}

/**
 * Requests a single, on-demand location fix from the device.
 */
export interface RequestSingleLocation extends BaseMessage {
    type: CloudToGlassesMessageType.REQUEST_SINGLE_LOCATION
    accuracy: string
    correlationId: string
}

/**
 * Audio play request to glasses
 */
export interface AudioPlayRequestToGlasses extends BaseMessage {
    type: CloudToGlassesMessageType.AUDIO_PLAY_REQUEST
    requestId: string
    appId: string
    audioUrl: string
    volume?: number
    stopOtherAudio?: boolean
}

/**
 * Audio stop request to glasses
 */
export interface AudioStopRequestToGlasses extends BaseMessage {
    type: CloudToGlassesMessageType.AUDIO_STOP_REQUEST
    appId: string
}


/**
 * WiFi setup request to glasses/mobile
 */
export interface ShowWifiSetup extends BaseMessage {
    type: CloudToGlassesMessageType.SHOW_WIFI_SETUP
    reason?: string
    appPackageName?: string
}

/**
 * Union type for all messages from cloud to glasses
 */
export type CloudToGlassesMessage =
    | ConnectionAck
    | ConnectionError
    | AuthError
    | DisplayEvent
    | AppStateChange
    | MicrophoneStateChange
    | PhotoRequestToGlasses
    | RgbLedControlToGlasses
    | AudioPlayRequestToGlasses
    | AudioStopRequestToGlasses
    | ShowWifiSetup
    | AppStarted
    | AppStopped
    | SettingsUpdate
    | StartRtmpStream
    | StopRtmpStream
    | KeepRtmpStreamAlive
    | SetLocationTier
    | RequestSingleLocation
    | LiveKitInfo
    | ShowWifiSetup

//===========================================================
// Type guards
//===========================================================

export function isConnectionInit(message: GlassesToCloudMessage): message is ConnectionInit {
    return message.type === GlassesToCloudMessageType.CONNECTION_INIT
}

export function isStartApp(message: GlassesToCloudMessage): message is StartApp {
    return message.type === GlassesToCloudMessageType.START_APP
}

export function isStopApp(message: GlassesToCloudMessage): message is StopApp {
    return message.type === GlassesToCloudMessageType.STOP_APP
}

export function isButtonPress(message: GlassesToCloudMessage): message is ButtonPress {
    return message.type === GlassesToCloudMessageType.BUTTON_PRESS
}

export function isHeadPosition(message: GlassesToCloudMessage): message is HeadPosition {
    return message.type === GlassesToCloudMessageType.HEAD_POSITION
}

export function isGlassesBatteryUpdate(message: GlassesToCloudMessage): message is GlassesBatteryUpdate {
    return message.type === GlassesToCloudMessageType.GLASSES_BATTERY_UPDATE
}

export function isPhoneBatteryUpdate(message: GlassesToCloudMessage): message is PhoneBatteryUpdate {
    return message.type === GlassesToCloudMessageType.PHONE_BATTERY_UPDATE
}

export function isGlassesConnectionState(message: GlassesToCloudMessage): message is GlassesConnectionState {
    return message.type === GlassesToCloudMessageType.GLASSES_CONNECTION_STATE
}

export function isLocationUpdate(message: GlassesToCloudMessage): message is LocationUpdate {
    return message.type === GlassesToCloudMessageType.LOCATION_UPDATE
}

export function isPhoneNotificationDismissed(message: GlassesToCloudMessage): message is PhoneNotificationDismissed {
    return message.type === GlassesToCloudMessageType.PHONE_NOTIFICATION_DISMISSED
}

export function isPhotoResponse(message: GlassesToCloudMessage): message is PhotoResponse {
    return message.type === GlassesToCloudMessageType.PHOTO_RESPONSE
}

export function isRgbLedControlResponse(message: GlassesToCloudMessage): message is RgbLedControlResponse {
    return message.type === GlassesToCloudMessageType.RGB_LED_CONTROL_RESPONSE
}

export function isRtmpStreamStatus(message: GlassesToCloudMessage): message is RtmpStreamStatus {
    return message.type === GlassesToCloudMessageType.RTMP_STREAM_STATUS
}

export function isKeepAliveAck(message: GlassesToCloudMessage): message is KeepAliveAck {
    return message.type === GlassesToCloudMessageType.KEEP_ALIVE_ACK
}

export function isConnectionAck(message: CloudToGlassesMessage): message is ConnectionAck {
    return message.type === CloudToGlassesMessageType.CONNECTION_ACK
}

export function isConnectionError(message: CloudToGlassesMessage): message is ConnectionError {
    return message.type === CloudToGlassesMessageType.CONNECTION_ERROR
}

export function isAuthError(message: CloudToGlassesMessage): message is AuthError {
    return message.type === CloudToGlassesMessageType.AUTH_ERROR
}

export function isDisplayEvent(message: CloudToGlassesMessage): message is DisplayEvent {
    return message.type === CloudToGlassesMessageType.DISPLAY_EVENT
}

export function isAppStateChange(message: CloudToGlassesMessage): message is AppStateChange {
    return message.type === CloudToGlassesMessageType.APP_STATE_CHANGE
}

export function isMicrophoneStateChange(message: CloudToGlassesMessage): message is MicrophoneStateChange {
    return message.type === CloudToGlassesMessageType.MICROPHONE_STATE_CHANGE
}

export function isPhotoRequest(message: CloudToGlassesMessage): message is PhotoRequestToGlasses {
    return message.type === CloudToGlassesMessageType.PHOTO_REQUEST
}

export function isRgbLedControl(message: CloudToGlassesMessage): message is RgbLedControlToGlasses {
    return message.type === CloudToGlassesMessageType.RGB_LED_CONTROL
}

export function isSettingsUpdate(message: CloudToGlassesMessage): message is SettingsUpdate {
    return message.type === CloudToGlassesMessageType.SETTINGS_UPDATE
}

export function isStartRtmpStream(message: CloudToGlassesMessage): message is StartRtmpStream {
    return message.type === CloudToGlassesMessageType.START_RTMP_STREAM
}

export function isStopRtmpStream(message: CloudToGlassesMessage): message is StopRtmpStream {
    return message.type === CloudToGlassesMessageType.STOP_RTMP_STREAM
}

export function isKeepRtmpStreamAlive(message: CloudToGlassesMessage): message is KeepRtmpStreamAlive {
    return message.type === CloudToGlassesMessageType.KEEP_RTMP_STREAM_ALIVE
}

/**
 * App started notification to glasses
 */
export interface AppStarted extends BaseMessage {
    type: CloudToGlassesMessageType.APP_STARTED
    packageName: string
}

/**
 * App stopped notification to glasses
 */
export interface AppStopped extends BaseMessage {
    type: CloudToGlassesMessageType.APP_STOPPED
    packageName: string
}
