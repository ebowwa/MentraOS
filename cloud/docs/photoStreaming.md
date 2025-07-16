# Photo Streaming Implementation Plan

## Overview

This document outlines the implementation plan for adding continuous photo streaming capabilities to MentraOS. The feature allows apps to subscribe to continuous photo streams with configurable frequencies, similar to how location streaming works but with key differences in how photos are delivered.

## Key Requirements

1. **Apps can subscribe to continuous photo streams** with `preferredFrequencyInSeconds` (minimum 2 seconds)
2. **ASG client takes photos at the minimum frequency** of all active subscriptions
3. **Photos are distributed to apps** based on their individual subscription frequencies
4. **Direct upload optimization**: If only one subscriber exists, photos are sent directly to that app
5. **Smart polling**: When `requestPhoto()` is called, return a cached photo if taken within 1.9 seconds
6. **HTTP POST delivery**: Photos are delivered via HTTP POST to `/photo-upload` endpoints, not WebSocket messages

## Architecture Overview

### Data Flow

```
Multiple Subscribers:
App1 (2s) ─┐
App2 (10s) ─┼─► Cloud calculates effective frequency (2s) ─► ASG takes photos every 2s
App3 (5s)  ─┘                                                    │
                                                                 ▼
                                                    Cloud distributes based on timing:
                                                    - App1: every photo (2s)
                                                    - App2: every 5th photo (10s)
                                                    - App3: every 2 photos (5s / 2s, rounded down)

Single Subscriber:
App1 (5s) ─► Cloud sends direct upload URL ─► ASG uploads directly to App1 every 5s
```

## Implementation Details

### 1. SDK Types & Interfaces

**File**: `cloud/packages/sdk/src/types/streams.ts`

```typescript
// Add to existing StreamType enum
export enum StreamType {
  // ... existing types ...
  PHOTO_STREAM = "photo_stream",
  PHOTO_UPDATE = "photo_update",
}

// New interfaces for photo streaming
export interface PhotoStreamRequest {
  stream: "photo_stream";
  preferredFrequencyInSeconds: number; // minimum 2 seconds
}

export interface PhotoStreamUpdate {
  type: StreamType.PHOTO_UPDATE;
  requestId: string;
  timestamp: Date;
  // Note: No photoUrl here - photo is delivered via HTTP POST
}
```

**File**: `cloud/packages/sdk/src/types/messages.ts`

```typescript
// Add new message types
export enum CloudToGlassesMessageType {
  // ... existing types ...
  SET_PHOTO_FREQUENCY = "SET_PHOTO_FREQUENCY",
  PHOTO_STREAM_UPDATE = "PHOTO_STREAM_UPDATE",
}

export interface SetPhotoFrequency {
  type: CloudToGlassesMessageType.SET_PHOTO_FREQUENCY;
  sessionId: string;
  frequencyInSeconds: number;
  webhookUrls?: string[]; // For direct upload when single subscriber
  timestamp: Date;
}

export interface PhotoStreamUpdateFromGlasses {
  type: GlassesToCloudMessageType.PHOTO_STREAM_UPDATE;
  sessionId: string;
  requestId: string;
  timestamp: Date;
}
```

### 2. SDK Camera Module Updates

**File**: `cloud/packages/sdk/src/app/session/modules/camera.ts`

Add these methods to the `CameraModule` class:

