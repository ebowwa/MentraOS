/**
 * @mentra/types - Shared types for MentraOS
 *
 * IMPORTANT: Uses explicit exports for Bun compatibility
 * DO NOT use `export *` - Bun runtime can't handle type re-exports
 * See: cloud/issues/todo/sdk-type-exports/README.md
 *
 * Pattern:
 * - Enums (runtime values) → export { ... }
 * - Types/Interfaces (compile-time only) → export type { ... }
 */

// ============================================================================
// Enums (runtime values)
// ============================================================================

export { HardwareType, HardwareRequirementLevel, DeviceTypes, AppType, LayoutType, ViewType, AppSettingType } from "./enums"

export {
  StreamType,
  StreamCategory,
  STREAM_CATEGORIES,
  isValidLanguageCode,
  parseLanguageStream,
  createTranscriptionStream,
  createTranslationStream,
  parseTouchEventStream,
  createTouchEventStream,
  createUniversalTranslationStream,
  isValidStreamType,
  isStreamCategory,
  getStreamTypesByCategory,
  getBaseStreamType,
  isLanguageStream,
  getLanguageInfo,
} from "./streams"

export type {
  ExtendedStreamType,
  LanguageStreamType,
  LanguageStreamInfo,
  LocationStreamRequest,
} from "./streams"

export {
  GlassesToCloudMessageType,
  CloudToGlassesMessageType,
  ControlActionTypes,
  EventTypes,
  ResponseTypes,
  UpdateTypes,
} from "./messages/client-cloud"

export {
  AppToCloudMessageType,
  CloudToAppMessageType,
  DashboardMessageTypes,
} from "./messages/app-cloud"

export {
  PermissionType,
  LEGACY_PERMISSION_MAP,
  validateAppConfig,
} from "./api/apps"

export type {
  ToolParameterSchema,
  ToolSchema,
  DeveloperProfile,
  Permission,
  PackagePermissions,
  AppI,
  BaseAppSetting,
  AppSetting,
  AppSettings,
  AppConfig,
  TranscriptSegment,
  TranscriptI,
} from "./api/apps"

export {
  WebhookRequestType,
  isSessionWebhookRequest,
  isStopWebhookRequest,
} from "./api/webhooks"

export type {
  BaseWebhookRequest,
  SessionWebhookRequest,
  StopWebhookRequest,
  WebhookRequest,
  WebhookResponse,
} from "./api/webhooks"

export type {
  AppTokenPayload,
  TokenValidationResult,
  TokenConfig,
} from "./api/auth"

export type {
  PhotoData,
} from "./media"

export {
  DashboardMode,
} from "./dashboard"

export type {
  DashboardContentUpdate,
  DashboardModeChange,
  DashboardSystemUpdate,
  DashboardMessage,
  DashboardAPI,
  DashboardContentAPI,
  DashboardSystemAPI,
} from "./dashboard"

export type {
  VideoConfig,
  AudioConfig,
  StreamConfig,
  StreamStatusHandler,
} from "./rtmp-stream"



export type {
  TextWall,
  DoubleTextWall,
  DashboardCard,
  ReferenceCard,
  BitmapView,
  BitmapAnimation,
  ClearView,
  Layout,
} from "./layouts"

export type {
  BaseMessage,
} from "./messages/base"

export type {
  // Glasses to Cloud
  ConnectionInit,
  LiveKitInit,
  RequestSettings,
  StartApp,
  StopApp,
  DashboardState,
  OpenDashboard,
  ButtonPress,
  HeadPosition,
  TouchEvent,
  GlassesBatteryUpdate,
  PhoneBatteryUpdate,
  GlassesConnectionState,
  LocationUpdate,
  VpsCoordinates,
  LocalTranscription,
  CalendarEvent,
  Vad,
  PhoneNotification,
  PhoneNotificationDismissed,
  MentraosSettingsUpdateRequest,
  CoreStatusUpdate,
  PhotoErrorCode,
  PhotoStage,
  ConnectionState,
  PhotoErrorDetails,
  PhotoResponse,
  RgbLedControlResponse,
  RtmpStreamStatus,
  KeepAliveAck,
  PhotoTaken,
  AudioPlayResponse,
  GlassesToCloudMessage,

  // Cloud to Glasses
  ConnectionAck,
  ConnectionError,
  WebSocketError,
  AuthError,
  DisplayEvent,
  AppStateChange,
  MicrophoneStateChange,
  PhotoRequestToGlasses,
  LedColor,
  RgbLedControlToGlasses,
  SettingsUpdate,
  LiveKitInfo,
  StartRtmpStream,
  StopRtmpStream,
  KeepRtmpStreamAlive,
  SetLocationTier,
  RequestSingleLocation,
  AudioPlayRequestToGlasses,
  AudioStopRequestToGlasses,
  ShowWifiSetup,
  CloudToGlassesMessage,
} from "./messages/client-cloud"

