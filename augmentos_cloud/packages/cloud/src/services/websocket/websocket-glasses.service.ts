/**
 * @fileoverview Glasses WebSocket service that handles WebSocket connections from smart glasses clients.
 * This service manages glasses authentication, message processing, and session management.
 */

import WebSocket from 'ws';
import { IncomingMessage } from 'http';
import {
  AugmentosSettingsUpdateRequest,
  CalendarEvent,
  CloudToGlassesMessage,
  CloudToGlassesMessageType,
  ConnectionAck,
  ConnectionError,
  ConnectionInit,
  GlassesConnectionState,
  GlassesToCloudMessage,
  GlassesToCloudMessageType,
  KeepAliveAck,
  LocationUpdate,
  PhotoResponse,
  RequestSettings,
  RtmpStreamStatus,
  SettingsUpdate,
  Vad
} from '@augmentos/sdk';
import UserSession from '../session/UserSession';
// import { SessionService } from '../session/session.service';
import { logger as rootLogger } from '../logging/pino-logger';
import subscriptionService from '../core/subscription.service';
import { PosthogService } from '../logging/posthog.service';
import { systemApps } from '../core/system-apps';
import { sessionService } from '../session/session.service';
import transcriptionService from '../processing/transcription.service';
import { User } from '../../models/user.model';

const SERVICE_NAME = 'websocket-glasses.service';
const logger = rootLogger.child({ service: SERVICE_NAME });

// Constants
const RECONNECT_GRACE_PERIOD_MS = 1000 * 60 * 1; // 1 minute

const DEFAULT_AUGMENTOS_SETTINGS = {
  useOnboardMic: false,
  contextualDashboard: true,
  headUpAngle: 20,
  brightness: 50,
  autoBrightness: false,
  sensingEnabled: true,
  alwaysOnStatusBar: false,
  bypassVad: false,
  bypassAudioEncoding: false,
  metricSystemEnabled: false
} as const;

/**
 * Error codes for glasses connection issues
 */
export enum GlassesErrorCode {
  INVALID_TOKEN = 'INVALID_TOKEN',
  SESSION_ERROR = 'SESSION_ERROR',
  MALFORMED_MESSAGE = 'MALFORMED_MESSAGE',
  INTERNAL_ERROR = 'INTERNAL_ERROR'
}

/**
 * Singleton Service that handles all glasses WebSocket connections.
 */
export class GlassesWebSocketService {

  private static instance: GlassesWebSocketService;
  private constructor() { }

  /**
   * Get singleton instance
   */
  static getInstance(): GlassesWebSocketService {
    if (!GlassesWebSocketService.instance) {
      GlassesWebSocketService.instance = new GlassesWebSocketService();
    }
    return GlassesWebSocketService.instance;
  }

  /**
   * Handle new glasses WebSocket connection
   * 
   * @param ws WebSocket connection
   * @param request HTTP request for the WebSocket upgrade
   */
  async handleConnection(ws: WebSocket, request: IncomingMessage): Promise<void> {
    try {
      // Get user ID from request (attached during JWT verification)
      const userId = (request as any).userId;

      if (!userId) {
        logger.error({
          error: GlassesErrorCode.INVALID_TOKEN,
          request,
        }, 'No user ID provided in request');
        this.sendError(ws, GlassesErrorCode.INVALID_TOKEN, 'Authentication failed');
        return;
      }

      logger.info({ userId }, `Glasses WebSocket connection from user: ${userId}`);

      // Create or retrieve user session
      const userSession = await sessionService.createSession(ws, userId);

      // Handle connection initialization
      this.handleConnectionInit(userSession);

      // Track connection in analytics
      PosthogService.trackEvent('glasses_connection', userId, {
        sessionId: userSession.userId,
        timestamp: new Date().toISOString()
      });

      // Handle incoming messages
      ws.on('message', async (data: WebSocket.Data) => {
        try {
          // Handle binary message (audio data)
          if (data instanceof Buffer || data instanceof ArrayBuffer) {
            await this.handleBinaryMessage(userSession, data);
            return;
          }

          // Parse text message
          const message = JSON.parse(data.toString()) as GlassesToCloudMessage;

          // Process the message
          await this.handleGlassesMessage(userSession, message);
        } catch (error) {
          userSession.logger.error('Error processing glasses message:', error);
        }
      });

      // Handle connection close
      ws.on('close', (code: number, reason: string) => {
        this.handleGlassesConnectionClose(userSession, code, reason);
      });

      // Handle connection errors
      ws.on('error', (error: Error) => {
        userSession.logger.error('Glasses WebSocket error:', error);
      });
    } catch (error) {
      logger.error(error, 'Error handling glasses connection');
      this.sendError(ws, GlassesErrorCode.SESSION_ERROR, 'Failed to create session');
    }
  }


