/**
 * @fileoverview Glasses WebSocket service that handles WebSocket connections from smart glasses clients.
 * This service manages glasses authentication, message processing, and session management.
 */

import WebSocket from "ws";
import { IncomingMessage } from "http";
import {
  MentraosSettingsUpdateRequest,
  CalendarEvent,
  CloudToGlassesMessage,
  CloudToGlassesMessageType,
  ConnectionAck,
  ConnectionError,
  ConnectionInit,
  CoreStatusUpdate,
  GlassesConnectionState,
  GlassesToCloudMessage,
  GlassesToCloudMessageType,
  HeadPosition,
  KeepAliveAck,
  LocationUpdate,
  PhotoResponse,
  RequestSettings,
  RtmpStreamStatus,
  LocalTranscription,
  Vad,
} from "@mentra/sdk";
import UserSession from "../session/UserSession";
import { logger as rootLogger } from "../logging/pino-logger";
import { PosthogService } from "../logging/posthog.service";
// sessionService functionality has been consolidated into UserSession
import { User } from "../../models/user.model";
import { SYSTEM_DASHBOARD_PACKAGE_NAME } from "../core/app.service";
import { locationService } from "../core/location.service";

const SERVICE_NAME = "websocket-glasses.service";
const logger = rootLogger.child({ service: SERVICE_NAME });

// Constants
const RECONNECT_GRACE_PERIOD_MS = 1000 * 60 * 1; // 1 minute

// SAFETY FLAG: Set to false to disable grace period cleanup entirely
const GRACE_PERIOD_CLEANUP_ENABLED = false; // TODO: Set to true when ready to enable auto-cleanup

const DEFAULT_AUGMENTOS_SETTINGS = {
  useOnboardMic: false,
  contextualDashboard: true,
  headUpAngle: 20,
  dashboardHeight: 4,
  dashboardDepth: 5,
  brightness: 50,
  autoBrightness: false,
  sensingEnabled: true,
  alwaysOnStatusBar: false,
  bypassVad: false,
  bypassAudioEncoding: false,
  metricSystemEnabled: false,
} as const;

/**
 * Error codes for glasses connection issues
 */
export enum GlassesErrorCode {
  INVALID_TOKEN = "INVALID_TOKEN",
  SESSION_ERROR = "SESSION_ERROR",
  MALFORMED_MESSAGE = "MALFORMED_MESSAGE",
  INTERNAL_ERROR = "INTERNAL_ERROR",
}

/**
 * Singleton Service that handles all glasses WebSocket connections.
 */
