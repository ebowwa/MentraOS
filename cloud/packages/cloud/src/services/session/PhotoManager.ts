/**
 * @fileoverview PhotoManager manages photo capture requests within a user session.
 * It adapts logic previously in a global photo-request.service.ts.
 */

import {
  CloudToGlassesMessageType,
  GlassesToCloudMessageType,
  PhotoResponse, // SDK type from Glasses
  PhotoRequest, // SDK type for App's request
  PhotoErrorCode,
  // Define AppPhotoResult in SDK or use a generic message structure
} from "@mentra/sdk";
import { Logger } from "pino";
import UserSession from "./UserSession";
import { ConnectionValidator } from "../validators/ConnectionValidator";

// Timeout handling is managed by CameraModule in the SDK

/**
 * Internal representation of a pending photo request,
 * adapted from PendingPhotoRequest in photo-request.service.ts.
 */
interface PendingPhotoRequest {
  requestId: string;
  userId: string; // From UserSession
  timestamp: number;
  // origin: 'app'; // All requests via PhotoManager are App initiated for now
  packageName: string; // Renamed from appId for consistency with App messages
  saveToGallery: boolean;
}

/**
 * Defines the structure of the photo result message sent to the App.
 * This should align with an SDK type (e.g., CloudToAppMessageType.PHOTO_RESULT_DATA).
 */
// export interface AppPhotoResultPayload { // This is the payload part
//   requestId: string;
//   success: boolean;
//   photoUrl?: string;
//   error?: string;
//   savedToGallery?: boolean;
//   // metadata from glasses if available?
// }

export class PhotoManager {
  private userSession: UserSession;
  private logger: Logger;
  private pendingPhotoRequests: Map<string, PendingPhotoRequest> = new Map(); // requestId -> info

  constructor(userSession: UserSession) {
    this.userSession = userSession;
    this.logger = userSession.logger.child({ service: "PhotoManager" });
    this.logger.info("PhotoManager initialized");
  }