  /**
   * Handle binary message (audio data)
   * 
   * @param userSession User session
   * @param data Binary audio data
   */
  private async handleBinaryMessage(userSession: UserSession, data: WebSocket.Data): Promise<void> {
    try {
      // Process audio data
      // userSession.logger.debug({ service: SERVICE_NAME, data }, `Handling binary message for user: ${userSession.userId}`);
      userSession.audioManager.processAudioData(data);
      // userSession.logger.debug({ service: SERVICE_NAME }, `Processed binary message for user: ${userSession.userId}`);
      // await sessionService.(userSession, data);
    } catch (error) {
      userSession.logger.error('Error handling binary message:', error);
    }
  }

  /**
   * Handle glasses message
   * 
   * @param userSession User session
   * @param message Glasses message
   */
  private async handleGlassesMessage(userSession: UserSession, message: GlassesToCloudMessage): Promise<void> {
    try {
      const userId = userSession.userId;

      // Process message based on type
      switch (message.type) {
        case GlassesToCloudMessageType.CONNECTION_INIT:
          await this.handleConnectionInit(userSession);
          break;

        // Looks Good.
        case GlassesToCloudMessageType.START_APP:
          await userSession.appManager.startApp(message.packageName);
          break;

        // Looks Good.
        case GlassesToCloudMessageType.STOP_APP:
          await userSession.appManager.stopApp(message.packageName);
          break;

        // Looks Good.
        case GlassesToCloudMessageType.GLASSES_CONNECTION_STATE:
          // TODO(isaiah): verify logic
          await this.handleGlassesConnectionState(userSession, message as GlassesConnectionState);
          break;

        // Looks Good.
        case GlassesToCloudMessageType.VAD:
          await this.handleVad(userSession, message as Vad);
          // TODO(isaiah): relay to TPAs
          break;

        case GlassesToCloudMessageType.LOCATION_UPDATE:
          await this.handleLocationUpdate(userSession, message as LocationUpdate);
          // TODO(isaiah): broadcast to TPAs
          break;

        case GlassesToCloudMessageType.CALENDAR_EVENT:
          // TODO(isaiah): verify logic
          userSession.logger.debug({ service: SERVICE_NAME, message }, 'Calendar event received from glasses');
          subscriptionService.cacheCalendarEvent(userSession.sessionId, message as CalendarEvent);
          // TODO(isaiah): broadcast to TPAs
          break;

        // TODO(isaiah): verify logic
        case GlassesToCloudMessageType.REQUEST_SETTINGS:
          await this.handleRequestSettings(userSession, message as RequestSettings);
          break;

        case GlassesToCloudMessageType.AUGMENTOS_SETTINGS_UPDATE_REQUEST:
          await this.handleAugmentOSSettingsUpdateRequest(userSession, message as AugmentosSettingsUpdateRequest);
          break;

        // Mentra Live.
        case GlassesToCloudMessageType.RTMP_STREAM_STATUS:
          // Delegate to VideoManager within the user's session
          userSession.videoManager.handleRtmpStatusUpdate(message as RtmpStreamStatus);
          break;

        case GlassesToCloudMessageType.KEEP_ALIVE_ACK:
          // Delegate to VideoManager
          userSession.videoManager.handleKeepAliveAck(message as KeepAliveAck);
          break;

        case GlassesToCloudMessageType.PHOTO_RESPONSE:
          // Delegate to PhotoManager
          userSession.photoManager.handlePhotoResponse(message as PhotoResponse);
          break;

        // TODO(isaiah): Add other message type handlers as needed
        default:
          // For messages that don't need special handling, relay to TPAs
          // based on subscriptions
          userSession.logger.debug(`Relaying message type ${message.type} to TPAs for user: ${userId}`);
          sessionService.relayMessageToTpas(userSession, message);
          // TODO(isaiah): Verify Implemention message relaying to TPAs
          break;
      }
    } catch (error) {
      userSession.logger.error('Error handling glasses message:', error);
    }
  }