export class GlassesWebSocketService {
  private static instance: GlassesWebSocketService;
  private constructor() {}

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
  async handleConnection(
    ws: WebSocket,
    request: IncomingMessage,
  ): Promise<void> {
    try {
      // Get user ID from request (attached during JWT verification)
      const userId = (request as any).userId;
      const livekitRequested = (request as any).livekitRequested || false;

      if (!userId) {
        logger.error(
          { error: GlassesErrorCode.INVALID_TOKEN, request },
          "No user ID provided in request",
        );
        this.sendError(
          ws,
          GlassesErrorCode.INVALID_TOKEN,
          "Authentication failed",
        );
        return;
      }

      // Create or retrieve user session
      const { userSession, reconnection } = await UserSession.createOrReconnect(
        ws,
        userId,
      );
      userSession.logger.info(
        `Glasses WebSocket connection from user: ${userId} (LiveKit: ${livekitRequested})`,
      );

      // Store LiveKit preference in the session
      userSession.livekitRequested = livekitRequested;

      let i = 0;
      // Handle incoming messages
      ws.on("message", (data: WebSocket.Data, isBinary) => {
        try {
          // Handle binary message (audio data)
          if (isBinary) {
            i++;
            // await this.handleBinaryMessage(userSession, data);
            if (i % 10 === 0) {
              logger.debug(
                { service: "LiveKitManager" },
                "[Websocket]Received binary message",
              );
            }
            userSession.audioManager.processAudioData(data);
            return;
          }

          // Parse text message
          const message = JSON.parse(data.toString()) as GlassesToCloudMessage;

          if (message.type === GlassesToCloudMessageType.CONNECTION_INIT) {
            // Handle connection initialization message
            const connectionInitMessage = message as ConnectionInit;
            userSession.logger.info(
              `Received connection init message from glasses: ${JSON.stringify(
                connectionInitMessage,
              )}`,
            );
            // If this is a reconnection, we can skip the initialization logic
            this.handleConnectionInit(
              userSession,
              reconnection,
              userSession.livekitRequested || false,
            )
              .then(() => {
                userSession.logger.info(
                  `✅ Connection reinitialized for user: ${userSession.userId}`,
                );
              })
              .catch((error) => {
                userSession.logger.error(
                  error,
                  `❌ Failed to reinitialize connection for user: ${userSession.userId}`,
                );
              });
            return;
          }

          // Handle LiveKit init handshake (client requests LiveKit info)
          // if (message.type === GlassesToCloudMessageType.LIVEKIT_INIT) {
          //   userSession.liveKitManager
          //     .handleLiveKitInit()
          //     .then((info) => {
          //       if (!info) return;
          //       const livekitInfo: CloudToGlassesMessage = {
          //         type: CloudToGlassesMessageType.LIVEKIT_INFO,
          //         url: info.url,
          //         roomName: info.roomName,
          //         token: info.token,
          //         timestamp: new Date(),
          //       } as any;
          //       ws.send(JSON.stringify(livekitInfo));
          //       userSession.logger.info({ url: info.url, roomName: info.roomName, feature: 'livekit' }, 'Sent LIVEKIT_INFO (on LIVEKIT_INIT)');
          //     })
          //     .catch((e) => {
          //       userSession.logger.warn({ e, feature: 'livekit' }, 'Failed LIVEKIT_INIT handling');
          //     });
          //   return;
          // }

          // Process the message
          this.handleGlassesMessage(userSession, message)
            .then(() => {
              userSession.logger.info(
                `✅ Successfully processed message of type: ${message.type} for user: ${userId}`,
              );
            })
            .catch((error) => {
              userSession.logger.error(
                error,
                `❌ Error processing message of type: ${message.type} for user: ${userId}`,
              );
            });
        } catch (error) {
          userSession.logger.error(error, "Error processing glasses message:");
        }
      });

      // Handle connection close
      ws.on("close", (code: number, reason: string) => {
        this.handleGlassesConnectionClose(userSession, code, reason);
      });

      // Handle connection errors
      ws.on("error", (error: Error) => {
        userSession.logger.error(error, "Glasses WebSocket error:");
      });

      // Handle connection initialization
      this.handleConnectionInit(userSession, reconnection, livekitRequested);

      // NOTE: Do not auto-send LIVEKIT_INFO here to avoid unnecessary room usage.

      // Track connection in analytics
      PosthogService.trackEvent("glasses_connection", userId, {
        sessionId: userSession.userId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error(
        error,
        "Error handling glasses connection for user:" + (request as any).userId,
      );
      logger.debug(
        { service: SERVICE_NAME, request, userId: (request as any).userId },
        "Request details",
      );
      this.sendError(
        ws,
        GlassesErrorCode.SESSION_ERROR,
        "Failed to create session",
      );
    }
  }

  /**
   * Handle glasses message
   *
   * @param userSession User session
   * @param message Glasses message
   */
  private async handleGlassesMessage(
    userSession: UserSession,
    message: GlassesToCloudMessage,
  ): Promise<void> {
    try {
      const userId = userSession.userId;
      userSession.logger.debug(
        { service: SERVICE_NAME, message, type: message.type },
        `Handling glasses message for user: ${userId}`,
      );

      // Process message based on type
      switch (message.type) {
        // case GlassesToCloudMessageType.CONNECTION_INIT:
        //   await this.handleConnectionInit(userSession);
        //   break;

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
          await this.handleGlassesConnectionState(
            userSession,
            message as GlassesConnectionState,
          );
          userSession.relayMessageToApps(message);
          break;

        // Looks Good.
        case GlassesToCloudMessageType.VAD:
          await this.handleVad(userSession, message as Vad);
          userSession.relayMessageToApps(message);
          // TODO(isaiah): relay to Apps
          break;

        case GlassesToCloudMessageType.LOCAL_TRANSCRIPTION:
          await this.handleLocalTranscription(
            userSession,
            message as LocalTranscription,
          );
          userSession.relayMessageToApps(message);
          break;

        case GlassesToCloudMessageType.LOCATION_UPDATE:
          await locationService.handleDeviceLocationUpdate(
            userSession,
            message as LocationUpdate,
          );
          break;

        case GlassesToCloudMessageType.CALENDAR_EVENT:
          // TODO(isaiah): verify logic
          userSession.logger.debug(
            { service: SERVICE_NAME, message },
            "Calendar event received from glasses",
          );
          userSession.calendarManager.updateEventFromWebsocket(
            message as CalendarEvent,
          );
          break;

        // TODO(isaiah): verify logic
        case GlassesToCloudMessageType.REQUEST_SETTINGS:
          await this.handleRequestSettings(
            userSession,
            message as RequestSettings,
          );
          break;

        case GlassesToCloudMessageType.MENTRAOS_SETTINGS_UPDATE_REQUEST:
          await this.handleMentraOSSettingsUpdateRequest(
            userSession,
            message as MentraosSettingsUpdateRequest,
          );
          break;

        // TODO(isaiah): create a SettingsManager to handle settings updates instead of doing it here.
        case GlassesToCloudMessageType.CORE_STATUS_UPDATE: {
          const coreStatusUpdate = message as CoreStatusUpdate;
          const logger = userSession.logger.child({
            service: SERVICE_NAME,
            type: GlassesToCloudMessageType.CORE_STATUS_UPDATE,
          });
          // userSession.logger.info('Received core status update:', coreStatusUpdate);

          try {
            // The status is already an object, no need to parse
            const statusObj = coreStatusUpdate.status as any;
            const coreInfo = statusObj.status.core_info;
            const connectedGlasses = statusObj.status.connected_glasses;
            const glassesSettings = statusObj.status.glasses_settings;
            logger.debug(
              {
                coreInfo,
                statusObj,
                coreStatusUpdate,
                connectedGlasses,
                glasses_settings: glassesSettings,
              },
              "Core status update received",
            );

            if (!coreInfo || !connectedGlasses || !glassesSettings) {
              userSession.logger.error(
                "Invalid core status update format - missing required fields",
              );
              break;
            }

            // Update glasses model if available in status
            if (connectedGlasses.model_name) {
              await userSession.updateGlassesModel(connectedGlasses.model_name);
            }

            // Map core status fields to augmentos settings
            const newSettings = {
              useOnboardMic: coreInfo.force_core_onboard_mic,
              contextualDashboard: coreInfo.contextual_dashboard_enabled,
              metricSystemEnabled: coreInfo.metric_system_enabled,

              // Glasses settings.
              brightness: glassesSettings.brightness,
              autoBrightness: glassesSettings.auto_brightness,
              dashboardHeight: glassesSettings.dashboard_height,
              dashboardDepth: glassesSettings.dashboard_depth,
              headUpAngle: glassesSettings.head_up_angle,

              sensingEnabled: coreInfo.sensing_enabled,
              alwaysOnStatusBar: coreInfo.always_on_status_bar_enabled,
              bypassVad: coreInfo.bypass_vad_for_debugging,
              bypassAudioEncoding: coreInfo.bypass_audio_encoding_for_debugging,
              enforceLocalTranscription: coreInfo.enforce_local_transcription,
            };

            logger.debug({ newSettings }, "🔥🔥🔥: newSettings:");

            // Find or create the user
            const user = await User.findOrCreateUser(userSession.userId);

            // Get current settings before update
            const currentSettingsBeforeUpdate = JSON.parse(
              JSON.stringify(user.augmentosSettings),
            );
            userSession.logger.info(
              { currentSettingsBeforeUpdate },
              "Current settings before update:",
            );

            logger.debug(
              { currentSettingsBeforeUpdate },
              "🔥🔥🔥: currentSettingsBeforeUpdate:",
            );
            logger.debug({ newSettings }, "🔥🔥🔥: newSettings:");

            // Check if anything actually changed
            const changedKeys = this.getChangedKeys(
              currentSettingsBeforeUpdate,
              newSettings,
            );
            logger.debug({ changedKeys }, "🔥🔥🔥: changedKeys:");
            if (changedKeys.length === 0) {
              userSession.logger.info(
                { changedKeys },
                "No changes detected in settings from core status update",
              );
            } else {
              userSession.logger.info(
                {
                  changedFields: changedKeys.map((key) => ({
                    key,
                    from: `${
                      (currentSettingsBeforeUpdate as Record<string, any>)[key]
                    } (${typeof (
                      currentSettingsBeforeUpdate as Record<string, any>
                    )[key]})`,
                    to: `${
                      (newSettings as Record<string, any>)[key]
                    } (${typeof (newSettings as Record<string, any>)[key]})`,
                  })),
                },
                "Changes detected in settings from core status update:",
              );
              // Update the settings in the database before broadcasting
              try {
                await user.updateAugmentosSettings(newSettings);
                userSession.logger.info(
                  { newSettings },
                  "Updated AugmentOS settings in the database.",
                );
              } catch (dbError) {
                userSession.logger.error(
                  dbError,
                  "Failed to update AugmentOS settings in the database:",
                );
                return; // Do not broadcast if DB update fails
              }
              // Only notify for changed keys
              const notifiedApps = new Set<string>();
              for (const key of changedKeys) {
                const subscribedApps =
                  userSession.subscriptionManager.getSubscribedAppsForAugmentosSetting(
                    key,
                  );
                // userSession.logger.info('Subscribed apps for key:', key, subscribedApps);
                for (const packageName of subscribedApps) {
                  if (notifiedApps.has(packageName)) continue;
                  const appWs = userSession.appWebsockets.get(packageName);
                  if (appWs && appWs.readyState === 1) {
                    userSession.logger.info(
                      `[websocket.service]: Broadcasting AugmentOS settings update to ${packageName}`,
                    );
                    const augmentosSettingsUpdate = {
                      type: "augmentos_settings_update",
                      sessionId: `${userSession.sessionId}-${packageName}`,
                      settings: newSettings,
                      timestamp: new Date(),
                    };
                    appWs.send(JSON.stringify(augmentosSettingsUpdate));
                    notifiedApps.add(packageName);
                  }
                }
              }
            }
          } catch (error) {
            userSession.logger.error(
              error,
              "Error updating settings from core status:",
            );
          }
          break;
        }

        // Mentra Live.
        case GlassesToCloudMessageType.RTMP_STREAM_STATUS: {
          const status = message as RtmpStreamStatus;
          // First check if managed streaming extension handles it
          const managedHandled =
            await userSession.managedStreamingExtension.handleStreamStatus(
              userSession,
              status,
            );
          // If not handled by managed streaming, delegate to VideoManager
          if (!managedHandled) {
            userSession.videoManager.handleRtmpStreamStatus(status);
          }
          break;
        }

        case GlassesToCloudMessageType.KEEP_ALIVE_ACK: {
          const ack = message as KeepAliveAck;
          // Send to both managers - they'll handle their own streams
          userSession.managedStreamingExtension.handleKeepAliveAck(
            userSession.userId,
            ack,
          );
          userSession.videoManager.handleKeepAliveAck(ack);
          break;
        }

        case GlassesToCloudMessageType.PHOTO_RESPONSE:
          // Delegate to PhotoManager
          userSession.photoManager.handlePhotoResponse(
            message as PhotoResponse,
          );
          break;

        case GlassesToCloudMessageType.AUDIO_PLAY_RESPONSE:
          userSession.logger.debug(
            { service: SERVICE_NAME, message },
            `Audio play response received from glasses/core`,
          );
          // Forward audio play response to Apps - we need to find the specific app that made the request
          userSession.relayAudioPlayResponseToApp(message);
          break;

        case GlassesToCloudMessageType.HEAD_POSITION:
          await this.handleHeadPosition(userSession, message as HeadPosition);
          // Also relay to Apps in case they want to handle head position events
          userSession.relayMessageToApps(message);
          break;

        // TODO(isaiah): Add other message type handlers as needed
        default:
          // For messages that don't need special handling, relay to Apps
          // based on subscriptions
          userSession.logger.debug(
            `Relaying message type ${message.type} to Apps for user: ${userId}`,
          );
          userSession.relayMessageToApps(message);
          // TODO(isaiah): Verify Implemention message relaying to Apps
          break;
      }
    } catch (error) {
      userSession.logger.error(error, "Error handling glasses message:");
    }
  }

  /**
   * Handle connection init
   *
   * @param userSession User session
   * @param reconnection Whether this is a reconnection
   * @param livekitRequested Whether the client requested LiveKit transport
   */
  private async handleConnectionInit(
    userSession: UserSession,
    reconnection: boolean,
    livekitRequested = false,
  ): Promise<void> {
    if (!reconnection) {
      // Start all the apps that the user has running.
      try {
        // Start the dashboard app, but let's not add to the user's running apps since it's a system app.
        // honestly there should be no annyomous users so if it's an anonymous user we should just not start the dashboard
        await userSession.appManager.startApp(SYSTEM_DASHBOARD_PACKAGE_NAME);
      } catch (error) {
        userSession.logger.error({ error }, `Error starting dashboard app`);
      }

      // Start all the apps that the user has running.
      try {
        await userSession.appManager.startPreviouslyRunningApps();
      } catch (error) {
        userSession.logger.error({ error }, `Error starting user apps`);
      }

      // Transcription is now handled by TranscriptionManager based on app subscriptions
      // No need to preemptively start transcription here

      // Track connection event.
      PosthogService.trackEvent("connected", userSession.userId, {
        sessionId: userSession.sessionId,
        timestamp: new Date().toISOString(),
      });
    }

    // Prepare the base ACK message
    const ackMessage: ConnectionAck = {
      type: CloudToGlassesMessageType.CONNECTION_ACK,
      sessionId: userSession.sessionId,
      // userSession: await userSession.snapshotForClient(),
      timestamp: new Date(),
    };

    // If LiveKit was requested, initialize and include the info
    if (livekitRequested) {
      try {
        const livekitInfo =
          await userSession.liveKitManager.handleLiveKitInit();
        if (livekitInfo) {
          (ackMessage as any).livekit = {
            url: livekitInfo.url,
            roomName: livekitInfo.roomName,
            token: livekitInfo.token,
          };
          userSession.logger.info(
            {
              url: livekitInfo.url,
              roomName: livekitInfo.roomName,
              feature: "livekit",
            },
            "Included LiveKit info in CONNECTION_ACK",
          );
          userSession.logger.debug(
            {
              ackMessage,
              feature: "connection",
            },
            "Sent CONNECTION_ACK",
          );
        }
      } catch (error) {
        userSession.logger.warn(
          {
            error,
            feature: "livekit",
          },
          "Failed to initialize LiveKit for CONNECTION_ACK",
        );
      }
    }
    // TODO(isaiah): Think about weird edge case where it connects with livekit, then a reconnect without livekit. (should probably never happen, unless they change devices  mid-session and the new device doesn't want livekit)
    userSession.websocket.send(JSON.stringify(ackMessage));
  }

  // Utility function to get changed keys between two objects
  private getChangedKeys<T extends Record<string, any>>(
    before: T,
    after: T,
  ): string[] {
    return Object.keys(after).filter(
      (key) =>
        before[key] !== after[key] ||
        (typeof before[key] !== typeof after[key] && before[key] != after[key]),
    );
  }

  private async handleLocalTranscription(
    userSession: UserSession,
    message: LocalTranscription,
  ): Promise<void> {
    userSession.logger.debug(
      { message, service: SERVICE_NAME },
      "Local transcription received from glasses",
    );
    try {
      await userSession.transcriptionManager.handleLocalTranscription(message);
    } catch (error) {
      userSession.logger.error(
        { error, service: SERVICE_NAME },
        `Error handling local transcription:`,
        error,
      );
    }
  }

  /**
   * Handle VAD (Voice Activity Detection) message
   *
   * @param userSession User session
   * @param message VAD message
   */
  private async handleVad(
    userSession: UserSession,
    message: Vad,
  ): Promise<void> {
    const isSpeaking = message.status === true || message.status === "true";

    try {
      if (isSpeaking) {
        userSession.logger.info(
          "🎙️ VAD detected speech - ensuring streams exist",
        );
        userSession.isTranscribing = true;

        // Ensure both transcription and translation streams exist
        await Promise.all([
          userSession.transcriptionManager.ensureStreamsExist(),
          userSession.translationManager.ensureStreamsExist(),
        ]);
      } else {
        userSession.logger.info(
          "🤫 VAD detected silence - finalizing and cleaning up streams",
        );
        userSession.isTranscribing = false;

        // For transcription: finalize pending tokens first, then cleanup
        userSession.transcriptionManager.finalizePendingTokens();
        await userSession.transcriptionManager.cleanupIdleStreams();

        // For translation: stop streams but preserve subscriptions for VAD resume
        await userSession.translationManager.stopAllStreams();
      }
    } catch (error) {
      userSession.logger.error({ error }, "❌ Error handling VAD state change");
      userSession.isTranscribing = false;

      // On error, cleanup both managers
      try {
        // Transcription cleanup
        userSession.transcriptionManager.finalizePendingTokens();
        await userSession.transcriptionManager.cleanupIdleStreams();

        // Translation cleanup
        await userSession.translationManager.stopAllStreams();
      } catch (finalizeError) {
        userSession.logger.error(
          { error: finalizeError },
          "❌ Error cleaning up streams on VAD error",
        );
      }
    }
  }

  /**
   * Handle location update message
   *
   */
  private async handleLocationUpdate(
    userSession: UserSession,
    message: LocationUpdate,
  ): Promise<void> {
    userSession.logger.debug(
      { message, service: SERVICE_NAME },
      "Location update received from glasses",
    );
    try {
      // The core logic is now handled by the central LocationService to manage caching and polling.
      await locationService.handleDeviceLocationUpdate(userSession, message);

      // We still relay the message to any apps subscribed to the raw location stream.
      // The locationService's handleDeviceLocationUpdate will decide if it needs to send a specific
      // response for a poll request.
      userSession.relayMessageToApps(message);
    } catch (error) {
      userSession.logger.error(
        { error, service: SERVICE_NAME },
        `Error handling location update:`,
        error,
      );
    }
  }

  /**
   * Handle head position event message
   *
   * @param userSession User session
   * @param message Head position message
   */
  private async handleHeadPosition(
    userSession: UserSession,
    message: HeadPosition,
  ): Promise<void> {
    userSession.logger.debug(
      {
        position: message.position,
        service: SERVICE_NAME,
      },
      `Head position event received: ${message.position}`,
    );

    try {
      // If head position is 'up', trigger dashboard content cycling
      if (message.position === "up") {
        userSession.logger.info(
          {
            service: SERVICE_NAME,
            sessionId: userSession.sessionId,
          },
          "Head up detected - triggering dashboard content cycling",
        );

        // Call the dashboard manager's onHeadsUp method to cycle content
        userSession.dashboardManager.onHeadsUp();
      }

      // Track the head position event
      PosthogService.trackEvent(
        GlassesToCloudMessageType.HEAD_POSITION,
        userSession.userId,
        {
          sessionId: userSession.sessionId,
          position: message.position,
          timestamp: new Date().toISOString(),
        },
      );
    } catch (error) {
      userSession.logger.error(
        {
          error,
          service: SERVICE_NAME,
          position: message.position,
        },
        "Error handling head position event",
      );
    }
  }

  /**
   * Handle glasses connection state message
   *
   * @param userSession User session
   * @param message Connection state message
   */
  private async handleGlassesConnectionState(
    userSession: UserSession,
    message: GlassesConnectionState,
  ): Promise<void> {
    const glassesConnectionStateMessage = message as GlassesConnectionState;

    userSession.logger.info(
      { service: SERVICE_NAME, message },
      `handleGlassesConnectionState for user ${userSession.userId}`,
    );
    await userSession.deviceManager.handleGlassesConnectionState(
      glassesConnectionStateMessage.modelName || null,
      glassesConnectionStateMessage.status,
    );
    return;

    // Extract glasses model information
    const modelName = glassesConnectionStateMessage.modelName;
    const isConnected = glassesConnectionStateMessage.status === "CONNECTED";

    // Update connection state tracking in UserSession
    const wasConnected = userSession.glassesConnected;
    userSession.glassesConnected = isConnected;
    userSession.glassesModel = modelName;
    userSession.lastGlassesStatusUpdate = new Date();

    // Update glasses model in session when connected and model name is available
    if (isConnected && modelName) {
      await userSession.updateGlassesModel(modelName);
    }

    // Log connection state change if state changed
    if (wasConnected !== isConnected) {
      userSession.logger.info(
        {
          previousState: wasConnected,
          newState: isConnected,
          model: modelName,
          userId: userSession.userId,
        },
        `Glasses connection state changed from ${wasConnected} to ${isConnected} for user ${userSession.userId}`,
      );

      // The existing relayMessageToApps call below will notify subscribed apps
      // No need for additional broadcasting
    }

    try {
      // Get or create user to track glasses model
      const user = await User.findOrCreateUser(userSession.userId);

      // Track new glasses model if connected and model name exists
      if (isConnected && modelName) {
        const isNewModel = !user.getGlassesModels().includes(modelName);

        // Add glasses model to user's history
        await user.addGlassesModel(modelName);

        // Update PostHog person properties
        await PosthogService.setPersonProperties(userSession.userId, {
          current_glasses_model: modelName,
          glasses_models_used: user.getGlassesModels(),
          glasses_models_count: user.getGlassesModels().length,
          glasses_last_connected: new Date().toISOString(),
          glasses_current_connected: true,
        });

        // Track first-time connection for new glasses model
        if (isNewModel) {
          PosthogService.trackEvent(
            "glasses_model_first_connect",
            userSession.userId,
            {
              sessionId: userSession.sessionId,
              modelName,
              totalModelsUsed: user.getGlassesModels().length,
              timestamp: new Date().toISOString(),
            },
          );
        }
      } else if (!isConnected) {
        // Update PostHog person properties for disconnection
        await PosthogService.setPersonProperties(userSession.userId, {
          glasses_current_connected: false,
        });
      }
    } catch (error) {
      userSession.logger.error(error, "Error tracking glasses model:");
    }

    // Track the connection state event (enhanced with model info)
    PosthogService.trackEvent(
      GlassesToCloudMessageType.GLASSES_CONNECTION_STATE,
      userSession.userId,
      {
        sessionId: userSession.sessionId,
        eventType: message.type,
        timestamp: new Date().toISOString(),
        connectionState: glassesConnectionStateMessage,
        modelName,
        isConnected,
      },
    );
  }

  // NOTE(isaiah): This really should be a rest request instead of a websocket message.
  /**
   * Handle request settings message
   * @param userSession User session
   * @param message Request settings message
   */
  private async handleRequestSettings(
    userSession: UserSession,
    message: RequestSettings,
  ): Promise<void> {
    userSession.logger.info(
      { service: SERVICE_NAME, message },
      `handleRequestSettings for user ${userSession.userId}`,
    );

    try {
      const user = await User.findByEmail(userSession.userId);
      const userSettings =
        user?.augmentosSettings || DEFAULT_AUGMENTOS_SETTINGS;
      userSession.logger.debug(
        {
          service: SERVICE_NAME,
          userSettings,
          message,
          user_augmentosSettings: user?.augmentosSettings,
          default_augmentosSettings: DEFAULT_AUGMENTOS_SETTINGS,
        },
        `⚙️ Current AugmentOS settings for user ${userSession.userId}`,
      );
      const settingsMessage: CloudToGlassesMessage = {
        type: CloudToGlassesMessageType.SETTINGS_UPDATE,
        sessionId: userSession.sessionId,
        settings: userSettings,
        timestamp: new Date(),
      };

      userSession.logger.debug(
        { service: SERVICE_NAME, settingsMessage, message },
        "🔥🔥🔥: Sending settings update",
      );
      userSession.websocket.send(JSON.stringify(settingsMessage));
      userSession.logger.info(
        { service: SERVICE_NAME },
        "Sent settings update",
      );
    } catch (error) {
      userSession.logger.error(error, "Error sending settings:");
      const errorMessage: ConnectionError = {
        type: CloudToGlassesMessageType.CONNECTION_ERROR,
        message: "Error retrieving settings",
        timestamp: new Date(),
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
  private async handleMentraOSSettingsUpdateRequest(
    userSession: UserSession,
    message: MentraosSettingsUpdateRequest,
  ): Promise<void> {
    userSession.logger.info(
      { service: SERVICE_NAME, message },
      `handleMentraOSSettingsUpdateRequest for user ${userSession.userId}`,
    );

    try {
      // Find or create the user
      const user = await User.findOrCreateUser(userSession.userId);

      // Get current settings from database
      const currentSettings =
        user.augmentosSettings || DEFAULT_AUGMENTOS_SETTINGS;
      userSession.logger.debug(
        { currentSettings, message, service: SERVICE_NAME },
        `Current AugmentOS settings for user ${userSession.userId}`,
      );

      // Send current settings back to the client
      const responseMessage = {
        type: "settings_update",
        success: true,
        message: "Current settings retrieved successfully",
        settings: currentSettings,
        timestamp: new Date(),
      };

      userSession.websocket.send(JSON.stringify(responseMessage));
    } catch (error) {
      userSession.logger.error(error, "Error retrieving AugmentOS settings:");

      // Send error back to client
      const errorMessage = {
        type: "augmentos_settings_update_error",
        success: false,
        message:
          error instanceof Error ? error.message : "Error retrieving settings",
        timestamp: new Date(),
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
  private handleGlassesConnectionClose(
    userSession: UserSession,
    code: number,
    reason: string,
  ): void {
    userSession.logger.warn(
      { service: SERVICE_NAME, code, reason },
      `[WebsocketGlassesService:handleGlassesConnectionClose]: (${userSession.userId}, ${code}, ${reason}) - Glasses connection closed`,
    );

    // Mark session as disconnected
    // Clear any existing cleanup timer
    if (userSession.cleanupTimerId) {
      clearTimeout(userSession.cleanupTimerId);
      userSession.cleanupTimerId = undefined;
    }

    // Disconnecting is probably a network issue and the user will likely reconnect.
    // So we don't want to end the session immediately, but rather wait for a grace period
    // to see if the user reconnects.

    // Mark as disconnected
    userSession.disconnectedAt = new Date();

    // Set cleanup timer if not already set (and if cleanup is enabled)
    if (!GRACE_PERIOD_CLEANUP_ENABLED) {
      userSession.logger.debug(
        { service: SERVICE_NAME },
        `Grace period cleanup disabled by GRACE_PERIOD_CLEANUP_ENABLED=false for user: ${userSession.userId}`,
      );
    } else if (!userSession.cleanupTimerId) {
      userSession.cleanupTimerId = setTimeout(() => {
        userSession.logger.debug(
          { service: SERVICE_NAME },
          `Cleanup grace period expired for user session: ${userSession.userId}`,
        );

        // Check to see if the session has reconnected / if the user is still active.
        const wsState = userSession.websocket?.readyState;
        const wsExists = !!userSession.websocket;
        const wsOpen = wsState === WebSocket.OPEN;
        const wsConnecting = wsState === WebSocket.CONNECTING;

        userSession.logger.debug(
          {
            service: SERVICE_NAME,
            websocketExists: wsExists,
            websocketState: wsState,
            websocketStateNames:
              {
                0: "CONNECTING",
                1: "OPEN",
                2: "CLOSING",
                3: "CLOSED",
              }[wsState] || "UNKNOWN",
            isOpen: wsOpen,
            isConnecting: wsConnecting,
            disconnectedAt: userSession.disconnectedAt,
            timeSinceDisconnect: userSession.disconnectedAt
              ? Date.now() - userSession.disconnectedAt.getTime()
              : null,
          },
          `Grace period check: WebSocket state analysis for ${userSession.userId}`,
        );

        // Check if user reconnected by looking at disconnectedAt (more reliable than WebSocket state)
        if (!userSession.disconnectedAt) {
          userSession.logger.debug(
            {
              service: SERVICE_NAME,
              reason: "disconnectedAt_cleared",
            },
            `User session ${userSession.userId} has reconnected (disconnectedAt cleared), skipping cleanup.`,
          );
          clearTimeout(userSession.cleanupTimerId!);
          userSession.cleanupTimerId = undefined;
          return;
        }

        // Fallback: also check WebSocket state for backward compatibility
        if (
          userSession.websocket &&
          userSession.websocket.readyState === WebSocket.OPEN
        ) {
          userSession.logger.debug(
            {
              service: SERVICE_NAME,
              reason: "websocket_open",
            },
            `User session ${userSession.userId} has reconnected (WebSocket open), skipping cleanup.`,
          );
          clearTimeout(userSession.cleanupTimerId!);
          userSession.cleanupTimerId = undefined;
          return;
        }

        userSession.logger.debug(
          {
            service: SERVICE_NAME,
            finalWebsocketState: wsState,
            websocketExists: wsExists,
            reason: !wsExists
              ? "no_websocket"
              : !wsOpen
                ? "websocket_not_open"
                : "unknown",
          },
          `User session ${userSession.userId} determined not reconnected, cleaning up session.`,
        );
        // End the session
        // sessionService.endSession(userSession);
        userSession.dispose();
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
  private sendError(
    ws: WebSocket,
    code: GlassesErrorCode,
    message: string,
  ): void {
    try {
      const errorMessage: ConnectionError = {
        type: CloudToGlassesMessageType.CONNECTION_ERROR,
        code,
        message,
        timestamp: new Date(),
      };

      ws.send(JSON.stringify(errorMessage));
      ws.close(1008, message);
    } catch (error) {
      logger.error(error, "Error sending error message to glasses:");

      try {
        ws.close(1011, "Internal server error");
      } catch (closeError) {
        logger.error(closeError, "Error closing WebSocket connection:");
      }
    }
  }
}

// export default GlassesWebSocketService;