  /**
   * Handles a App's request to take a photo.
   * Adapts logic from photoRequestService.createAppPhotoRequest.
   */
  async requestPhoto(appRequest: PhotoRequest): Promise<string> {
    const {
      packageName,
      requestId,
      saveToGallery = false,
      customWebhookUrl,
      authToken,
      size = "medium",
      timingMetadata = {},
    } = appRequest;

    // 📍 CP03: PhotoManager Processing
    const cp03Time = Date.now();
    this.logger.info(
      {
        checkpointId: "CP03",
        packageName,
        requestId,
        timestamp: cp03Time,
        phase: "photomanager_processing",
        saveToGallery,
        size,
        hasCustomWebhook: !!customWebhookUrl,
        hasAuthToken: !!authToken,
      },
      "📍 CP03: PhotoManager processing photo request",
    );

    // Store timing
    const metadata = timingMetadata || {};
    metadata.cp03_photomanager_start = cp03Time;

    // Get the webhook URL - use custom if provided, otherwise fall back to app's default
    let webhookUrl: string | undefined;
    if (customWebhookUrl) {
      webhookUrl = customWebhookUrl;
      this.logger.info(
        { requestId, customWebhookUrl, hasAuthToken: !!authToken },
        "Using custom webhook URL for photo request.",
      );
    } else {
      const app = this.userSession.installedApps.get(packageName);
      webhookUrl = app?.publicUrl ? `${app.publicUrl}/photo-upload` : undefined;
      this.logger.info(
        { requestId, defaultWebhookUrl: webhookUrl },
        "Using default webhook URL for photo request.",
      );
    }

    // Validate connections before processing photo request
    const validation = ConnectionValidator.validateForHardwareRequest(
      this.userSession,
      "photo",
    );

    if (!validation.valid) {
      this.logger.error(
        {
          error: validation.error,
          errorCode: validation.errorCode,
          connectionStatus: ConnectionValidator.getConnectionStatus(
            this.userSession,
          ),
        },
        "Photo request validation failed",
      );

      throw new Error(validation.error || "Connection validation failed");
    }

    const requestInfo: PendingPhotoRequest = {
      requestId,
      userId: this.userSession.userId,
      timestamp: Date.now(),
      packageName,
      saveToGallery,
    };
    this.pendingPhotoRequests.set(requestId, requestInfo);

    // Message to glasses based on CloudToGlassesMessageType.PHOTO_REQUEST
    // Include webhook URL so ASG can upload directly to the app
    const metadata = timingMetadata || {};
    const messageToGlasses = {
      type: CloudToGlassesMessageType.PHOTO_REQUEST,
      sessionId: this.userSession.sessionId,
      requestId,
      appId: packageName, // Glasses expect `appId`
      webhookUrl, // Use custom webhookUrl if provided, otherwise default
      authToken, // Include authToken for webhook authentication
      size, // Propagate desired size
      timestamp: new Date(),
      timingMetadata: metadata, // Propagate timing metadata
    };

    try {
      this.userSession.websocket.send(JSON.stringify(messageToGlasses));

      // 📍 CP04: Request Sent to Glasses
      const cp04Time = Date.now();
      metadata.cp04_sent_to_glasses = cp04Time;

      this.logger.info(
        {
          checkpointId: "CP04",
          requestId,
          timestamp: cp04Time,
          phase: "sent_to_glasses",
          packageName,
          webhookUrl,
          isCustom: !!customWebhookUrl,
          hasAuthToken: !!authToken,
        },
        "📍 CP04: PHOTO_REQUEST sent to glasses",
      );

      // If using custom webhook URL, resolve immediately since glasses won't send response back to cloud
      if (customWebhookUrl) {
        this.logger.info(
          { requestId },
          "Using custom webhook URL - resolving promise immediately since glasses will upload directly to custom endpoint.",
        );
        this.pendingPhotoRequests.delete(requestId);

        // Send a success response to the app immediately
        await this._sendPhotoResultToApp(requestInfo, {
          type: GlassesToCloudMessageType.PHOTO_RESPONSE,
          requestId,
          success: true,
          photoUrl: customWebhookUrl, // Use the custom webhook URL as the photo URL
          savedToGallery: saveToGallery,
          timestamp: new Date(),
        });
      }
    } catch (error) {
      this.logger.error(
        { error, requestId },
        "Failed to send PHOTO_REQUEST to glasses.",
      );
      this.pendingPhotoRequests.delete(requestId);
      throw error;
    }
    return requestId;
  }

  /**
   * Handles a photo response from glasses.
   * Adapts logic from photoRequestService.processPhotoResponse.
   */
  async handlePhotoResponse(
    glassesResponse: PhotoResponse | any,
  ): Promise<void> {
    // 📍 CP16: Cloud Receives Photo Response
    const cp16Time = Date.now();

    // Handle simplified error format from glasses/phone
    let normalizedResponse: PhotoResponse;

    if (glassesResponse.errorCode && glassesResponse.errorMessage) {
      // Convert simplified format to expected PhotoResponse format
      normalizedResponse = {
        type: GlassesToCloudMessageType.PHOTO_RESPONSE,
        requestId: glassesResponse.requestId,
        success: glassesResponse.success || false,
        error: {
          code: glassesResponse.errorCode as PhotoErrorCode,
          message: glassesResponse.errorMessage,
        },
      };
    } else {
      // Use as-is if already in expected format
      normalizedResponse = glassesResponse as PhotoResponse;
    }

    const { requestId, success } = normalizedResponse;
    const pendingPhotoRequest = this.pendingPhotoRequests.get(requestId);

    this.logger.info(
      {
        checkpointId: "CP16",
        requestId,
        timestamp: cp16Time,
        phase: "cloud_received_response",
        success,
      },
      `📍 CP16: Cloud received photo response`,
    );

    this.logger.debug(
      {
        pendingPhotoRequests: Array.from(this.pendingPhotoRequests.keys()),
        glassesResponse,
        success,
        requestId,
      },
      "Photo response processing debug info",
    );

    if (!pendingPhotoRequest) {
      this.logger.warn(
        { requestId, glassesResponse: normalizedResponse },
        "Received photo response for unknown, timed-out, or already processed request.",
      );
      return;
    }

    this.logger.info(
      {
        requestId,
        packageName: pendingPhotoRequest.packageName,
        success,
        hasError: !success && !!normalizedResponse.error,
        errorCode: normalizedResponse.error?.code,
      },
      "Photo response received from glasses.",
    );
    this.pendingPhotoRequests.delete(requestId);

    if (success) {
      // Handle success response
      await this._sendPhotoResultToApp(pendingPhotoRequest, normalizedResponse);
    } else {
      // Handle error response
      await this._sendPhotoErrorToApp(pendingPhotoRequest, normalizedResponse);
    }
  }