  /**
   * Handle connection init
   * 
   * @param userSession User session
   */
  private async handleConnectionInit(userSession: UserSession): Promise<void> {
    // Start all the apps that the user has running.
    try {
      // Start the dashboard app, but let's not add to the user's running apps since it's a system app.
      // honestly there should be no annyomous users so if it's an anonymous user we should just not start the dashboard
      await userSession.appManager.startApp(systemApps.dashboard.packageName);
    }
    catch (error) {
      userSession.logger.error({ error }, `Error starting dashboard app`);
    }

    // Start all the apps that the user has running.
    try {
      await userSession.appManager.startPreviouslyRunningApps();
    }
    catch (error) {
      userSession.logger.error({ error }, `Error starting user apps`);
    }

    // TODO(isaiah): Check if we really need to start the transcription service here.
    // or if instead we should be checkig if the user has any media subscriptions and starting the transcription service if they do.
    // Start transcription
    transcriptionService.startTranscription(userSession);

    // const ackMessage: CloudConnectionAckMessage = {
    const ackMessage: ConnectionAck = {
      type: CloudToGlassesMessageType.CONNECTION_ACK,
      sessionId: userSession.sessionId,
      userSession: await sessionService.transformUserSessionForClient(userSession),
      timestamp: new Date()
    };

    userSession.websocket.send(JSON.stringify(ackMessage));

    // Track connection event.
    PosthogService.trackEvent('connected', userSession.userId, {
      sessionId: userSession.sessionId,
      timestamp: new Date().toISOString()
    });
  }


  /**
   * Handle VAD (Voice Activity Detection) message
   * 
   * @param userSession User session
   * @param message VAD message
   */
  private async handleVad(userSession: UserSession, message: Vad): Promise<void> {
    const isSpeaking = message.status === true || message.status === 'true';

    try {
      if (isSpeaking) {
        userSession.logger.info('🎙️ VAD detected speech - starting transcription');
        userSession.isTranscribing = true;
        transcriptionService.startTranscription(userSession);
      } else {
        userSession.logger.info('🤫 VAD detected silence - stopping transcription');
        userSession.isTranscribing = false;
        transcriptionService.stopTranscription(userSession);
      }
    } catch (error) {
      userSession.logger.error({ error }, '❌ Error handling VAD state change');
      userSession.isTranscribing = false;
      transcriptionService.stopTranscription(userSession);
    }
  }

  /**
   * Handle location update message
   * 
   */
  private async handleLocationUpdate(userSession: UserSession, message: LocationUpdate): Promise<void> {
    userSession.logger.debug({ message, service: SERVICE_NAME }, 'Location update received from glasses');
    try {
      // Cache the location update in subscription service
      subscriptionService.cacheLocation(userSession.sessionId, {
        latitude: message.lat,
        longitude: message.lng,
        timestamp: new Date()
      });

      const user = await User.findByEmail(userSession.userId);
      if (user) {
        await user.setLocation(message);
      }
    }
    catch (error) {
      userSession.logger.error({ error, service: SERVICE_NAME }, `Error updating user location:`, error);
    }
  }

  /**
   * Handle glasses connection state message
   * 
   * @param userSession User session
   * @param message Connection state message
   */
  private async handleGlassesConnectionState(userSession: UserSession, message: GlassesConnectionState): Promise<void> {
    const glassesConnectionStateMessage = message as GlassesConnectionState;

    userSession.logger.info({ service: SERVICE_NAME, message }, `handleGlassesConnectionState for user ${userSession.userId}`);
    userSession.microphoneManager.handleConnectionStateChange(glassesConnectionStateMessage.status);

    // Track the connection state event
    PosthogService.trackEvent(GlassesToCloudMessageType.GLASSES_CONNECTION_STATE, userSession.userId, {
      sessionId: userSession.sessionId,
      eventType: message.type,
      timestamp: new Date().toISOString(),
      connectionState: glassesConnectionStateMessage,
    });
  }

