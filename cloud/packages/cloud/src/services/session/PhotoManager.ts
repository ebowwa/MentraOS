/**
 * @fileoverview PhotoManager manages photo capture requests within a user session.
 * It adapts logic previously in a global photo-request.service.ts.
 */

import WebSocket from "ws";
import crypto from "crypto"; // Changed from uuidv4 to crypto.randomUUID for consistency
import {
  CloudToGlassesMessageType,
  CloudToAppMessageType,
  GlassesToCloudMessageType,
  PhotoResponse, // SDK type from Glasses
  PhotoRequest, // SDK type for App's request
  CloudToAppMessage,
  // Define AppPhotoResult in SDK or use a generic message structure
} from "@mentra/sdk";
import { Logger } from "pino";
import UserSession from "./UserSession";

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

    if (
      !this.userSession.websocket ||
      this.userSession.websocket.readyState !== WebSocket.OPEN
    ) {
      this.logger.error(
        "Glasses WebSocket not connected, cannot send photo request to glasses.",
      );
      throw new Error("Glasses WebSocket not connected.");
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
    const { requestId, photoUrl, savedToGallery } = glassesResponse; // `savedToGallery` from glasses confirms actual status
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
        glassesResponse,
      },
      "Photo response received from glasses.",
    );
    clearTimeout(pendingPhotoRequest.timeoutId);
    this.pendingPhotoRequests.delete(requestId);

    await this._sendPhotoResultToApp(pendingPhotoRequest, glassesResponse);
  }

  private _handlePhotoRequestTimeout(requestId: string): void {
    const requestInfo = this.pendingPhotoRequests.get(requestId);
    if (!requestInfo) return; // Already handled or cleared

    this.logger.warn(
      { requestId, packageName: requestInfo.packageName },
      "Photo request timed out.",
    );
    this.pendingPhotoRequests.delete(requestId); // Remove before sending error

    // this._sendPhotoResultToApp(requestInfo, {
    //   success: false,
    //   error: 'Photo request timed out waiting for glasses response.',
    //   savedToGallery: requestInfo.saveToGallery // Reflect intended, though failed
    // });
    // Instead of sending a result, we throw an error to the App.
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
    this.pendingPhotoRequests.forEach((requestInfo, requestId) => {
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
