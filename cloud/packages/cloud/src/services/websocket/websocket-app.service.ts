/**
 * @fileoverview App WebSocket service that handles WebSocket connections from Third-Party Applications.
 * This service manages App authentication, message processing, and session management.
 */

import WebSocket from "ws";
import { IncomingMessage } from "http";
import jwt from "jsonwebtoken";
import {
  AppConnectionInit,
  AppConnectionAck,
  AppConnectionError,
  AppToCloudMessage,
  AppToCloudMessageType,
  CloudToAppMessageType,
  AppSubscriptionUpdate,
  AppStateChange,
  StreamType,
  ExtendedStreamType,
  DataStream,
  LocationUpdate,
  GlassesToCloudMessageType,
  CloudToGlassesMessageType,
  PhotoRequest,
  AudioPlayRequest,
  AudioStopRequest,
  RtmpStreamRequest,
  RtmpStreamStopRequest,
  ManagedStreamRequest,
  ManagedStreamStopRequest,
  StreamStatusCheckRequest,
  StreamStatusCheckResponse,
  PermissionType,
} from "@mentra/sdk";
import UserSession from "../session/UserSession";
import * as developerService from "../core/developer.service";
// sessionService has been consolidated into UserSession methods
// import subscriptionService from '../session/subscription.service';
import { logger as rootLogger } from "../logging/pino-logger";
import photoRequestService from "../core/photo-request.service";
import e from "express";
import { locationService } from "../core/location.service";
import { SimplePermissionChecker } from "../permissions/simple-permission-checker";
import App from "../../models/app.model";
import { User } from "../../models/user.model";

const SERVICE_NAME = "websocket-app.service";
const logger = rootLogger.child({ service: SERVICE_NAME });

/**
 * Error codes for App connection issues
 */

// temp comment for porter push
export enum AppErrorCode {
  INVALID_JWT = "INVALID_JWT",
  JWT_SIGNATURE_FAILED = "JWT_SIGNATURE_FAILED",
  PACKAGE_NOT_FOUND = "PACKAGE_NOT_FOUND",
  INVALID_API_KEY = "INVALID_API_KEY",
  SESSION_NOT_FOUND = "SESSION_NOT_FOUND",
  MALFORMED_MESSAGE = "MALFORMED_MESSAGE",
  PERMISSION_DENIED = "PERMISSION_DENIED",
  INTERNAL_ERROR = "INTERNAL_ERROR",
}

/**
 * JWT payload structure for App authentication
 */
interface AppJwtPayload {
  packageName: string;
  apiKey: string;
}

interface AppIncomingMessage extends IncomingMessage {
  appJwtPayload?: AppJwtPayload;
  userId?: string;
  sessionId?: string;
}

/**
 * Service that handles App WebSocket connections
 */
export class AppWebSocketService {
  private static instance: AppWebSocketService;
  private logger = rootLogger.child({ service: SERVICE_NAME });

  // Debouncing for subscription changes to prevent rapid stream recreation
  private subscriptionChangeTimers = new Map<string, NodeJS.Timeout>();
  private readonly SUBSCRIPTION_DEBOUNCE_MS = 500; // 500ms debounce

  constructor() {}

  /**
   * Get the singleton instance of AppWebSocketService
   */
  static getInstance(): AppWebSocketService {
    if (!AppWebSocketService.instance) {
      AppWebSocketService.instance = new AppWebSocketService();
    }
    return AppWebSocketService.instance;
  }