```typescript
// Photo streaming functionality
private photoStreamCleanupHandler?: () => void;
private lastPhotoTimestamp?: Date;
private cachedPhotoData?: PhotoData;

/**
 * Subscribe to continuous photo stream
 * @param options Streaming configuration
 * @param handler Callback when photos are received
 * @returns Cleanup function to unsubscribe
 */
public subscribeToPhotoStream(
  options: { preferredFrequencyInSeconds: number },
  handler: (data: PhotoData) => void
): () => void {
  // Validate frequency
  if (options.preferredFrequencyInSeconds < 2) {
    throw new Error('Minimum photo frequency is 2 seconds');
  }

  const subscription: PhotoStreamRequest = {
    stream: 'photo_stream',
    preferredFrequencyInSeconds: options.preferredFrequencyInSeconds
  };

  this.session.subscribe(subscription);

  // Set up handler for photo updates
  this.photoStreamCleanupHandler = this.session.events.on('photo_update', (update: PhotoStreamUpdate) => {
    // Photo will arrive via HTTP POST to /photo-upload
    // The update just notifies that a photo is coming
    this.logger.debug({ requestId: update.requestId }, '📸 Photo stream update received');
  });

  // Also listen for actual photo data
  const photoHandler = this.session.events.onPhoto(handler);

  return () => {
    this.unsubscribeFromPhotoStream();
    photoHandler();
  };
}

/**
 * Unsubscribe from photo stream
 */
public unsubscribeFromPhotoStream(): void {
  if (this.photoStreamCleanupHandler) {
    this.photoStreamCleanupHandler();
    this.photoStreamCleanupHandler = undefined;
  }
  this.session.unsubscribe('photo_stream');
}

/**
 * Override requestPhoto to check cache first
 */
async requestPhoto(options?: PhotoRequestOptions): Promise<PhotoData> {
  // Check if we have a recent cached photo (within 1.9 seconds)
  if (this.cachedPhotoData && this.lastPhotoTimestamp) {
    const age = Date.now() - this.lastPhotoTimestamp.getTime();
    if (age < 1900) { // 1.9 seconds in milliseconds
      this.logger.info({ age }, '📸 Returning cached photo from stream');
      return this.cachedPhotoData;
    }
  }

  // No recent cache, proceed with normal photo request
  return this._requestPhotoInternal(options);
}

/**
 * Internal method to handle photo received (called by AppSession)
 */
handlePhotoReceived(photoData: PhotoData): void {
  // Update cache for streaming
  this.lastPhotoTimestamp = new Date();
  this.cachedPhotoData = photoData;

  // Handle regular photo requests
  const { requestId } = photoData;
  const pendingRequest = this.pendingPhotoRequests.get(requestId);
  // ... existing logic ...
}
```

### 3. Cloud Photo Stream Service

**File**: `cloud/packages/cloud/src/services/core/photo-stream.service.ts`

Create a new service similar to `location.service.ts`:

