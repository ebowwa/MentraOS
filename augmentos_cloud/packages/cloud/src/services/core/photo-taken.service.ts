import { logger as rootLogger } from "../logging";
import { ExtendedUserSession } from "./session.service";
import { subscriptionService } from "./subscription.service";
import { StreamType } from "@augmentos/sdk/src/types/streams";
import { CloudToTpaMessageType } from "@augmentos/sdk/src/types/message-types";

const logger = rootLogger.child({ service: 'photo-taken.service' });

/**
 * Service for handling photo taken subscriptions and broadcasting
 */
class PhotoTakenService {
  /**
   * Broadcast a photo to all TPAs subscribed to PHOTO_TAKEN
   * @param userSession The user session
   * @param photoData The photo data as ArrayBuffer
   * @param mimeType The MIME type of the photo
   */
  broadcastPhotoTaken(userSession: ExtendedUserSession, photoData: ArrayBuffer, mimeType: string): void {
    // Get all TPAs subscribed to PHOTO_TAKEN
    const subscribedApps = subscriptionService.getSubscribedApps(userSession, 'photo_taken');

    if (subscribedApps.length === 0) {
      logger.debug(`No TPAs subscribed to PHOTO_TAKEN for user ${userSession.userId}`);
      return;
    }

    logger.info(`Broadcasting photo to ${subscribedApps.length} TPAs for user ${userSession.userId}`);

    // Create the photo taken message
    const message = {
      type: CloudToTpaMessageType.DATA_STREAM,
      streamType: 'photo_taken',
      data: {
        photoData,
        mimeType,
        timestamp: new Date()
      }
    };

    // Send to each subscribed TPA
    for (const packageName of subscribedApps) {
      const websocket = userSession.appConnections.get(packageName);
      if (websocket && websocket.readyState === 1) {
        websocket.send(JSON.stringify(message));
        logger.debug(`Sent photo to TPA ${packageName}`);
      } else {
        logger.warn(`TPA ${packageName} not connected or WebSocket not ready`);
      }
    }
  }
}

// Create and export a singleton instance
export const photoTakenService = new PhotoTakenService();
export default photoTakenService; 