  /**
   * Handle a new App WebSocket connection
   *
   * @param ws WebSocket connection
   * @param request HTTP request object
   */
  async handleConnection(
    ws: WebSocket,
    request: AppIncomingMessage,
  ): Promise<void> {
    logger.info("New App WebSocket connection");

    // Get user session if we have a sessionId
    let userSession: UserSession | undefined = undefined;

    // Apps using new SDK connecting to the cloud will send a JWT token in the request headers.
    try {
      // Check if the request has a valid JWT token.
      const appJwtPayload = request?.appJwtPayload as AppJwtPayload;

      if (appJwtPayload) {
        logger.info("App WebSocket connection with JWT token");
        const userId = request?.userId as string;
        const sessionId = request?.sessionId as string;

        // Enure there is an existing userSession for the app to connect to.
        userSession = UserSession.getById(userId);
        if (!userSession) {
          logger.error({ request }, "User session not found for App message");
          this.sendError(
            ws,
            AppErrorCode.SESSION_NOT_FOUND,
            "Session not found",
          );
          return;
        }

        // Create ConnectionInit message, and sent to the app manager to handle it.
        const initMessage: AppConnectionInit = {
          type: AppToCloudMessageType.CONNECTION_INIT,
          packageName: appJwtPayload.packageName,
          sessionId: sessionId,
          apiKey: appJwtPayload.apiKey,
        };
        await userSession.appManager.handleAppInit(ws, initMessage);
        // Mark app reconnect for subscription grace handling
        userSession.subscriptionManager.markAppReconnected(
          appJwtPayload.packageName,
        );
      }
    } catch (error) {
      logger.error(error, "Error processing App connection request");
      ws.close(1011, "Internal server error");
      return;
    }

    // Set up message handler
    ws.on("message", async (data: WebSocket.Data) => {
      try {
        // Parse the incoming message
        const message = JSON.parse(data.toString()) as AppToCloudMessage;

        // Check if it's old auth via App Init message.
        if (message.type === AppToCloudMessageType.CONNECTION_INIT) {
          const initMessage = message as AppConnectionInit;
          // Parse session ID to get user session ID
          const sessionParts = initMessage.sessionId.split("-");
          const userId = sessionParts[0];
          if (sessionParts.length < 2) {
            logger.error(
              { service: SERVICE_NAME, message },
              `Invalid session ID format: ${initMessage.sessionId}`,
            );
            ws.close(1008, "Invalid session ID format");
            return;
          }

          userSession = UserSession.getById(userId);
          if (!userSession) {
            logger.error(
              { request, message },
              "User session not found for App message",
            );
            this.sendError(
              ws,
              AppErrorCode.SESSION_NOT_FOUND,
              "Session not found",
            );
            return;
          }
          await userSession.appManager.handleAppInit(ws, initMessage);
          userSession.subscriptionManager.markAppReconnected(
            initMessage.packageName,
          );
        } else {
          // If we don't have a user session, we can't process other messages.
          if (!userSession) {
            logger.error(
              { request, data },
              "User session not found for App message",
            );
            this.sendError(
              ws,
              AppErrorCode.SESSION_NOT_FOUND,
              "Session not found",
            );
            return;
          }

          // Only handle non-connection init messages if we have a user session.
          await this.handleAppMessage(ws, userSession, message);
        }
      } catch (error) {
        logger.error(error, "Unexpected error processing App message");
        logger.debug(
          { service: SERVICE_NAME, data },
          "[debug] Unexpected error processing App message",
          data,
        );
        // General error handling when we can't even parse the message
        ws.close(1011, "Internal server error");
      }
    });
  }