```typescript
import { User, UserI } from "../../models/user.model";
import { sessionService } from "../session/session.service";
import UserSession from "../session/UserSession";
import { logger as rootLogger } from "../logging/pino-logger";
import WebSocket from "ws";
import {
  CloudToGlassesMessageType,
  SetPhotoFrequency,
  PhotoStreamUpdateFromGlasses,
  CloudToAppMessageType,
  DataStream,
  StreamType,
} from "@mentra/sdk";

const logger = rootLogger.child({ service: "photo-stream.service" });

interface PhotoDistributionTracker {
  packageName: string;
  preferredFrequencyInSeconds: number;
  lastSentTimestamp: number;
  webhookUrl?: string;
}

class PhotoStreamService {
  // Track distribution timing per user
  private userDistributionTrackers = new Map<
    string,
    Map<string, PhotoDistributionTracker>
  >();

  // Track last photo timestamp per user for caching
  private lastPhotoCache = new Map<
    string,
    { timestamp: number; requestId: string }
  >();

  /**
   * Handle subscription changes for photo streaming
   */
  public async handleSubscriptionChange(
    user: UserI,
    userSession: UserSession,
  ): Promise<void> {
    const { userId } = userSession;

    const previousEffectiveFrequency = user.effectivePhotoFrequency || 0;
    const newEffectiveFrequency =
      this._calculateEffectiveFrequencyForUser(user);

    if (newEffectiveFrequency !== previousEffectiveFrequency) {
      logger.info(
        {
          userId,
          oldFrequency: previousEffectiveFrequency,
          newFrequency: newEffectiveFrequency,
        },
        "Effective photo frequency has changed",
      );

      // Update user model
      user.effectivePhotoFrequency = newEffectiveFrequency;

      try {
        await user.save();

        // Update distribution trackers
        this._updateDistributionTrackers(userId, user);

        // Send command to device
        if (
          userSession?.websocket &&
          userSession.websocket.readyState === WebSocket.OPEN
        ) {
          this._sendFrequencyCommand(userSession, newEffectiveFrequency);
        }
      } catch (error) {
        logger.error(
          { userId, error },
          "Failed to save new effective photo frequency",
        );
      }
    }
  }

  /**
   * Handle incoming photo stream update from glasses
   */
  public async handlePhotoStreamUpdate(
    userSession: UserSession,
    update: PhotoStreamUpdateFromGlasses,
  ): Promise<void> {
    const { userId } = userSession;
    const { requestId, timestamp } = update;

    // Update cache
    this.lastPhotoCache.set(userId, {
      timestamp: new Date(timestamp).getTime(),
      requestId,
    });

    // Get distribution trackers for this user
    const trackers = this.userDistributionTrackers.get(userId);
    if (!trackers || trackers.size === 0) {
      logger.warn(
        { userId },
        "Received photo update but no active subscriptions",
      );
      return;
    }

    const now = Date.now();
    const appsToNotify: PhotoDistributionTracker[] = [];

    // Check which apps should receive this photo based on their frequency
    for (const tracker of trackers.values()) {
      const timeSinceLastSent = (now - tracker.lastSentTimestamp) / 1000; // Convert to seconds

      if (timeSinceLastSent >= tracker.preferredFrequencyInSeconds) {
        appsToNotify.push(tracker);
        tracker.lastSentTimestamp = now;
      }
    }

    // If only one subscriber and has webhook URL, ASG should upload directly
    // Otherwise, notify apps that a photo is available
    if (trackers.size === 1 && appsToNotify.length === 1) {
      logger.info(
        { userId, packageName: appsToNotify[0].packageName },
        "Single subscriber - photo should be uploaded directly by ASG",
      );
    } else {
      // Notify each app that should receive this photo
      for (const tracker of appsToNotify) {
        this._notifyAppOfPhoto(userSession, tracker.packageName, requestId);
      }
    }
  }

  /**
   * Check if a recent photo exists in cache
   */
  public hasRecentPhoto(userId: string, maxAgeMs: number = 1900): boolean {
    const cached = this.lastPhotoCache.get(userId);
    if (!cached) return false;

    const age = Date.now() - cached.timestamp;
    return age <= maxAgeMs;
  }

  /**
   * Get cached photo info if available
   */
  public getCachedPhotoInfo(
    userId: string,
  ): { requestId: string; timestamp: number } | null {
    return this.lastPhotoCache.get(userId) || null;
  }

  /**
   * Calculate minimum frequency from all subscriptions
   */
  private _calculateEffectiveFrequencyForUser(user: UserI): number {
    const subscriptions = user.photoSubscriptions;

    if (!subscriptions || subscriptions.size === 0) {
      return 0; // No streaming
    }

    let minFrequency = Number.MAX_VALUE;

    for (const subDetails of subscriptions.values()) {
      if (subDetails && subDetails.preferredFrequencyInSeconds) {
        minFrequency = Math.min(
          minFrequency,
          subDetails.preferredFrequencyInSeconds,
        );
      }
    }

    return minFrequency === Number.MAX_VALUE ? 0 : minFrequency;
  }

  /**
   * Update distribution trackers when subscriptions change
   */
  private _updateDistributionTrackers(userId: string, user: UserI): void {
    const subscriptions = user.photoSubscriptions;

    if (!subscriptions || subscriptions.size === 0) {
      this.userDistributionTrackers.delete(userId);
      return;
    }

    const trackers = new Map<string, PhotoDistributionTracker>();

    for (const [packageName, subDetails] of subscriptions) {
      if (subDetails) {
        // Get app webhook URL
        const userSession = sessionService.getSessionByUserId(userId);
        const app = userSession?.installedApps.get(packageName);
        const webhookUrl = app?.publicUrl
          ? `${app.publicUrl}/photo-upload`
          : undefined;

        trackers.set(packageName, {
          packageName,
          preferredFrequencyInSeconds: subDetails.preferredFrequencyInSeconds,
          lastSentTimestamp: 0, // Will get photo on next update
          webhookUrl,
        });
      }
    }

    this.userDistributionTrackers.set(userId, trackers);
  }

  /**
   * Send frequency command to glasses
   */
  private _sendFrequencyCommand(
    userSession: UserSession,
    frequencyInSeconds: number,
  ): void {
    const trackers = this.userDistributionTrackers.get(userSession.userId);

    // If single subscriber with webhook, include URL for direct upload
    let webhookUrls: string[] | undefined;
    if (trackers && trackers.size === 1) {
      const tracker = Array.from(trackers.values())[0];
      if (tracker.webhookUrl) {
        webhookUrls = [tracker.webhookUrl];
      }
    }

    const message: SetPhotoFrequency = {
      type: CloudToGlassesMessageType.SET_PHOTO_FREQUENCY,
      sessionId: userSession.sessionId,
      frequencyInSeconds,
      webhookUrls,
      timestamp: new Date(),
    };

    try {
      userSession.websocket.send(JSON.stringify(message));
      logger.info(
        {
          userId: userSession.userId,
          frequencyInSeconds,
          singleSubscriber: webhookUrls?.length === 1,
        },
        "Sent photo frequency command to glasses",
      );
    } catch (error) {
      logger.error(
        { error, userId: userSession.userId },
        "Failed to send frequency command",
      );
    }
  }

  /**
   * Notify app that a photo is available
   */
  private _notifyAppOfPhoto(
    userSession: UserSession,
    packageName: string,
    requestId: string,
  ): void {
    const photoUpdate = {
      type: StreamType.PHOTO_UPDATE,
      requestId,
      timestamp: new Date(),
    };

    const appWs = userSession.appWebsockets.get(packageName);
    if (appWs && appWs.readyState === WebSocket.OPEN) {
      const dataStream: DataStream = {
        type: CloudToAppMessageType.DATA_STREAM,
        sessionId: `${userSession.sessionId}-${packageName}`,
        streamType: StreamType.PHOTO_UPDATE,
        data: photoUpdate,
        timestamp: new Date(),
      };

      appWs.send(JSON.stringify(dataStream));
      logger.info(
        {
          userId: userSession.userId,
          packageName,
          requestId,
        },
        "Sent photo update notification to app",
      );
    }
  }
}

export const photoStreamService = new PhotoStreamService();
logger.info("Photo Stream Service initialized");
```