export type {
  // App to Cloud
  SubscriptionRequest,
  AppConnectionInit,
  AppSubscriptionUpdate,
  PhotoRequest as AppPhotoRequest, // Alias to avoid conflict if needed, or just PhotoRequest
  RgbLedControlRequest,
  RtmpStreamRequest,
  RtmpStreamStopRequest,
  AppLocationPollRequest,
  RestreamDestination,
  ManagedStreamRequest,
  ManagedStreamStopRequest,
  StreamStatusCheckRequest,
  AudioPlayRequest,
  AudioStopRequest,
  RequestWifiSetup,
  DisplayRequest,
  AppBroadcastMessage,
  AppDirectMessage,
  AppUserDiscovery,
  AppRoomJoin,
  AppRoomLeave,
  AppToCloudMessage,

  // Cloud to App
  AppConnectionAck,
  AppConnectionError,
  PermissionErrorDetail,
  PermissionError,
  AppStopped,
  // SettingsUpdate, // Conflict with client-cloud
  SettingsUpdate as AppSettingsUpdate,
  CapabilitiesUpdate,
  MentraosSettingsUpdate,
  TranscriptionData,
  TranscriptionMetadata,
  SonioxToken,
  TranslationData,
  AudioChunk,
  ToolCall,
  DataStream,
  DashboardModeChanged,
  DashboardAlwaysOnChanged,
  StandardConnectionError,
  CustomMessage,
  OutputStatus,
  ManagedStreamStatus,
  StreamStatusCheckResponse,
  // AudioPlayResponse, // Conflict with client-cloud
  // AudioPlayResponse, // Conflict with client-cloud
  AppMessageReceived,
  AppUserJoined,
  AppUserLeft,
  AppRoomUpdated,
  AppDirectMessageResponse,
  CloudToAppMessage,
  AppPhotoResponse,
  AppRgbLedControlResponse,
  AppRtmpStreamStatus,
  AppAudioPlayResponse,
} from "./messages/app-cloud"

export {
  isAppConnectionInit,
  isAppSubscriptionUpdate,
  isDisplayRequest,
  isRtmpStreamRequest,
  isRtmpStreamStopRequest,
  isPhotoRequest as isPhotoRequestFromApp,
  isRgbLedControlRequest,
  isAppConnectionAck,
  isAppConnectionError,
  isAppStopped,
  isSettingsUpdate as isSettingsUpdateToApp,
  isCapabilitiesUpdate,
  isDataStream,
  isAudioChunk,
  isStreamStatusCheckResponse,
  isDashboardModeChanged,
  isDashboardAlwaysOnChanged,
  isManagedStreamStatus,
  isPhotoResponse as isPhotoResponseFromCloud,
  isRgbLedControlResponse as isRgbLedControlResponseFromCloud,
  isRtmpStreamStatus as isRtmpStreamStatusFromCloud,
  isAudioPlayResponse as isAudioPlayResponseFromApp,
  isPermissionError,
} from "./messages/app-cloud"

export { isCloudToGlassesMessage } from "./messages/client-cloud"

// ============================================================================
// Hardware types (compile-time only)
// ============================================================================

export type {
  HardwareRequirement,
  CameraCapabilities,
  DisplayCapabilities,
  MicrophoneCapabilities,
  SpeakerCapabilities,
  IMUCapabilities,
  ButtonCapabilities,
  LightCapabilities,
  PowerCapabilities,
  Capabilities,
} from "./hardware"

// not a type:
export { HARDWARE_CAPABILITIES, getModelCapabilities } from "./hardware"

// ============================================================================
// Applet types (compile-time only)
// ============================================================================

export type { AppletType, AppPermissionType, AppletPermission, AppletInterface } from "./applet"

// ============================================================================
// CLI types (compile-time only)
// ============================================================================

export type { GlassesInfo } from "./device"

// ============================================================================
// CLI types (compile-time only)
// ============================================================================

export type {
  CLIApiKey,
  CLIApiKeyListItem,
  GenerateCLIKeyRequest,
  GenerateCLIKeyResponse,
  UpdateCLIKeyRequest,
  CLITokenPayload,
  CLICredentials,
  Cloud,
} from "./cli"