  /**
   * Handle App message
   *
   * @param userSession UserSession
   * @param message AppToCloudMessage
   */
  private async handleAppMessage(
    appWebsocket: WebSocket,
    userSession: UserSession,
    message: AppToCloudMessage,
  ): Promise<void> {
    try {
      // Process based on message type
      switch (message.type) {
        case AppToCloudMessageType.SUBSCRIPTION_UPDATE:
          // Ensure we await the subscription update handling to avoid race conditions
          await this.handleSubscriptionUpdate(
            appWebsocket,
            userSession,
            message,
          );
          break;

        case AppToCloudMessageType.DISPLAY_REQUEST:
          userSession.logger.debug(
            {
              service: SERVICE_NAME,
              message,
              packageName: message.packageName,
            },
            `Received display request from App: ${message.packageName}`,
          );
          userSession.displayManager.handleDisplayRequest(message);
          // Handle display request
          break;

        // Dashboard message handling
        case AppToCloudMessageType.DASHBOARD_CONTENT_UPDATE:
        case AppToCloudMessageType.DASHBOARD_MODE_CHANGE:
        case AppToCloudMessageType.DASHBOARD_SYSTEM_UPDATE: {
          userSession.dashboardManager.handleAppMessage(message);
          break;
        }

        // Mentra Live Photo / Video Stream Request message handling.
        case AppToCloudMessageType.RTMP_STREAM_REQUEST:
          // Check camera permission before processing RTMP stream request
          try {
            const rtmpRequestMsg = message as RtmpStreamRequest;

            // Check if app has camera permission
            const hasCameraPermission = await this.checkCameraPermission(
              rtmpRequestMsg.packageName,
              userSession,
            );
            if (!hasCameraPermission) {
              this.logger.warn(
                {
                  packageName: rtmpRequestMsg.packageName,
                  userId: userSession.userId,
                },
                "RTMP stream request denied: app does not have CAMERA permission",
              );
              this.sendError(
                appWebsocket,
                AppErrorCode.PERMISSION_DENIED,
                "Camera permission required to start video streams. Please add the CAMERA permission in the developer console.",
              );
              break;
            }

            // Delegate to VideoManager
            const streamId =
              await userSession.videoManager.startRtmpStream(rtmpRequestMsg);
            this.logger.info(
              { streamId, packageName: rtmpRequestMsg.packageName },
              "RTMP Stream request processed by VideoManager.",
            );
          } catch (e) {
            this.logger.error(
              { e, packageName: message.packageName },
              "Error starting RTMP stream via VideoManager",
            );
            this.sendError(
              appWebsocket,
              AppErrorCode.INTERNAL_ERROR,
              (e as Error).message || "Failed to start stream.",
            );
          }
          break;

        case AppToCloudMessageType.RTMP_STREAM_STOP:
          // Delegate to VideoManager
          try {
            await userSession.videoManager.stopRtmpStream(
              message as RtmpStreamStopRequest,
            );
            this.logger.info(
              {
                packageName: message.packageName,
                streamId: (message as RtmpStreamStopRequest).streamId,
              },
              "RTMP Stream stop request processed by VideoManager.",
            );
          } catch (e) {
            this.logger.error(
              { e, packageName: message.packageName },
              "Error stopping RTMP stream via VideoManager",
            );
            this.sendError(
              appWebsocket,
              AppErrorCode.INTERNAL_ERROR,
              (e as Error).message || "Failed to stop stream.",
            );
          }
          break;

        case AppToCloudMessageType.LOCATION_POLL_REQUEST:
          try {
            await locationService.handlePollRequest(
              userSession,
              message.accuracy,
              message.correlationId,
              message.packageName,
            );
          } catch (e) {
            this.logger.error(
              { e, packageName: message.packageName },
              "Error handling location poll request",
            );
            this.sendError(
              appWebsocket,
              AppErrorCode.INTERNAL_ERROR,
              (e as Error).message || "Failed to handle location poll.",
            );
          }
          break;

        case AppToCloudMessageType.PHOTO_REQUEST:
          // Check camera permission before processing photo request
          try {
            const photoRequestMsg = message as PhotoRequest;

            // Check if app has camera permission
            const hasCameraPermission = await this.checkCameraPermission(
              photoRequestMsg.packageName,
              userSession,
            );
            if (!hasCameraPermission) {
              this.logger.warn(
                {
                  packageName: photoRequestMsg.packageName,
                  userId: userSession.userId,
                },
                "Photo request denied: app does not have CAMERA permission",
              );
              this.sendError(
                appWebsocket,
                AppErrorCode.PERMISSION_DENIED,
                "Camera permission required to take photos. Please add the CAMERA permission in the developer console.",
              );
              break;
            }

            // Delegate to PhotoManager
            const requestId =
              await userSession.photoManager.requestPhoto(photoRequestMsg);
            this.logger.info(
              { requestId, packageName: photoRequestMsg.packageName },
              "Photo request processed by PhotoManager.",
            );
          } catch (e) {
            this.logger.error(
              { e, packageName: message.packageName },
              "Error requesting photo via PhotoManager",
            );
            this.sendError(
              appWebsocket,
              AppErrorCode.INTERNAL_ERROR,
              (e as Error).message || "Failed to request photo.",
            );
          }
          break;

        case AppToCloudMessageType.AUDIO_PLAY_REQUEST:
          // Forward audio play request to glasses/manager
          try {
            const audioRequestMsg = message as AudioPlayRequest;

            // Store the mapping of requestId -> packageName for response routing
            userSession.audioPlayRequestMapping.set(
              audioRequestMsg.requestId,
              audioRequestMsg.packageName,
            );
            userSession.logger.debug(
              `🔊 [AppWebSocketService] Stored audio request mapping: ${audioRequestMsg.requestId} -> ${audioRequestMsg.packageName}`,
            );

            // Forward the audio play request to the glasses/manager
            // Convert from app-to-cloud format to cloud-to-glasses format
            const glassesAudioRequest = {
              type: CloudToGlassesMessageType.AUDIO_PLAY_REQUEST,
              sessionId: userSession.sessionId,
              requestId: audioRequestMsg.requestId,
              packageName: audioRequestMsg.packageName,
              audioUrl: audioRequestMsg.audioUrl,
              volume: audioRequestMsg.volume,
              stopOtherAudio: audioRequestMsg.stopOtherAudio,
              timestamp: new Date(),
            };

            // Send to glasses/manager via WebSocket
            if (
              userSession.websocket &&
              userSession.websocket.readyState === 1
            ) {
              userSession.websocket.send(JSON.stringify(glassesAudioRequest));
              userSession.logger.debug(
                `🔊 [AppWebSocketService] Forwarded audio request ${audioRequestMsg.requestId} to glasses`,
              );
              // Also request server-side playback via Go bridge when enabled
              void userSession.speakerManager.start(audioRequestMsg);
            } else {
              // Clean up mapping if we can't forward the request
              userSession.audioPlayRequestMapping.delete(
                audioRequestMsg.requestId,
              );
              this.sendError(
                appWebsocket,
                AppErrorCode.INTERNAL_ERROR,
                "Glasses not connected",
              );
            }
          } catch (e) {
            // Clean up mapping if an exception occurs to prevent memory leak
            const audioRequestMsg = message as AudioPlayRequest;
            if (audioRequestMsg?.requestId) {
              userSession.audioPlayRequestMapping.delete(
                audioRequestMsg.requestId,
              );
            }
            this.sendError(
              appWebsocket,
              AppErrorCode.INTERNAL_ERROR,
              (e as Error).message || "Failed to process audio request.",
            );
          }
          break;

        case AppToCloudMessageType.AUDIO_STOP_REQUEST:
          // Forward audio stop request to glasses/manager
          try {
            const audioStopMsg = message as AudioStopRequest;

            // Forward the audio stop request to the glasses/manager
            // Convert from app-to-cloud format to cloud-to-glasses format
            const glassesAudioStopRequest = {
              type: CloudToGlassesMessageType.AUDIO_STOP_REQUEST,
              sessionId: userSession.sessionId,
              appId: audioStopMsg.packageName,
              timestamp: new Date(),
            };

            // Send to glasses/manager via WebSocket
            if (
              userSession.websocket &&
              userSession.websocket.readyState === 1
            ) {
              userSession.websocket.send(
                JSON.stringify(glassesAudioStopRequest),
              );
              userSession.logger.debug(
                `🔇 [AppWebSocketService] Forwarded audio stop request from ${audioStopMsg.packageName} to glasses`,
              );
              // Also stop server-side playback when enabled
              void userSession.speakerManager.stop(audioStopMsg);
            } else {
              this.sendError(
                appWebsocket,
                AppErrorCode.INTERNAL_ERROR,
                "Glasses not connected",
              );
            }
          } catch (e) {
            this.sendError(
              appWebsocket,
              AppErrorCode.INTERNAL_ERROR,
              (e as Error).message || "Failed to process audio stop request.",
            );
          }
          break;

        case AppToCloudMessageType.MANAGED_STREAM_REQUEST:
          try {
            const managedReq = message as ManagedStreamRequest;

            // Check if app has camera permission
            const hasCameraPermission = await this.checkCameraPermission(
              managedReq.packageName,
              userSession,
            );
            if (!hasCameraPermission) {
              this.logger.warn(
                {
                  packageName: managedReq.packageName,
                  userId: userSession.userId,
                },
                "Managed stream request denied: app does not have CAMERA permission",
              );
              this.sendError(
                appWebsocket,
                AppErrorCode.PERMISSION_DENIED,
                "Camera permission required to start managed streams. Please add the CAMERA permission in the developer console.",
              );
              break;
            }

            const streamId =
              await userSession.managedStreamingExtension.startManagedStream(
                userSession,
                managedReq,
              );
            this.logger.info(
              {
                streamId,
                packageName: managedReq.packageName,
              },
              "Managed stream request processed",
            );
          } catch (e) {
            this.logger.error(
              {
                e,
                packageName: message.packageName,
              },
              "Error starting managed stream",
            );
            this.sendError(
              appWebsocket,
              AppErrorCode.INTERNAL_ERROR,
              (e as Error).message || "Failed to start managed stream",
            );
          }
          break;

        case AppToCloudMessageType.MANAGED_STREAM_STOP:
          try {
            const stopReq = message as ManagedStreamStopRequest;
            await userSession.managedStreamingExtension.stopManagedStream(
              userSession,
              stopReq,
            );
            this.logger.info(
              {
                packageName: stopReq.packageName,
              },
              "Managed stream stop request processed",
            );
          } catch (e) {
            this.logger.error(
              {
                e,
                packageName: message.packageName,
              },
              "Error stopping managed stream",
            );
            this.sendError(
              appWebsocket,
              AppErrorCode.INTERNAL_ERROR,
              (e as Error).message || "Failed to stop managed stream",
            );
          }
          break;

        case AppToCloudMessageType.STREAM_STATUS_CHECK:
          try {
            const checkReq = message as StreamStatusCheckRequest;

            // First check for managed streams via ManagedStreamingExtension
            const managedStreamState =
              userSession.managedStreamingExtension.getUserStreamState(
                userSession.userId,
              );

            // Then check for unmanaged streams via VideoManager
            const unmanagedStreamInfo =
              userSession.videoManager.getActiveStreamInfo();

            // Build response based on what we found
            const response: StreamStatusCheckResponse = {
              type: CloudToAppMessageType.STREAM_STATUS_CHECK_RESPONSE,
              hasActiveStream: !!(managedStreamState || unmanagedStreamInfo),
            };

            if (managedStreamState) {
              // Managed stream found (handled by ManagedStreamingExtension)
              if (managedStreamState.type === "managed") {
                // Generate preview and thumbnail URLs for the stream
                const previewUrl = `https://iframe.videodelivery.net/${managedStreamState.cfLiveInputId}?autoplay=true&muted=true&controls=true`;
                const thumbnailUrl = `https://videodelivery.net/${managedStreamState.cfLiveInputId}/thumbnails/thumbnail.jpg`;

                response.streamInfo = {
                  type: "managed",
                  streamId: managedStreamState.streamId,
                  status: "active",
                  createdAt: managedStreamState.createdAt,
                  hlsUrl: managedStreamState.hlsUrl,
                  dashUrl: managedStreamState.dashUrl,
                  webrtcUrl: managedStreamState.webrtcUrl,
                  previewUrl: previewUrl,
                  thumbnailUrl: thumbnailUrl,
                  activeViewers: managedStreamState.activeViewers.size,
                };
              } else {
                // This is an unmanaged stream tracked by ManagedStreamingExtension
                response.streamInfo = {
                  type: "unmanaged",
                  streamId: managedStreamState.streamId,
                  status: "active",
                  createdAt: managedStreamState.createdAt,
                  rtmpUrl: managedStreamState.rtmpUrl,
                  requestingAppId: managedStreamState.requestingAppId,
                };
              }
            } else if (unmanagedStreamInfo) {
              // Unmanaged stream found (handled by VideoManager)
              response.streamInfo = {
                type: "unmanaged",
                streamId: unmanagedStreamInfo.streamId,
                status: unmanagedStreamInfo.status,
                createdAt: unmanagedStreamInfo.startTime,
                rtmpUrl: unmanagedStreamInfo.rtmpUrl,
                requestingAppId: unmanagedStreamInfo.packageName,
              };
            }

            // Send response to app
            appWebsocket.send(JSON.stringify(response));

            this.logger.info(
              {
                packageName: checkReq.packageName,
                hasActiveStream: response.hasActiveStream,
                streamType: response.streamInfo?.type,
                streamSource: managedStreamState
                  ? "ManagedStreamingExtension"
                  : unmanagedStreamInfo
                    ? "VideoManager"
                    : "none",
              },
              "Stream status check processed",
            );
          } catch (e) {
            this.logger.error(
              {
                e,
                packageName: message.packageName,
              },
              "Error checking stream status",
            );
            this.sendError(
              appWebsocket,
              AppErrorCode.INTERNAL_ERROR,
              (e as Error).message || "Failed to check stream status",
            );
          }
          break;

        default:
          logger.warn(`Unhandled App message type: ${message.type}`);
          break;
      }
    } catch (error) {
      userSession.logger.error(
        { error, message },
        "Error handling App message",
      );
    }
  }

