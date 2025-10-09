/**
 * @fileoverview Service for managing App subscriptions to data streams.
 * Handles subscription lifecycle, history tracking, and access control.
 *
 * Primary responsibilities:
 * - Managing App data subscriptions
 * - Tracking subscription history
 * - Validating subscription access
 * - Providing subscription queries for broadcasting
 * - Enforcing permission checks on subscriptions
 */

import {
  StreamType,
  ExtendedStreamType,
  isLanguageStream,
  parseLanguageStream,
  createTranscriptionStream,
  CalendarEvent,
  SubscriptionRequest,
} from "@mentra/sdk";
import { logger as rootLogger } from "../logging/pino-logger";
import { SimplePermissionChecker } from "../permissions/simple-permission-checker";
import App from "../../models/app.model";
import UserSession from "./UserSession";
import { User, UserI } from "../../models/user.model";
import { MongoSanitizer } from "../../utils/mongoSanitizer";

const logger = rootLogger.child({ service: "subscription.service" });

/**
 * Record of a subscription change
 */
interface SubscriptionHistory {
  timestamp: Date;
  subscriptions: ExtendedStreamType[];
  action: "add" | "remove" | "update";
}

/**
 * Location data structure
 */
interface Location {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp: Date;
}

/**
 * Implementation of the subscription management service.
 * Design decisions:
 * 1. In-memory storage for fast access
 * 2. History tracking for debugging
 * 3. Wildcard subscription support ('*' or 'all')
 * 4. Session-scoped subscriptions
 */
export class SubscriptionService {
  /**
   * Map of active subscriptions keyed by session:app
   * @private
   */
  private subscriptions = new Map<string, Set<ExtendedStreamType>>();

  /**
   * Map of subscription history keyed by session:app
   * @private
   */
  private history = new Map<string, SubscriptionHistory[]>();

  /**
   * Cache for all calendar events per session
   * @private
   */
  private calendarEventsCache = new Map<string, CalendarEvent[]>();

  /**
   * Cache for the last location per session
   * @private
   */
  private lastLocationCache = new Map<string, Location>();

  /**
   * Caches a calendar event for a session (appends to the list)
   * @param sessionId - User session identifier
   * @param event - Calendar event to cache
   */
  cacheCalendarEvent(sessionId: string, event: CalendarEvent): void {
    if (!this.calendarEventsCache.has(sessionId)) {
      this.calendarEventsCache.set(sessionId, []);
    }
    this.calendarEventsCache.get(sessionId)!.push(event);
    logger.info(
      {
        userId: sessionId,
        sessionId,
        eventCount: this.calendarEventsCache.get(sessionId)!.length,
      },
      "Cached calendar event",
    );
  }

  /**
   * Gets all cached calendar events for a session
   * @param sessionId - User session identifier
   * @returns Array of calendar events (empty if none)
   */
  getAllCalendarEvents(sessionId: string): CalendarEvent[] {
    return this.calendarEventsCache.get(sessionId) || [];
  }

  /**
   * Removes all cached calendar events for a session
   * @param sessionId - User session identifier
   */
  clearCalendarEvents(sessionId: string): void {
    this.calendarEventsCache.delete(sessionId);
    logger.info(
      { sessionId, userId: sessionId },
      "Cleared all calendar events",
    );
  }

  /**
   * @deprecated Use getAllCalendarEvents instead
   */
  getLastCalendarEvent(sessionId: string): CalendarEvent | undefined {
    const events = this.calendarEventsCache.get(sessionId);
    return events && events.length > 0 ? events[events.length - 1] : undefined;
  }

  /**
   * Caches the last location for a session
   * @param sessionId - User session identifier
   * @param location - Location to cache
   */
  cacheLocation(sessionId: string, location: Location): void {
    this.lastLocationCache.set(sessionId, location);
    logger.info(
      {
        sessionId,
        location: { lat: location.latitude, lng: location.longitude },
      },
      "Cached location",
    );
  }

  /**
   * Gets the last cached location for a session
   * @param sessionId - User session identifier
   * @returns The last location or undefined if none exists
   */
  getLastLocation(sessionId: string): Location | undefined {
    return this.lastLocationCache.get(sessionId);
  }

