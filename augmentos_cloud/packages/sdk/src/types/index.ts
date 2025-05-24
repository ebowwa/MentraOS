// src/index.ts

export * from './token';

// Message type enums
export * from './message-types';

// Base message type
export * from './messages/base';

// Messages by direction
export * from './messages/glasses-to-cloud';
export * from './messages/cloud-to-glasses';
export * from './messages/tpa-to-cloud';
export * from './messages/cloud-to-tpa';

// Stream types
export * from './streams';

// Layout types
export * from './layouts';

// Dashboard types
export * from './dashboard';

// RTMP streaming types
export * from './rtmp-stream';

// Other system enums
export * from './enums';

// Core model interfaces
export * from './models';

// Session-related interfaces
export * from './user-session';

// Webhook interfaces
export * from './webhooks';


// Re-export common types for convenience
// This allows developers to import commonly used types directly from the package root
// without having to know exactly which file they come from

// From messages/glasses-to-cloud.ts
export {
  ButtonPress,
  HeadPosition,
  GlassesBatteryUpdate,
  PhoneBatteryUpdate,
  GlassesConnectionState,
  LocationUpdate,
  CalendarEvent,
  Vad,
  PhoneNotification,
  NotificationDismissed,
  StartApp,
  StopApp,
  ConnectionInit,
  DashboardState,
  OpenDashboard,
  GlassesToCloudMessage,
  PhotoResponse,
  RtmpStreamStatus
} from './messages/glasses-to-cloud';

// From messages/cloud-to-glasses.ts
export {
  ConnectionAck,
  ConnectionError,
  AuthError,
  DisplayEvent,
  AppStateChange,
  MicrophoneStateChange,
  CloudToGlassesMessage
} from './messages/cloud-to-glasses';

// From messages/tpa-to-cloud.ts
export {
  TpaConnectionInit,
  TpaSubscriptionUpdate,
  RtmpStreamRequest,
  RtmpStreamStopRequest,
  TpaToCloudMessage
} from './messages/tpa-to-cloud';

// From messages/cloud-to-tpa.ts
export {
  TpaConnectionAck,
  TpaConnectionError,
  AppStopped,
  SettingsUpdate,
  DataStream,
  CloudToTpaMessage,
  TranslationData,
  ToolCall
} from './messages/cloud-to-tpa';

// From layout.ts
export {
  TextWall,
  DoubleTextWall,
  DashboardCard,
  ReferenceCard,
  Layout,
  DisplayRequest
} from './layouts';

// Type guards - re-export the most commonly used ones for convenience
export {
  isButtonPress,
  isHeadPosition,
  isConnectionInit,
  isStartApp,
  isStopApp
} from './messages/glasses-to-cloud';

export {
  isConnectionAck,
  isDisplayEvent,
  isAppStateChange,
  isPhotoRequest
} from './messages/cloud-to-glasses';

export {
  isTpaConnectionInit,
  isTpaSubscriptionUpdate,
  isDisplayRequest,
  isRtmpStreamRequest,
  isRtmpStreamStopRequest
} from './messages/tpa-to-cloud';

export {
  isTpaConnectionAck,
  isDataStream,
  isAppStopped,
  isSettingsUpdate,
} from './messages/cloud-to-tpa';

// Export setting-related types
export {
  BaseAppSetting,
  GroupSetting,
  TpaConfig,
  validateTpaConfig,
  ToolSchema,
  ToolParameterSchema
} from './models';

// Export RTMP streaming types
export {
  VideoConfig,
  AudioConfig,
  StreamConfig,
  StreamStatusHandler
} from './rtmp-stream';

/**
 * WebSocket error information
 */
export interface WebSocketError {
  code: string;
  message: string;
  details?: unknown;
}

import { Request } from 'express';
export interface AuthenticatedRequest extends Request {
  authUserId?: string;
}