  // Handle Subscription updates.
  private async handleSubscriptionUpdate(
    appWebsocket: WebSocket,
    userSession: UserSession,
    message: AppSubscriptionUpdate,
  ): Promise<void> {
    const packageName = message.packageName;
    userSession.logger.debug(
      { service: SERVICE_NAME, message, packageName },
      `Received subscription update from App: ${packageName}`,
    );

    // Get the minimal language subscriptions before update (session-scoped)
    const previousLanguageSubscriptions =
      userSession.subscriptionManager.getMinimalLanguageSubscriptions();

    // Check if the app is newly subscribing to calendar events
    const isNewCalendarSubscription =
      !userSession.subscriptionManager.hasSubscription(
        message.packageName,
        StreamType.CALENDAR_EVENT,
      ) &&
      message.subscriptions.some(
        (sub) => typeof sub === "string" && sub === StreamType.CALENDAR_EVENT,
      );

    // Check if the app is newly subscribing to location updates
    const isNewLocationSubscription =
      !userSession.subscriptionManager.hasSubscription(
        message.packageName,
        StreamType.LOCATION_UPDATE,
      ) &&
      message.subscriptions.some((sub) => {
        if (typeof sub === "string") return sub === StreamType.LOCATION_UPDATE;
        return (
          sub.stream === StreamType.LOCATION_STREAM ||
          sub.stream === StreamType.LOCATION_UPDATE
        );
      });

    try {
      // Update session-scoped subscriptions and await completion to prevent races
      const updatedUser =
        await userSession.subscriptionManager.updateSubscriptions(
          message.packageName,
          message.subscriptions,
        );
      if (updatedUser) {
        locationService.handleSubscriptionChange(updatedUser, userSession);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      userSession.logger.error(
        {
          service: SERVICE_NAME,
          error: {
            message: errorMessage,
            name: (error as Error).name,
            stack: (error as Error).stack,
            details: error,
          },
          packageName,
          subscriptions: message.subscriptions,
          userId: userSession.userId,
          logKey: "##SUBSCRIPTION_ERROR##",
        },
        `##SUBSCRIPTION_ERROR##: Failed to update subscriptions for App ${packageName}, which will cause a disconnect.`,
      );
      this.sendError(
        appWebsocket,
        AppErrorCode.MALFORMED_MESSAGE,
        `Invalid subscription type: ${errorMessage}`,
      );
      return;
    }

    // Get the new minimal language subscriptions after update
    const newLanguageSubscriptions =
      userSession.subscriptionManager.getMinimalLanguageSubscriptions();

    // Check if language subscriptions have changed
    const languageSubscriptionsChanged =
      previousLanguageSubscriptions.length !==
        newLanguageSubscriptions.length ||
      !previousLanguageSubscriptions.every((sub) =>
        newLanguageSubscriptions.includes(sub),
      );

    if (languageSubscriptionsChanged) {
      userSession.logger.info(
        { service: SERVICE_NAME, languageSubscriptionsChanged, packageName },
        `Language subscriptions changed for ${packageName} in session ${userSession.userId}`,
      );

      // 🚨 DEBOUNCED SUBSCRIPTION UPDATES - Prevent rapid stream recreation
      const userId = userSession.userId;

      // Clear existing timer if present
      if (this.subscriptionChangeTimers.has(userId)) {
        clearTimeout(this.subscriptionChangeTimers.get(userId)!);
      }

      // Set debounced timer for transcription stream updates
      this.subscriptionChangeTimers.set(
        userId,
        setTimeout(() => {
          try {
            userSession.logger.debug(
              {
                service: SERVICE_NAME,
                newLanguageSubscriptions,
                userId,
                operation: "debouncedStreamUpdate",
              },
              "Applying debounced transcription stream update",
            );

            // Update transcription streams with new language subscriptions
            // Note: subscriptionService automatically syncs TranscriptionManager, so no direct call needed

            // Check if we need to update microphone state based on media subscriptions
            userSession.microphoneManager.handleSubscriptionChange();
          } catch (error) {
            userSession.logger.error(
              {
                service: SERVICE_NAME,
                error,
                userId,
                operation: "debouncedStreamUpdateError",
              },
              "Error in debounced subscription update",
            );
          } finally {
            // Clean up timer
            this.subscriptionChangeTimers.delete(userId);
          }
        }, this.SUBSCRIPTION_DEBOUNCE_MS),
      );
    }

    // Send cached calendar event if app just subscribed to calendar events
    if (isNewCalendarSubscription) {
      userSession.logger.info(
        { service: SERVICE_NAME, isNewCalendarSubscription, packageName },
        `isNewCalendarSubscription: ${isNewCalendarSubscription} for app ${packageName}`,
      );
      const allCalendarEvents =
        userSession.subscriptionManager.getAllCalendarEvents();
      if (allCalendarEvents.length > 0) {
        userSession.logger.debug(
          { service: SERVICE_NAME, allCalendarEvents },
          `Sending ${allCalendarEvents.length} cached calendar events to newly subscribed app ${message.packageName}`,
        );

        if (appWebsocket && appWebsocket.readyState === WebSocket.OPEN) {
          for (const event of allCalendarEvents) {
            const dataStream: DataStream = {
              type: CloudToAppMessageType.DATA_STREAM,
              streamType: StreamType.CALENDAR_EVENT,
              sessionId: `${userSession.userId}-${message.packageName}`,
              data: event,
              timestamp: new Date(),
            };
            appWebsocket.send(JSON.stringify(dataStream));
          }
        }
      }
    }

    // Send cached location if app just subscribed to location updates
    if (isNewLocationSubscription) {
      userSession.logger.info(
        { service: SERVICE_NAME, isNewLocationSubscription, packageName },
        `isNewLocationSubscription: ${isNewLocationSubscription} for app ${packageName}`,
      );
      const user = await User.findOne({ email: userSession.userId });
      const lastLocation = user?.location;
      if (
        lastLocation &&
        lastLocation.lat != null &&
        lastLocation.lng != null
      ) {
        userSession.logger.info(
          `Sending cached location to newly subscribed app ${message.packageName}`,
        );
        const appSessionId = `${userSession.userId}-${message.packageName}`;

        if (appWebsocket && appWebsocket.readyState === WebSocket.OPEN) {
          const locationUpdate: LocationUpdate = {
            type: GlassesToCloudMessageType.LOCATION_UPDATE,
            sessionId: appSessionId,
            lat: lastLocation.lat,
            lng: lastLocation.lng,
            timestamp: new Date(),
          };

          const dataStream: DataStream = {
            type: CloudToAppMessageType.DATA_STREAM,
            sessionId: appSessionId,
            streamType: StreamType.LOCATION_UPDATE,
            data: locationUpdate,
            timestamp: new Date(),
          };
          appWebsocket.send(JSON.stringify(dataStream));
        }
      }
    }

    // Send cached userDatetime if app just subscribed to custom_message
    const isNewCustomMessageSubscription = message.subscriptions.includes(
      StreamType.CUSTOM_MESSAGE as any,
    );

    if (isNewCustomMessageSubscription && userSession.userDatetime) {
      userSession.logger.info(
        `Sending cached userDatetime to app ${message.packageName} on custom_message subscription`,
      );
      if (appWebsocket && appWebsocket.readyState === WebSocket.OPEN) {
        const customMessage = {
          type: CloudToAppMessageType.CUSTOM_MESSAGE,
          action: "update_datetime",
          payload: {
            datetime: userSession.userDatetime,
            section: "topLeft",
          },
          timestamp: new Date(),
        };
        appWebsocket.send(JSON.stringify(customMessage));
      }
    }

    const clientResponse: AppStateChange = {
      type: CloudToGlassesMessageType.APP_STATE_CHANGE,
      sessionId: userSession.sessionId,
      userSession: await userSession.snapshotForClient(),
      timestamp: new Date(),
    };

    userSession.websocket.send(JSON.stringify(clientResponse));
  }

  /**
   * Check if an app has the CAMERA permission
   *
   * @param packageName App package name
   * @param userSession User session
   * @returns Promise<boolean> true if app has camera permission, false otherwise
   */
  private async checkCameraPermission(
    packageName: string,
    userSession: UserSession,
  ): Promise<boolean> {
    try {
      // Get app details
      const app = await App.findOne({ packageName });

      if (!app) {
        logger.warn(
          { packageName, userId: userSession.userId },
          "App not found when checking camera permissions",
        );
        return false;
      }

      // Check if app has camera permission
      return SimplePermissionChecker.hasPermission(app, PermissionType.CAMERA);
    } catch (error) {
      logger.error(
        { error, packageName, userId: userSession.userId },
        "Error checking camera permission",
      );
      return false;
    }
  }

  /**
   * Send an error response to the App client
   *
   * @param ws WebSocket connection
   * @param code Error code
   * @param message Error message
   */
  private sendError(ws: WebSocket, code: AppErrorCode, message: string): void {
    try {
      const errorResponse: AppConnectionError = {
        type: CloudToAppMessageType.CONNECTION_ERROR,
        code: code,
        message: message,
        timestamp: new Date(),
      };
      ws.send(JSON.stringify(errorResponse));
      // Close the connection with an appropriate code
      ws.close(1008, message);
    } catch (error) {
      logger.error("Failed to send error response", error);
      // Try to close the connection anyway
      try {
        ws.close(1011, "Internal server error");
      } catch (closeError) {
        logger.error("Failed to close WebSocket connection", closeError);
      }
    }
  }
}

export default AppWebSocketService;
