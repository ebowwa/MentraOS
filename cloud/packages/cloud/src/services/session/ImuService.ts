import {
  StreamType,
  CloudToGlassesMessageType,
  ImuSingleRequest,
  ImuStreamStart,
  ImuStreamStop,
  ImuGestureSubscribe,
  ImuGestureUnsubscribe,
} from "@mentra/sdk";
import { Logger } from "pino";
import UserSession from "./UserSession";
import { UserI } from "../../models/user.model";
import { WebSocket } from "ws";

const logger = Logger({ name: "ImuService" });

/**
 * Singleton service that manages IMU subscriptions and commands to glasses
 * Follows the same pattern as LocationService for architectural consistency
 */
class ImuService {
  /**
   * Handle subscription changes for IMU streams
   * Called when apps subscribe/unsubscribe from IMU data or gestures
   *
   * This method is NOT async and does NOT await operations to match LocationService pattern
   */
  public handleSubscriptionChange(user: UserI, userSession: UserSession): void {
    const { userId } = userSession;

    // Get current IMU subscriptions across all apps
    const imuDataSubscribers =
      userSession.subscriptionManager.getSubscribedApps(StreamType.IMU_DATA);
    const imuGestureSubscribers =
      userSession.subscriptionManager.getSubscribedApps(StreamType.IMU_GESTURE);

    logger.info(
      {
        userId,
        imuDataSubscribers: imuDataSubscribers.length,
        imuGestureSubscribers: imuGestureSubscribers.length,
        apps: [...imuDataSubscribers, ...imuGestureSubscribers],
      },
      "Processing IMU subscription changes",
    );

    // Check WebSocket availability
    if (
      !userSession?.websocket ||
      userSession.websocket.readyState !== WebSocket.OPEN
    ) {
      logger.warn(
        { userId },
        "User session or WebSocket not available to send IMU commands.",
      );
      return;
    }

    // Handle gesture subscriptions
    if (imuGestureSubscribers.length > 0) {
      logger.info(
        { userId, subscribers: imuGestureSubscribers },
        "Apps subscribed to IMU gestures - enabling gesture detection on glasses",
      );

      this._sendGestureSubscriptionCommand(userSession.websocket, [
        "head_up",
        "head_down",
        "nod_yes",
        "shake_no",
      ]);
    } else {
      logger.info(
        { userId },
        "No apps subscribed to IMU gestures - disabling gesture detection on glasses",
      );

      this._sendGestureUnsubscribeCommand(userSession.websocket);
    }

    // Handle data stream subscriptions
    if (imuDataSubscribers.length > 0) {
      logger.info(
        { userId, subscribers: imuDataSubscribers },
        "Apps subscribed to IMU data - starting data stream on glasses",
      );

      this._sendStreamStartCommand(
        userSession.websocket,
        50, // 50Hz sampling rate
        100, // 100ms batching
      );
    } else {
      logger.info(
        { userId },
        "No apps subscribed to IMU data - stopping data stream on glasses",
      );

      this._sendStreamStopCommand(userSession.websocket);
    }
  }

  /**
   * Send gesture subscription command to glasses
   */
  private _sendGestureSubscriptionCommand(
    websocket: WebSocket,
    gestures: string[],
  ): void {
    try {
      const message: ImuGestureSubscribe = {
        type: CloudToGlassesMessageType.IMU_SUBSCRIBE_GESTURE,
        gestures,
        timestamp: new Date(),
      };

      websocket.send(JSON.stringify(message));
      logger.debug(
        { gestures },
        "Sent IMU gesture subscription command to glasses",
      );
    } catch (error) {
      logger.error(
        { error, gestures },
        "Failed to send IMU gesture subscription command",
      );
    }
  }

  /**
   * Send gesture unsubscribe command to glasses
   */
  private _sendGestureUnsubscribeCommand(websocket: WebSocket): void {
    try {
      const message: ImuGestureUnsubscribe = {
        type: CloudToGlassesMessageType.IMU_UNSUBSCRIBE_GESTURE,
        timestamp: new Date(),
      };

      websocket.send(JSON.stringify(message));
      logger.debug("Sent IMU gesture unsubscribe command to glasses");
    } catch (error) {
      logger.error({ error }, "Failed to send IMU gesture unsubscribe command");
    }
  }

  /**
   * Send stream start command to glasses
   */
  private _sendStreamStartCommand(
    websocket: WebSocket,
    rateHz: number,
    batchMs: number,
  ): void {
    try {
      const message: ImuStreamStart = {
        type: CloudToGlassesMessageType.IMU_STREAM_START,
        rate_hz: rateHz,
        batch_ms: batchMs,
        timestamp: new Date(),
      };

      websocket.send(JSON.stringify(message));
      logger.debug(
        { rateHz, batchMs },
        "Sent IMU stream start command to glasses",
      );
    } catch (error) {
      logger.error(
        { error, rateHz, batchMs },
        "Failed to send IMU stream start command",
      );
    }
  }

  /**
   * Send stream stop command to glasses
   */
  private _sendStreamStopCommand(websocket: WebSocket): void {
    try {
      const message: ImuStreamStop = {
        type: CloudToGlassesMessageType.IMU_STREAM_STOP,
        timestamp: new Date(),
      };

      websocket.send(JSON.stringify(message));
      logger.debug("Sent IMU stream stop command to glasses");
    } catch (error) {
      logger.error({ error }, "Failed to send IMU stream stop command");
    }
  }

  /**
   * Send single IMU reading request to glasses
   * Called when an app needs a one-time IMU reading
   */
  public sendSingleReadingRequest(userSession: UserSession): void {
    if (
      !userSession?.websocket ||
      userSession.websocket.readyState !== WebSocket.OPEN
    ) {
      logger.warn(
        { userId: userSession.userId },
        "Cannot send IMU single request - WebSocket not available",
      );
      return;
    }

    try {
      const message: ImuSingleRequest = {
        type: CloudToGlassesMessageType.IMU_SINGLE,
        timestamp: new Date(),
      };

      userSession.websocket.send(JSON.stringify(message));
      logger.debug(
        { userId: userSession.userId },
        "Sent IMU single reading request to glasses",
      );
    } catch (error) {
      logger.error(
        { error, userId: userSession.userId },
        "Failed to send IMU single reading request",
      );
    }
  }
}

// Export singleton instance following LocationService pattern
export const imuService = new ImuService();