### 4. Database Model Updates

**File**: `cloud/packages/cloud/src/models/user.model.ts`

Add photo subscription tracking to the User model:

```typescript
// Add to UserI interface
export interface UserI extends Document {
  // ... existing fields ...

  // Photo streaming subscriptions
  photoSubscriptions?: Map<string, { preferredFrequencyInSeconds: number }>;
  effectivePhotoFrequency?: number; // Minimum frequency in seconds (0 = no streaming)
}

// Add to UserSchema
const UserSchema = new Schema<UserI>({
  // ... existing fields ...

  photoSubscriptions: {
    type: Map,
    of: new Schema(
      {
        preferredFrequencyInSeconds: {
          type: Number,
          required: true,
          min: 2, // Minimum 2 seconds
        },
      },
      { _id: false },
    ),
    default: new Map(),
  },

  effectivePhotoFrequency: {
    type: Number,
    default: 0, // 0 means no streaming
    min: 0,
  },
});
```

### 5. Update PhotoManager Integration

**File**: `cloud/packages/cloud/src/services/session/PhotoManager.ts`

Integrate with the photo streaming service:

```typescript
import { photoStreamService } from '../core/photo-stream.service';

// In requestPhoto method, add cache check:
async requestPhoto(appRequest: PhotoRequest): Promise<string> {
  const { packageName, requestId, saveToGallery = false } = appRequest;

  // Check if we have a recent photo from streaming
  if (photoStreamService.hasRecentPhoto(this.userSession.userId)) {
    const cachedInfo = photoStreamService.getCachedPhotoInfo(this.userSession.userId);
    if (cachedInfo) {
      this.logger.info({
        packageName,
        cachedRequestId: cachedInfo.requestId,
        age: Date.now() - cachedInfo.timestamp
      }, 'Using cached photo from stream');

      // Return the cached request ID
      // The photo has already been uploaded or is being uploaded
      return cachedInfo.requestId;
    }
  }

  // Continue with normal photo request...
  // ... existing code ...
}
```

### 6. WebSocket Message Handlers

**File**: `cloud/packages/cloud/src/services/websocket/websocket-app.service.ts`