  /**
   * Generates a unique key for subscription storage
   * @param sessionId - User session identifier
   * @param packageName - App identifier
   * @returns Unique key for the session-app pair
   * @private
   */
  private getKey(sessionId: string, packageName: string): string {
    return `${sessionId}:${packageName}`;
  }

  /**
   * Caches the subscription update version for each session-app
   * @private
   */
  private subscriptionUpdateVersion = new Map<string, number>();

  /**
   * Updates subscriptions for a App.
   * @param sessionId - User session identifier
   * @param packageName - App identifier
   * @param userId - User identifier for validation
   * @param subscriptions - New set of subscriptions
   * @throws If invalid subscription types are requested or permissions are missing
   */
  async updateSubscriptions(
    userSession: UserSession,
    packageName: string,
    subscriptions: SubscriptionRequest[],
  ): Promise<UserI | null> {
    const key = this.getKey(userSession.userId, packageName);

    // Increment version for this key
    const currentVersion = (this.subscriptionUpdateVersion.get(key) || 0) + 1;
    this.subscriptionUpdateVersion.set(key, currentVersion);

    // Capture the version for this call
    const thisCallVersion = currentVersion;

    logger.info(
      { key, subscriptions, userId: userSession.userId },
      "Update subscriptions request received",
    );

    // Process incoming subscriptions array - handle both strings and rich location objects
    const streamSubscriptions: ExtendedStreamType[] = [];
    let locationRate: string | null = null;

    // Separate simple string subscriptions from special location object
    for (const sub of subscriptions) {
      if (
        typeof sub === "object" &&
        sub !== null &&
        "stream" in sub &&
        sub.stream === StreamType.LOCATION_STREAM
      ) {
        locationRate = sub.rate; // Save the rate for later
        streamSubscriptions.push(sub.stream);
      } else if (typeof sub === "string") {
        streamSubscriptions.push(sub);
      }
    }

    const processedSubscriptions = streamSubscriptions.map((sub) =>
      sub === StreamType.TRANSCRIPTION
        ? createTranscriptionStream("en-US")
        : sub,
    );

    for (const sub of processedSubscriptions) {
      if (!this.isValidSubscription(sub)) {
        logger.error(
          {
            debugKey: "RTMP_SUB_VALIDATION_FAIL",
            subscription: sub,
            packageName,
            sessionId: userSession.sessionId,
            userId: userSession.userId,
            availableStreamTypes: Object.values(StreamType),
            isRtmpStreamStatus: sub === "rtmp_stream_status",
            isRtmpStreamStatusEnum: sub === StreamType.RTMP_STREAM_STATUS,
            streamTypeEnumValue: StreamType.RTMP_STREAM_STATUS,
            processedSubscriptions,
            originalSubscriptions: subscriptions,
          },
          "RTMP_SUB_VALIDATION_FAIL: Invalid subscription type detected in session subscription service",
        );
        throw new Error(`Invalid subscription type: ${sub}`);
      }
    }

    logger.info(
      { processedSubscriptions, userId: userSession.userId },
      "Processed and validated subscriptions",
    );

    try {
      // Get app details
      const app = await App.findOne({ packageName });

      if (!app) {
        logger.warn(
          { packageName, userId: userSession.userId },
          "App not found when checking permissions",
        );
        throw new Error(`App ${packageName} not found`);
      }

      // Filter subscriptions based on permissions
      const { allowed, rejected } = SimplePermissionChecker.filterSubscriptions(
        app,
        processedSubscriptions,
      );

      logger.debug(
        {
          userId: userSession.userId,
          subscriptionMap: Array.from(this.subscriptions.entries()).map(
            ([k, v]) => [k, Array.from(v)],
          ),
        },
        "Current subscription map after update",
      );

      logger.info(
        { packageName, processedSubscriptions, userId: userSession.userId },
        "Subscriptions updated after permission check",
      );

      // If some subscriptions were rejected, send an error message to the client
      if (rejected.length > 0) {
        logger.warn(
          {
            packageName,
            userId: userSession.userId,
            rejectedCount: rejected.length,
            rejectedStreams: rejected.map((r) => ({
              stream: r.stream,
              requiredPermission: r.requiredPermission,
            })),
          },
          "Rejected subscriptions due to missing permissions",
        );

        const appWebsocket = userSession.appWebsockets.get(packageName);

        if (appWebsocket && appWebsocket.readyState === 1) {
          // Send a detailed error message to the App about the rejected subscriptions
          const errorMessage = {
            type: "permission_error",
            message:
              "Some subscriptions were rejected due to missing permissions",
            details: rejected.map((r) => ({
              stream: r.stream,
              requiredPermission: r.requiredPermission,
              message: `To subscribe to ${r.stream}, add the ${r.requiredPermission} permission in the developer console`,
            })),
            timestamp: new Date(),
          };

          appWebsocket.send(JSON.stringify(errorMessage));
        }

        // Continue with only the allowed subscriptions
        processedSubscriptions.length = 0;
        processedSubscriptions.push(...allowed);
      }

      // Update the in-memory subscription map
      const newSubs = new Set(processedSubscriptions);

      // At the end, before setting:
      if (this.subscriptionUpdateVersion.get(key) !== thisCallVersion) {
        // A newer call has started, so abort this update
        logger.info(
          {
            userId: userSession.userId,
            key,
            thisCallVersion,
            currentVersion: this.subscriptionUpdateVersion.get(key),
          },
          "Skipping update as newer call has started",
        );
        return null;
      }

      // Only now set the subscriptions
      this.subscriptions.set(key, newSubs);

      const action: SubscriptionHistory["action"] =
        (this.history.get(key)?.length || 0) === 0 ? "add" : "update";
      this.addToHistory(key, {
        timestamp: new Date(),
        subscriptions: [...processedSubscriptions],
        action,
      });

      logger.info(
        {
          packageName,
          userId: userSession.userId,
          processedSubscriptions,
          newSubs: Array.from(newSubs),
          serviceSubscriptions: Array.from(this.subscriptions.entries()).map(
            ([k, v]) => [k, Array.from(v)],
          ),
        },
        "Updated subscriptions successfully",
      );

      // Auto-update TranscriptionManager with new subscription state
      await this.syncTranscriptionManager(userSession);

      // Update microphone state AFTER subscription is set
      // This ensures the microphone state check uses the updated subscription map
      if (userSession.microphoneManager) {
        userSession.microphoneManager.handleSubscriptionChange();
      }
    } catch (error) {
      // If there's an error getting the app or checking permissions, log it but don't block
      // This ensures backward compatibility with existing code
      logger.error(
        { error, packageName, userId: userSession.userId },
        "Error checking permissions",
      );

      // Continue with the subscription update
      const newSubs = new Set(processedSubscriptions);
      this.subscriptions.set(key, newSubs);

      const action: SubscriptionHistory["action"] =
        (this.history.get(key)?.length || 0) === 0 ? "add" : "update";
      this.addToHistory(key, {
        timestamp: new Date(),
        subscriptions: [...processedSubscriptions],
        action,
      });

      // Update microphone state AFTER subscription is set (even in error case)
      if (userSession.microphoneManager) {
        userSession.microphoneManager.handleSubscriptionChange();
      }
    }

    // --- Database Operations with Retry Logic ---
    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const user = await User.findOne({ email: userSession.userId });
        if (!user) {
          logger.warn(
            { userId: userSession.userId },
            "User not found for subscription DB update.",
          );
          return null;
        }

        const sanitizedPackageName = MongoSanitizer.sanitizeKey(packageName);

        // Persist the location rate information to the database
        if (locationRate) {
          if (!user.locationSubscriptions) {
            user.locationSubscriptions = new Map();
          }
          // Set the rate for this specific app's package name
          user.locationSubscriptions.set(sanitizedPackageName, {
            rate: locationRate,
          });
        } else {
          // If there's no locationRate, the app is unsubscribing from the location stream
          if (user.locationSubscriptions?.has(sanitizedPackageName)) {
            user.locationSubscriptions.delete(sanitizedPackageName);
          }
        }

        // Tell mongoose that we've modified a mixed-type field
        user.markModified("locationSubscriptions");
        await user.save();
        logger.info(
          { packageName, userId: userSession.userId },
          "Persisted subscription changes successfully",
        );
        return user; // Success, return the updated user document
      } catch (error) {
        if ((error as any).name === "VersionError") {
          logger.warn(
            `Version conflict saving user subscriptions for ${userSession.userId}, attempt ${attempt + 1}/${maxRetries}. Retrying...`,
          );
          if (attempt < maxRetries - 1) {
            await new Promise((resolve) =>
              setTimeout(resolve, Math.pow(2, attempt) * 100),
            );
          } else {
            logger.error(
              `Failed to save user subscriptions for ${userSession.userId} after ${maxRetries} attempts due to version conflicts.`,
            );
            throw error; // Rethrow after final attempt
          }
        } else {
          logger.error(
            { error, packageName, userId: userSession.userId },
            "Error persisting subscription changes.",
          );
          throw error; // Rethrow for other errors
        }
      }
    }
    return null; // This line should be unreachable
  }

  hasPCMTranscriptionSubscriptions(sessionId: string): {
    hasMedia: boolean;
    hasPCM: boolean;
    hasTranscription: boolean;
  } {
    let hasMedia = false;
    let hasPCM = false;
    let hasTranscription = false;

    for (const [key, subs] of this.subscriptions.entries()) {
      if (!key.startsWith(sessionId + ":")) continue;
      for (const sub of subs) {
        if (sub === StreamType.AUDIO_CHUNK) {
          hasPCM = true;
          hasMedia = true;
        } else if (
          sub === StreamType.TRANSLATION ||
          sub === StreamType.TRANSCRIPTION
        ) {
          hasTranscription = true;
          hasMedia = true;
        } else {
          const langInfo = parseLanguageStream(sub as string);
          if (
            langInfo &&
            (langInfo.type === StreamType.TRANSLATION ||
              langInfo.type === StreamType.TRANSCRIPTION)
          ) {
            hasTranscription = true;
            hasMedia = true;
          }
        }
      }
    }

    return {
      hasMedia,
      hasPCM,
      hasTranscription,
    };
  }

  /**
   * Returns an object listing which Apps (by package name) for a specific user (session)
   * are subscribed to "audio_chunk", "translation", and "transcription".
   */
  hasMediaSubscriptions(sessionId: string): boolean {
    let hasMedia = false;
    const mediaSubscriptions: Array<{ key: string; subscription: string }> = [];

    for (const [key, subs] of this.subscriptions.entries()) {
      // Only consider subscriptions for the given user session.
      if (!key.startsWith(sessionId + ":")) continue;

      for (const sub of subs) {
        // Check plain stream types.
        if (
          sub === StreamType.AUDIO_CHUNK ||
          sub === StreamType.TRANSLATION ||
          sub === StreamType.TRANSCRIPTION
        ) {
          mediaSubscriptions.push({ key, subscription: sub as string });
          hasMedia = true;
        } else {
          // Check if it's a language-specific subscription.
          const langInfo = parseLanguageStream(sub as string);
          if (
            langInfo &&
            (langInfo.type === StreamType.TRANSLATION ||
              langInfo.type === StreamType.TRANSCRIPTION)
          ) {
            mediaSubscriptions.push({ key, subscription: sub as string });
            hasMedia = true;
          }
        }
      }
    }

    logger.debug(
      {
        sessionId,
        userId: sessionId,
        hasMediaSubscriptions: hasMedia,
        subscriptionMap: Array.from(this.subscriptions.entries()).map(
          ([k, v]) => [k, Array.from(v)],
        ),
        mediaSubscriptions,
      },
      "Checked session for media subscriptions",
    );

    return hasMedia;
  }

  /**
   * Gets all Apps subscribed to a specific stream type
   * @param session - User session identifier
   * @param subscription - Subscription type to check
   * @returns Array of app IDs subscribed to the stream
   */
  getSubscribedApps(
    userSession: UserSession,
    subscription: ExtendedStreamType,
  ): string[] {
    const sessionId = userSession.sessionId;
    const subscribedApps: string[] = [];

    // Track why apps were subscribed for logging
    const subscriptionMatches: Array<{
      packageName: string;
      matchedOn: string;
    }> = [];

    for (const [key, subs] of this.subscriptions.entries()) {
      if (!key.startsWith(`${sessionId}:`)) continue;
      const [, packageName] = key.split(":");
      for (const sub of subs) {
        // If it's a plain subscription or wildcard
        if (
          sub === subscription ||
          sub === StreamType.ALL ||
          sub === StreamType.WILDCARD
        ) {
          subscribedApps.push(packageName);
          subscriptionMatches.push({
            packageName,
            matchedOn: sub === subscription ? "exact" : (sub as string),
          });
          break;
        }

        // Special case for backwards compatibility
        // If an app is subscribed to 'location_stream', it should also
        // automatically receive the old 'location_update' events
        if (
          subscription === StreamType.LOCATION_UPDATE &&
          sub === StreamType.LOCATION_STREAM
        ) {
          subscribedApps.push(packageName);
          subscriptionMatches.push({
            packageName,
            matchedOn: "location_stream_implicit",
          });
          break;
        }
      }
    }

    // TODO(isaiah): Wow this is extremly verbose when anything is subscribed to any audio related stream,
    // this is a huge issue and points out a big inefficency in the way we're storing subscriptions and calculating what is subscribed to what.
    // 1. we should refactor this to be a subscription manager attached to a user's session instead of a global service.
    // 2. we should be caching what streams are subscribed to what apps, so we can quickly look up the apps for a stream without iterating over all subscriptions.

    // logger.debug({
    //   sessionId,
    //   userId: sessionId,
    //   requestedSubscription: subscription,
    //   subscribedApps,
    //   subscriptionMatches
    // }, 'Retrieved subscribed apps for stream');

    return subscribedApps;
  }

  /**
   * Gets all active subscriptions for a App
   * @param sessionId - User session identifier
   * @param packageName - App identifier
   * @returns Array of active subscriptions
   */
  getAppSubscriptions(
    sessionId: string,
    packageName: string,
  ): ExtendedStreamType[] {
    const key = this.getKey(sessionId, packageName);
    const subs = this.subscriptions.get(key);
    const result = subs ? Array.from(subs) : [];
    logger.debug(
      {
        sessionId,
        userId: sessionId,
        packageName,
        subscriptions: result,
      },
      "Retrieved app subscriptions",
    );
    return result;
  }

  /**
   * Gets subscription history for a App
   * @param sessionId - User session identifier
   * @param packageName - App identifier
   * @returns Array of historical subscription changes
   */
  getSubscriptionHistory(
    sessionId: string,
    packageName: string,
  ): SubscriptionHistory[] {
    const key = this.getKey(sessionId, packageName);
    return this.history.get(key) || [];
  }

  /**
   * Removes all subscriptions for a App
   * @param sessionId - User session identifier
   * @param packageName - App identifier
   */
  async removeSubscriptions(
    userSession: UserSession,
    packageName: string,
  ): Promise<UserI | null> {
    const key = this.getKey(userSession.sessionId, packageName);

    // Perform in-memory removal immediately
    if (this.subscriptions.has(key)) {
      const currentSubs = Array.from(this.subscriptions.get(key) || []);
      this.subscriptions.delete(key);
      this.addToHistory(key, {
        timestamp: new Date(),
        subscriptions: currentSubs,
        action: "remove",
      });
      logger.info(
        { packageName, sessionId: userSession.sessionId },
        `Removed in-memory subscriptions for App ${packageName}`,
      );
    }

    // Remove from user session's transcription manager
    // Auto-update TranscriptionManager with new subscription state
    await this.syncTranscriptionManager(userSession);

    // Perform background DB removal
    try {
      const user = await User.findOne({ email: userSession.userId });
      const sanitizedPackageName = MongoSanitizer.sanitizeKey(packageName);
      if (user && user.locationSubscriptions?.has(sanitizedPackageName)) {
        user.locationSubscriptions.delete(sanitizedPackageName);
        user.markModified("locationSubscriptions");
        await user.save();
        logger.info(
          { packageName, userId: userSession.userId },
          `Removed location subscription from DB for App ${packageName}`,
        );
        return user;
      }
      return user; // Return user even if no changes were made
    } catch (error) {
      logger.error(
        { error, packageName, userId: userSession.userId },
        "Error removing location subscription from DB.",
      );
      throw error; // Rethrow to be handled by caller
    }
  }

  /**
   * Get all transcription-related subscriptions for a user session
   * (now only returns transcription, not translation)
   */
  private getTranscriptionSubscriptions(
    userSession: UserSession,
  ): ExtendedStreamType[] {
    const transcriptionSubs: ExtendedStreamType[] = [];

    // Get all subscriptions for this user
    const userPrefix = `${userSession.userId}:`;

    for (const [key, subs] of this.subscriptions.entries()) {
      if (key.startsWith(userPrefix)) {
        for (const sub of subs) {
          // Only include transcription subscriptions (not translation)
          if (sub.includes("transcription") && !sub.includes("translation")) {
            transcriptionSubs.push(sub as ExtendedStreamType);
          }
        }
      }
    }

    return transcriptionSubs;
  }

  /**
   * Get all translation-related subscriptions for a user session
   */
  private getTranslationSubscriptions(
    userSession: UserSession,
  ): ExtendedStreamType[] {
    const translationSubs: ExtendedStreamType[] = [];

    // Get all subscriptions for this user
    const userPrefix = `${userSession.userId}:`;

    for (const [key, subs] of this.subscriptions.entries()) {
      if (key.startsWith(userPrefix)) {
        for (const sub of subs) {
          // Only include translation subscriptions
          if (sub.includes("translation")) {
            translationSubs.push(sub as ExtendedStreamType);
          }
        }
      }
    }

    return translationSubs;
  }

  /**
   * Automatically sync TranscriptionManager and TranslationManager with current subscriptions
   */
  private async syncTranscriptionManager(
    userSession: UserSession,
  ): Promise<void> {
    try {
      // Sync transcription subscriptions
      const transcriptionSubs = this.getTranscriptionSubscriptions(userSession);
      await userSession.transcriptionManager.updateSubscriptions(
        transcriptionSubs,
      );

      // Sync translation subscriptions
      const translationSubs = this.getTranslationSubscriptions(userSession);
      await userSession.translationManager.updateSubscriptions(translationSubs);

      // Ensure streams are synchronized after subscription update
      await Promise.all([
        userSession.transcriptionManager.ensureStreamsExist(),
        userSession.translationManager.ensureStreamsExist(),
      ]);

      logger.debug(
        {
          userId: userSession.userId,
          transcriptionSubs,
          translationSubs,
        },
        "Synced TranscriptionManager and TranslationManager with current subscriptions",
      );
    } catch (error) {
      logger.error(
        {
          error,
          userId: userSession.userId,
        },
        "Error syncing transcription/translation managers with subscriptions",
      );
    }
  }

  /**
   * Removes all subscription history for a session
   * Used when a session is being killed to free memory
   * @param sessionId - User session identifier
   */
  removeSessionSubscriptionHistory(sessionId: string): void {
    // Find all keys that start with this session ID
    const keysToRemove: string[] = [];

    for (const key of this.history.keys()) {
      if (key.startsWith(`${sessionId}:`)) {
        keysToRemove.push(key);
      }
    }

    // Remove all history entries for this session
    keysToRemove.forEach((key) => {
      this.history.delete(key);
    });

    // Remove cached calendar events for this session
    this.calendarEventsCache.delete(sessionId);

    // Remove cached location for this session
    this.lastLocationCache.delete(sessionId);

    logger.info(
      { userId: sessionId, sessionId, removedEntries: keysToRemove.length },
      "Removed subscription history",
    );
  }

  /**
   * Checks if a App has a specific subscription
   * @param sessionId - User session identifier
   * @param packageName - App identifier
   * @param subscription - Subscription type to check
   * @returns Boolean indicating if the subscription exists
   */
  hasSubscription(
    sessionId: string,
    packageName: string,
    subscription: StreamType,
  ): boolean {
    const key = this.getKey(sessionId, packageName);
    const subs = this.subscriptions.get(key);

    if (!subs) return false;
    return (
      subs.has(subscription) ||
      subs.has(StreamType.WILDCARD) ||
      subs.has(StreamType.ALL)
    );
  }

  /**
   * Adds an entry to the subscription history
   * @param key - Session:app key
   * @param entry - History entry to add
   * @private
   */
  private addToHistory(key: string, entry: SubscriptionHistory): void {
    const history = this.history.get(key) || [];
    history.push(entry);
    this.history.set(key, history);
  }

  /**
   * Returns the minimal set of language-specific subscriptions for a given user session.
   * For example, if a user's apps request:
   *  - transcription:en-US
   *  - translation:es-ES-to-en-US
   *  - transcription:en-US
   *
   * This function returns:
   * [ "transcription:en-US", "translation:es-ES-to-en-US" ]
   */
  getMinimalLanguageSubscriptions(sessionId: string): ExtendedStreamType[] {
    const languageSet = new Set<ExtendedStreamType>();
    for (const [key, subs] of this.subscriptions.entries()) {
      if (!key.startsWith(`${sessionId}:`)) continue;
      for (const sub of subs) {
        if (isLanguageStream(sub)) {
          languageSet.add(sub);
        }
      }
    }
    return Array.from(languageSet);
  }

  /**
   * Gets all Apps subscribed to a specific AugmentOS setting key
   * @param userSession - User session identifier
   * @param settingKey - The augmentosSettings key (e.g., 'metricSystemEnabled')
   * @returns Array of app IDs subscribed to the augmentos setting
   */
  getSubscribedAppsForAugmentosSetting(
    userSession: UserSession,
    settingKey: string,
  ): string[] {
    const sessionId = userSession.sessionId;
    const subscribedApps: string[] = [];
    const subscription = `augmentos:${settingKey}`;

    logger.debug(
      {
        sessionId,
        settingKey,
        subscriptionMap: Array.from(this.subscriptions.entries()).map(
          ([k, v]) => [k, Array.from(v)],
        ),
      },
      "Getting subscribed apps for AugmentOS setting",
    );
    for (const [key, subs] of this.subscriptions.entries()) {
      if (!key.startsWith(`${sessionId}:`)) continue;
      const [, packageName] = key.split(":");
      for (const sub of subs) {
        if (
          sub === subscription ||
          sub === "augmentos:*" ||
          sub === "augmentos:all"
        ) {
          logger.info(
            { packageName, subscription, sessionId },
            "App is subscribed to AugmentOS setting",
          );
          subscribedApps.push(packageName);
          break;
        }
      }
    }
    logger.info(
      { settingKey, userId: sessionId, sessionId, subscribedApps },
      "AugmentOS setting subscription results",
    );
    return subscribedApps;
  }

  /**
   * Validates a subscription type
   * @param subscription - Subscription to validate
   * @returns Boolean indicating if the subscription is valid
   * @private
   */
  private isValidSubscription(subscription: ExtendedStreamType): boolean {
    // 1. Check for standard StreamType enum values
    if (Object.values(StreamType).includes(subscription as StreamType)) {
      logger.debug(
        { subscription },
        "Subscription is a valid standard StreamType",
      );
      return true;
    }

    // For any other format, subscription must be a string
    if (typeof subscription !== "string") {
      logger.warn(
        { subscription, type: typeof subscription },
        "Invalid subscription: not a standard StreamType and not a string.",
      );
      return false;
    }

    // 2. Check for language-specific streams (e.g., transcription, translation)
    // This relies on the SDK's isLanguageStream, which correctly handles query
    // parameters by stripping them before validating the language code.

    logger.debug(
      { subscription },
      "Checking if subscription is a language stream",
    );
    logger.debug(
      { isLanguageStream: isLanguageStream(subscription) },
      "isLanguageStream result",
    );

    if (isLanguageStream(subscription)) {
      const langInfo = parseLanguageStream(subscription);

      // Check for invalid same-language translation
      if (langInfo?.type === StreamType.TRANSLATION) {
        if (langInfo.transcribeLanguage === langInfo.translateLanguage) {
          logger.error(
            {
              subscription,
              source: langInfo.transcribeLanguage,
              target: langInfo.translateLanguage,
            },
            "Invalid translation subscription: cannot translate a language to itself",
          );
          return false;
        }
      }

      logger.debug({ subscription }, "Subscription is a valid language stream");
      return true;
    }

    // 3. Allow augmentos:<key> subscriptions for AugmentOS settings
    if (subscription.startsWith("augmentos:")) {
      logger.debug(
        { subscription },
        "Subscription is a valid Augmentos setting stream",
      );
      return true;
    }

    // 4. If none of the above, the subscription is invalid
    logger.warn(
      { subscription },
      "Invalid subscription type: does not match any known format (Standard, Language, or Augmentos).",
    );
    return false;
  }

  public getSubscriptionEntries() {
    return Array.from(this.subscriptions.entries()).map(([k, v]) => [
      k,
      Array.from(v),
    ]);
  }
}

// Create singleton instance
export const subscriptionService = new SubscriptionService();
logger.info({}, "Subscription Service initialized");

export default subscriptionService;