  // NOTE(isaiah): This really should be a rest request instead of a websocket message.
  /**
   * Handle request settings message
   * @param userSession User session
   * @param message Request settings message
   */
  private async handleRequestSettings(userSession: UserSession, message: RequestSettings): Promise<void> {
    userSession.logger.info({ service: SERVICE_NAME, message }, `handleRequestSettings for user ${userSession.userId}`);

    try {
      const user = await User.findByEmail(userSession.userId);
      const userSettings = user?.augmentosSettings || DEFAULT_AUGMENTOS_SETTINGS;

      const settingsMessage: CloudToGlassesMessage = {
        type: CloudToGlassesMessageType.SETTINGS_UPDATE,
        sessionId: userSession.sessionId,
        settings: userSettings,
        timestamp: new Date()
      };

      userSession.logger.debug({ service: SERVICE_NAME, settingsMessage, message }, "🔥🔥🔥: Sending settings update");
      userSession.websocket.send(JSON.stringify(settingsMessage));
      userSession.logger.info({ service: SERVICE_NAME }, 'Sent settings update');
    } catch (error) {
      userSession.logger.error('Error sending settings:', error);
      const errorMessage: ConnectionError = {
        type: CloudToGlassesMessageType.CONNECTION_ERROR,
        message: 'Error retrieving settings',
        timestamp: new Date()
      };
      userSession.websocket.send(JSON.stringify(errorMessage));
    }
  }

  // NOTE(isaiah): This really should be a rest request instead of a websocket message.
  // TODO(isaiah): This also doesn't seem to be implemented correctly. / fully.
  /**
   * Handle settings update message
   * 
   * @param userSession User session
   * @param message Settings update message
   */
  private async handleAugmentOSSettingsUpdateRequest(userSession: UserSession, message: AugmentosSettingsUpdateRequest): Promise<void> {
    userSession.logger.info({ service: SERVICE_NAME, message }, `handleAugmentOSSettingsUpdateRequest for user ${userSession.userId}`);

    try {
      // Find or create the user
      const user = await User.findOrCreateUser(userSession.userId);

      // Get current settings from database
      const currentSettings = user.augmentosSettings || DEFAULT_AUGMENTOS_SETTINGS;
      userSession.logger.debug({ currentSettings, message, service: SERVICE_NAME }, `Current AugmentOS settings for user ${userSession.userId}`);

      // Send current settings back to the client
      const responseMessage = {
        type: 'settings_update',
        success: true,
        message: 'Current settings retrieved successfully',
        settings: currentSettings,
        timestamp: new Date()
      };

      userSession.websocket.send(JSON.stringify(responseMessage));
    } catch (error) {
      userSession.logger.error('Error retrieving AugmentOS settings:', error);

      // Send error back to client
      const errorMessage = {
        type: 'augmentos_settings_update_error',
        success: false,
        message: error instanceof Error ? error.message : 'Error retrieving settings',
        timestamp: new Date()
      };
      userSession.websocket.send(JSON.stringify(errorMessage));
    }
  }

  // TODO(isaiah): Implement properly with reconnect grace period logic.
  /**
   * Handle glasses connection close
   * 
   * @param userSession User session
   * @param code Close code
   * @param reason Close reason
   */
  private handleGlassesConnectionClose(userSession: UserSession, code: number, reason: string): void {
    userSession.logger.info({ service: SERVICE_NAME, code, reason }, `Glasses connection closed for user: ${userSession.userId}  code: ${code}  reason: ${reason}`);

    // Mark session as disconnected
    sessionService.markSessionDisconnected(userSession);

    // Set cleanup timer if not already set
    if (!userSession.cleanupTimerId) {
      userSession.cleanupTimerId = setTimeout(() => {
        userSession.logger.info({ service: SERVICE_NAME }, `Cleanup grace period expired for user session: ${userSession.userId}`);

        // End the session
        sessionService.endSession(userSession);
      }, RECONNECT_GRACE_PERIOD_MS);
    }
  }

  /**
   * Send error message to glasses
   * 
   * @param ws WebSocket connection
   * @param code Error code
   * @param message Error message
   */
  private sendError(ws: WebSocket, code: GlassesErrorCode, message: string): void {
    try {
      const errorMessage: ConnectionError = {
        type: CloudToGlassesMessageType.CONNECTION_ERROR,
        code,
        message,
        timestamp: new Date()
      };

      ws.send(JSON.stringify(errorMessage));
      ws.close(1008, message);
    } catch (error) {
      logger.error('Error sending error message to glasses:', error);

      try {
        ws.close(1011, 'Internal server error');
      } catch (closeError) {
        logger.error('Error closing WebSocket connection:', closeError);
      }
    }
  }
}

// export default GlassesWebSocketService;