Add subscription handling:

```typescript
// In handleSubscriptionUpdate method
private async handleSubscriptionUpdate(
  message: AppSubscriptionUpdate,
  userSession: UserSession,
  appWebsocket: WebSocket
): Promise<void> {
  // ... existing code ...

  // Check if photo_stream subscription changed
  const photoStreamSub = message.subscriptions.find(s => s === 'photo_stream');
  if (photoStreamSub || hadPhotoStream) {
    // Update photo subscriptions in user model
    const user = await User.findByEmail(userSession.userId);
    if (user) {
      if (photoStreamSub) {
        // Extract frequency from subscription details
        const frequency = // ... get from message
        user.photoSubscriptions.set(message.packageName, {
          preferredFrequencyInSeconds: frequency
        });
      } else {
        user.photoSubscriptions.delete(message.packageName);
      }
      await photoStreamService.handleSubscriptionChange(user, userSession);
    }
  }
}
```

**File**: `cloud/packages/cloud/src/services/websocket/websocket-glasses.service.ts`

Handle photo stream updates from glasses:

```typescript
// In handleGlassesMessage method
case GlassesToCloudMessageType.PHOTO_STREAM_UPDATE:
  await photoStreamService.handlePhotoStreamUpdate(
    userSession,
    message as PhotoStreamUpdateFromGlasses
  );
  break;
```

### 7. ASG Client Updates

**File**: `asg_client/app/src/main/java/com/augmentos/asg_client/camera/CameraNeo.java`

Add continuous capture mode:

```java
public class CameraNeo extends LifecycleService {
    // ... existing code ...

    // Continuous capture mode
    private boolean isContinuousMode = false;
    private int continuousFrequencySeconds = 0;
    private Timer continuousTimer;
    private List<String> webhookUrls;

    // Intent actions
    public static final String ACTION_START_CONTINUOUS_CAPTURE = "com.augmentos.camera.ACTION_START_CONTINUOUS_CAPTURE";
    public static final String ACTION_STOP_CONTINUOUS_CAPTURE = "com.augmentos.camera.ACTION_STOP_CONTINUOUS_CAPTURE";
    public static final String EXTRA_FREQUENCY_SECONDS = "com.augmentos.camera.EXTRA_FREQUENCY_SECONDS";
    public static final String EXTRA_WEBHOOK_URLS = "com.augmentos.camera.EXTRA_WEBHOOK_URLS";

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // ... existing code ...

        switch (action) {
            case ACTION_START_CONTINUOUS_CAPTURE:
                int frequency = intent.getIntExtra(EXTRA_FREQUENCY_SECONDS, 5);
                ArrayList<String> urls = intent.getStringArrayListExtra(EXTRA_WEBHOOK_URLS);
                startContinuousCapture(frequency, urls);
                break;

            case ACTION_STOP_CONTINUOUS_CAPTURE:
                stopContinuousCapture();
                break;
        }
    }

    private void startContinuousCapture(int frequencySeconds, List<String> urls) {
        if (isContinuousMode) {
            stopContinuousCapture();
        }

        isContinuousMode = true;
        continuousFrequencySeconds = frequencySeconds;
        webhookUrls = urls;

        Log.d(TAG, "Starting continuous capture mode: " + frequencySeconds + "s frequency");

        continuousTimer = new Timer();
        continuousTimer.scheduleAtFixedRate(new TimerTask() {
            @Override
            public void run() {
                capturePhotoForStream();
            }
        }, 0, frequencySeconds * 1000L);
    }

    private void stopContinuousCapture() {
        if (continuousTimer != null) {
            continuousTimer.cancel();
            continuousTimer = null;
        }
        isContinuousMode = false;
        Log.d(TAG, "Stopped continuous capture mode");
    }

    private void capturePhotoForStream() {
        String requestId = UUID.randomUUID().toString();
        String timeStamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());
        String photoFilePath = getExternalFilesDir(null) + File.separator + "STREAM_" + timeStamp + ".jpg";

        // Use existing photo capture with callback
        takePictureWithCallback(this, photoFilePath, new PhotoCaptureCallback() {
            @Override
            public void onPhotoCaptured(String filePath) {
                // If single webhook URL, upload directly
                if (webhookUrls != null && webhookUrls.size() == 1) {
                    uploadPhotoDirectly(filePath, requestId, webhookUrls.get(0));
                } else {
                    // Multiple subscribers or no webhook - notify cloud
                    notifyCloudOfStreamPhoto(requestId);
                }
            }

            @Override
            public void onPhotoError(String errorMessage) {
                Log.e(TAG, "Stream photo capture error: " + errorMessage);
            }
        });
    }

    private void uploadPhotoDirectly(String filePath, String requestId, String webhookUrl) {
        // Similar to MediaCaptureService.uploadPhotoToWebhook
        // ... implementation ...
    }

    private void notifyCloudOfStreamPhoto(String requestId) {
        // Send PHOTO_STREAM_UPDATE message to cloud via WebSocket
        // ... implementation ...
    }
}
```

