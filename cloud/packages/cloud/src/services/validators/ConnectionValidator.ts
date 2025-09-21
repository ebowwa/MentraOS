/**
 * Centralized connection validation for hardware requests
 * Validates that both phone and glasses are connected before allowing hardware operations
 */

import { WebSocket } from "ws";
import UserSession from "../session/UserSession";
import { logger } from "../logging/pino-logger";

export interface ValidationResult {
  valid: boolean;
  error?: string;
  errorCode?: ConnectionErrorCode;
}

export enum ConnectionErrorCode {
  PHONE_DISCONNECTED = "PHONE_DISCONNECTED",
  GLASSES_DISCONNECTED = "GLASSES_DISCONNECTED",
  STALE_CONNECTION = "STALE_CONNECTION",
  WEBSOCKET_CLOSED = "WEBSOCKET_CLOSED",
}

export class ConnectionValidator {
  private static readonly STALE_CONNECTION_THRESHOLD_MS = 60000; // 1 minute

  // SAFETY FLAG: Set to true to enable validation, false to bypass all checks
  private static readonly VALIDATION_ENABLED = false; // TODO: Set to true when ready to go live

  /**
   * Validate connections for hardware requests (photo, display, audio)
   * Checks both phone WebSocket and glasses connection state
   */
  static validateForHardwareRequest(
    userSession: UserSession,
    requestType: "photo" | "display" | "audio" | "sensor",
  ): ValidationResult {
    // SAFETY BYPASS: Return success immediately if validation is disabled
    if (!ConnectionValidator.VALIDATION_ENABLED) {
      logger.debug(
        {
          userId: userSession.userId,
          requestType,
          bypassReason: "VALIDATION_ENABLED=false",
        },
        "Connection validation bypassed - returning success",
      );
      return { valid: true };
    }

    // Check phone WebSocket connection first
    if (!userSession.websocket) {
      logger.error(
        {
          userId: userSession.userId,
          requestType,
          error: "No WebSocket connection exists",
        },
        "Hardware request validation failed - no WebSocket",
      );

      return {
        valid: false,
        error: `Cannot process ${requestType} request - phone is not connected (no WebSocket)`,
        errorCode: ConnectionErrorCode.WEBSOCKET_CLOSED,
      };
    }

    if (userSession.websocket.readyState !== WebSocket.OPEN) {
      logger.error(
        {
          userId: userSession.userId,
          requestType,
          readyState: userSession.websocket.readyState,
          error: "WebSocket not open",
        },
        "Hardware request validation failed - WebSocket not open",
      );

      return {
        valid: false,
        error: `Cannot process ${requestType} request - phone WebSocket is not open (state: ${userSession.websocket.readyState})`,
        errorCode: ConnectionErrorCode.WEBSOCKET_CLOSED,
      };
    }

    // Check if phone connection is alive (based on ping/pong)
    if (!userSession.phoneConnected) {
      logger.error(
        {
          userId: userSession.userId,
          requestType,
          error: "Phone not responding to pings",
        },
        "Hardware request validation failed - phone not connected",
      );

      return {
        valid: false,
        error: `Cannot process ${requestType} request - phone is not responding (ping/pong timeout)`,
        errorCode: ConnectionErrorCode.PHONE_DISCONNECTED,
      };
    }

    // Check glasses connection state
    if (!userSession.glassesConnected) {
      logger.error(
        {
          userId: userSession.userId,
          requestType,
          glassesModel: userSession.glassesModel,
          lastUpdate: userSession.lastGlassesStatusUpdate,
          error: "Glasses not connected",
        },
        "Hardware request validation failed - glasses not connected",
      );

      return {
        valid: false,
        error: `Cannot process ${requestType} request - smart glasses are not connected`,
        errorCode: ConnectionErrorCode.GLASSES_DISCONNECTED,
      };
    }

    // Optional: Check if connection state is stale
    if (userSession.lastGlassesStatusUpdate) {
      const ageMs = Date.now() - userSession.lastGlassesStatusUpdate.getTime();
      if (ageMs > ConnectionValidator.STALE_CONNECTION_THRESHOLD_MS) {
        logger.warn(
          {
            userId: userSession.userId,
            requestType,
            ageMs,
            lastUpdate: userSession.lastGlassesStatusUpdate,
          },
          "Glasses connection state may be stale",
        );

        // Note: We log a warning but don't fail the request
        // This could be changed to return an error if stricter validation is needed
      }
    }

    // All checks passed
    logger.debug(
      {
        userId: userSession.userId,
        requestType,
        glassesModel: userSession.glassesModel,
      },
      "Hardware request validation successful",
    );

    return { valid: true };
  }

  /**
   * Check if only phone is connected (glasses not required)
   * Used for operations that only need phone connection
   */
  static validatePhoneConnection(userSession: UserSession): ValidationResult {
    // SAFETY BYPASS: Return success immediately if validation is disabled
    if (!ConnectionValidator.VALIDATION_ENABLED) {
      logger.debug(
        {
          userId: userSession.userId,
          bypassReason: "VALIDATION_ENABLED=false",
        },
        "Phone connection validation bypassed - returning success",
      );
      return { valid: true };
    }

    if (
      !userSession.websocket ||
      userSession.websocket.readyState !== WebSocket.OPEN
    ) {
      return {
        valid: false,
        error: "Phone is not connected",
        errorCode: ConnectionErrorCode.PHONE_DISCONNECTED,
      };
    }

    if (!userSession.phoneConnected) {
      return {
        valid: false,
        error: "Phone is not responding (ping/pong timeout)",
        errorCode: ConnectionErrorCode.PHONE_DISCONNECTED,
      };
    }

    return { valid: true };
  }

  /**
   * Get a human-readable connection status summary
   */
  static getConnectionStatus(userSession: UserSession): string {
    const parts: string[] = [];

    if (!userSession.websocket) {
      parts.push("No WebSocket");
    } else if (userSession.websocket.readyState !== WebSocket.OPEN) {
      parts.push(`WebSocket state: ${userSession.websocket.readyState}`);
    } else {
      parts.push("WebSocket: OPEN");
    }

    parts.push(
      `Phone: ${userSession.phoneConnected ? "Connected" : "Disconnected"}`,
    );
    parts.push(
      `Glasses: ${userSession.glassesConnected ? "Connected" : "Disconnected"}`,
    );

    if (userSession.glassesModel) {
      parts.push(`Model: ${userSession.glassesModel}`);
    }

    return parts.join(", ");
  }
}