  // Timeout handling removed - now managed by CameraModule in the SDK

  private async _sendPhotoErrorToApp(
    pendingPhotoRequest: PendingPhotoRequest,
    errorResponse: PhotoResponse,
  ): Promise<void> {
    const { requestId, packageName } = pendingPhotoRequest;

    try {
      // Use centralized messaging with automatic resurrection
      const result = await this.userSession.appManager.sendMessageToApp(
        packageName,
        errorResponse,
      );

      if (result.sent) {
        this.logger.info(
          {
            requestId,
            packageName,
            errorCode: errorResponse.error?.code,
            resurrectionTriggered: result.resurrectionTriggered,
          },
          `Sent photo error to App ${packageName}${result.resurrectionTriggered ? " after resurrection" : ""}`,
        );
      } else {
        this.logger.warn(
          {
            requestId,
            packageName,
            errorCode: errorResponse.error?.code,
            resurrectionTriggered: result.resurrectionTriggered,
            error: result.error,
          },
          `Failed to send photo error to App ${packageName}`,
        );
      }
    } catch (error) {
      this.logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          requestId,
          packageName,
          errorCode: errorResponse.error?.code,
        },
        `Error sending photo error to App ${packageName}`,
      );
    }
  }

  private async _sendPhotoResultToApp(
    pendingPhotoRequest: PendingPhotoRequest,
    photoResponse: PhotoResponse,
  ): Promise<void> {
    const { requestId, packageName } = pendingPhotoRequest;

    try {
      // Use centralized messaging with automatic resurrection
      const result = await this.userSession.appManager.sendMessageToApp(
        packageName,
        photoResponse,
      );

      // 📍 CP17: Response Sent to App
      const cp17Time = Date.now();

      if (result.sent) {
        this.logger.info(
          {
            checkpointId: "CP17",
            requestId,
            timestamp: cp17Time,
            phase: "response_sent_to_app",
            packageName,
            resurrectionTriggered: result.resurrectionTriggered,
          },
          `📍 CP17: Photo result sent to App ${packageName}${result.resurrectionTriggered ? " after resurrection" : ""}`,
        );
      } else {
        this.logger.warn(
          {
            requestId,
            packageName,
            resurrectionTriggered: result.resurrectionTriggered,
            error: result.error,
          },
          `Failed to send photo result to App ${packageName}`,
        );
      }
    } catch (error) {
      this.logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          requestId,
          packageName,
        },
        `Error sending photo result to App ${packageName}`,
      );
    }
  }

  /**
   * Called when the UserSession is ending.
   */
  dispose(): void {
    this.logger.info(
      "Disposing PhotoManager, cancelling pending photo requests for this session.",
    );
    // Timeout handling removed - CameraModule manages timeouts
    this.pendingPhotoRequests.clear();
  }
}

export default PhotoManager;