**File**: `asg_client/app/src/main/java/com/augmentos/asg_client/websocket/MessageHandler.java`

Handle SET_PHOTO_FREQUENCY command:

```java
case CloudToGlassesMessageType.SET_PHOTO_FREQUENCY:
    handleSetPhotoFrequency(message);
    break;

private void handleSetPhotoFrequency(JSONObject message) {
    try {
        int frequencySeconds = message.getInt("frequencyInSeconds");
        JSONArray urlsArray = message.optJSONArray("webhookUrls");

        ArrayList<String> webhookUrls = null;
        if (urlsArray != null) {
            webhookUrls = new ArrayList<>();
            for (int i = 0; i < urlsArray.length(); i++) {
                webhookUrls.add(urlsArray.getString(i));
            }
        }

        if (frequencySeconds > 0) {
            // Start continuous capture
            Intent intent = new Intent(context, CameraNeo.class);
            intent.setAction(CameraNeo.ACTION_START_CONTINUOUS_CAPTURE);
            intent.putExtra(CameraNeo.EXTRA_FREQUENCY_SECONDS, frequencySeconds);
            if (webhookUrls != null) {
                intent.putStringArrayListExtra(CameraNeo.EXTRA_WEBHOOK_URLS, webhookUrls);
            }
            context.startForegroundService(intent);
        } else {
            // Stop continuous capture
            Intent intent = new Intent(context, CameraNeo.class);
            intent.setAction(CameraNeo.ACTION_STOP_CONTINUOUS_CAPTURE);
            context.startForegroundService(intent);
        }
    } catch (JSONException e) {
        Log.e(TAG, "Error parsing SET_PHOTO_FREQUENCY message", e);
    }
}
```

### 8. Testing & Rollout Plan

1. **Unit Tests**:
   - Test frequency calculation with multiple subscriptions
   - Test distribution timing logic
   - Test cache age checks

2. **Integration Tests**:
   - Test single subscriber direct upload
   - Test multiple subscriber distribution
   - Test requestPhoto() with cached data
   - Test subscription changes

3. **Performance Tests**:
   - Test with maximum frequency (2 second intervals)
   - Test with many subscribers
   - Monitor battery impact on glasses

4. **Rollout Phases**:
   - Phase 1: Deploy cloud changes with feature flag
   - Phase 2: Update SDK and test with sample apps
   - Phase 3: Deploy ASG client updates
   - Phase 4: Enable for all apps

## Key Differences from Location Streaming

1. **Delivery Method**: Photos use HTTP POST to `/photo-upload`, not WebSocket messages
2. **Direct Upload**: Single subscriber optimization bypasses cloud
3. **Caching**: Photos are cached for smart polling (1.9 second window)
4. **Frequency**: Time-based (seconds) instead of accuracy tiers
5. **Minimum Interval**: 2 seconds to prevent camera overload

## Security Considerations

1. **Rate Limiting**: Enforce minimum 2-second frequency
2. **Permission Check**: Verify CAMERA permission before allowing subscriptions
3. **Webhook Validation**: Ensure webhook URLs belong to authorized apps
4. **Resource Management**: Limit total subscribers per user

## Migration Notes

- No database migration needed - new fields have defaults
- Backward compatible - existing requestPhoto() continues to work
- Apps must opt-in to streaming via new subscription method
