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
  PhotoStage,
  // Define AppPhotoResult in SDK or use a generic message structure
} from "@mentra/sdk";
import { Logger } from "pino";
import UserSession from "./UserSession";
import { ConnectionValidator } from "../validators/ConnectionValidator";

const PHOTO_REQUEST_TIMEOUT_MS_DEFAULT = 30000; // Default timeout for photo requests

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
  timeoutId: NodeJS.Timeout;
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
    } = appRequest;

    this.logger.info(
      {
        packageName,
        requestId,
        saveToGallery,
        size,
        hasCustomWebhook: !!customWebhookUrl,
        hasAuthToken: !!authToken,
      },
      "Processing App photo request.",
    );

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
      timeoutId: setTimeout(
        () => this._handlePhotoRequestTimeout(requestId),
        PHOTO_REQUEST_TIMEOUT_MS_DEFAULT,
      ),
    };
    this.pendingPhotoRequests.set(requestId, requestInfo);

    // Message to glasses based on CloudToGlassesMessageType.PHOTO_REQUEST
    // Include webhook URL so ASG can upload directly to the app
    const messageToGlasses = {
      type: CloudToGlassesMessageType.PHOTO_REQUEST,
      sessionId: this.userSession.sessionId,
      requestId,
      appId: packageName, // Glasses expect `appId`
      webhookUrl, // Use custom webhookUrl if provided, otherwise default
      authToken, // Include authToken for webhook authentication
      size, // Propagate desired size
      timestamp: new Date(),
    };

    try {
      this.userSession.websocket.send(JSON.stringify(messageToGlasses));
      this.logger.info(
        {
          requestId,
          packageName,
          webhookUrl,
          isCustom: !!customWebhookUrl,
          hasAuthToken: !!authToken,
        },
        "PHOTO_REQUEST command sent to glasses with webhook URL.",
      );

      // If using custom webhook URL, resolve immediately since glasses won't send response back to cloud
      if (customWebhookUrl) {
        this.logger.info(
          { requestId },
          "Using custom webhook URL - resolving promise immediately since glasses will upload directly to custom endpoint.",
        );
        clearTimeout(requestInfo.timeoutId);
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
      clearTimeout(requestInfo.timeoutId);
      this.pendingPhotoRequests.delete(requestId);
      throw error;
    }
    return requestId;
  }

  /**
   * Handles a photo response from glasses.
   * Adapts logic from photoRequestService.processPhotoResponse.
   */
  async handlePhotoResponse(glassesResponse: PhotoResponse): Promise<void> {
    const { requestId, success } = glassesResponse;
    const pendingPhotoRequest = this.pendingPhotoRequests.get(requestId);

    if (!pendingPhotoRequest) {
      this.logger.warn(
        { requestId, glassesResponse },
        "Received photo response for unknown, timed-out, or already processed request.",
      );
      return;
    }

    this.logger.info(
      {
        requestId,
        packageName: pendingPhotoRequest.packageName,
        success,
        hasError: !success && !!glassesResponse.error,
        errorCode: glassesResponse.error?.code,
      },
      "Photo response received from glasses.",
    );
    clearTimeout(pendingPhotoRequest.timeoutId);
    this.pendingPhotoRequests.delete(requestId);

    if (success) {
      // Handle success response
      await this._sendPhotoResultToApp(pendingPhotoRequest, glassesResponse);
    } else {
      // Handle error response
      await this._sendPhotoErrorToApp(pendingPhotoRequest, glassesResponse);
    }
  }

  private _handlePhotoRequestTimeout(requestId: string): void {
    const requestInfo = this.pendingPhotoRequests.get(requestId);
    if (!requestInfo) return; // Already handled or cleared

    this.logger.warn(
      {
        requestId,
        packageName: requestInfo.packageName,
        timeoutMs: PHOTO_REQUEST_TIMEOUT_MS_DEFAULT,
        connectionStatus: ConnectionValidator.getConnectionStatus(
          this.userSession,
        ),
      },
      "Photo request timed out - sending error response to app",
    );
    this.pendingPhotoRequests.delete(requestId); // Remove before sending error

    // Create timeout error response
    const timeoutErrorResponse: PhotoResponse = {
      type: GlassesToCloudMessageType.PHOTO_RESPONSE,
      requestId,
      success: false,
      error: {
        code: PhotoErrorCode.UPLOAD_TIMEOUT,
        message:
          "Photo request timed out after 30 seconds. Check glasses connection and camera status.",
        details: {
          stage: PhotoStage.RESPONSE_SENT,
          retryable: true,
          suggestedAction: "Check glasses connection and try again",
          diagnosticInfo: {
            timestamp: Date.now(),
            duration: PHOTO_REQUEST_TIMEOUT_MS_DEFAULT,
            retryCount: 0,
          },
        },
      },
      timestamp: new Date(),
    };

    // Send error response to app
    this._sendPhotoErrorToApp(requestInfo, timeoutErrorResponse);
  }

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

      if (result.sent) {
        this.logger.info(
          {
            requestId,
            packageName,
            resurrectionTriggered: result.resurrectionTriggered,
          },
          `Sent photo result to App ${packageName}${result.resurrectionTriggered ? " after resurrection" : ""}`,
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
    this.pendingPhotoRequests.forEach((requestInfo, _requestId) => {
      clearTimeout(requestInfo.timeoutId);
      // TODO(isaiah): We should extend the photo result to support error, so dev's can more gracefully handle failed photo requets.
      // this._sendPhotoResultToApp(requestInfo, {
      //   error: 'User session ended; photo request cancelled.',
      //   savedToGallery: requestInfo.saveToGallery
      // });
    });
    this.pendingPhotoRequests.clear();
  }
}

export default PhotoManager;
