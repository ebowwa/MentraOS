import {
  StreamType,
  ExtendedStreamType,
  isLanguageStream,
  parseLanguageStream,
  createTranscriptionStream,
  SubscriptionRequest,
} from "@mentra/sdk";
import { Logger } from "pino";
import UserSession from "./UserSession";
import App from "../../models/app.model";
import { SimplePermissionChecker } from "../permissions/simple-permission-checker";
import { User, UserI } from "../../models/user.model";
import { MongoSanitizer } from "../../utils/mongoSanitizer";

export class SubscriptionManager {
  private readonly userSession: UserSession;
  private readonly logger: Logger;

  // Map of packageName -> Set of subscriptions
  private subscriptions: Map<string, Set<ExtendedStreamType>> = new Map();

  // History per app for debugging/restore
  private history: Map<
    string,
    {
      timestamp: Date;
      subscriptions: ExtendedStreamType[];
      action: "add" | "remove" | "update";
    }[]
  > = new Map();

  // Calendar cache (session-scoped)
  private calendarEventsCache: Array<any> = [];

  // Track app reconnect timestamps for empty-subscription grace handling
  private lastAppReconnectAt: Map<string, number> = new Map();
  private readonly CONNECT_GRACE_MS = 8000; // 8 seconds for slower reconnects

  // Per-app update serialization (mutex/queue)
  private updateChainsByApp: Map<string, Promise<unknown>> = new Map();

  // Cached aggregates for O(1) reads
  private pcmSubscriptionCount = 0;
  private transcriptionLikeSubscriptionCount = 0; // transcription/translation incl. language streams
  private languageStreamCounts: Map<ExtendedStreamType, number> = new Map();

  constructor(userSession: UserSession) {
    this.userSession = userSession;
    this.logger = userSession.logger.child({ service: "SubscriptionManager" });
    this.logger.info(
      { userId: userSession.userId },
      "SubscriptionManager initialized",
    );
  }

  // ===== Public API =====

  markAppReconnected(packageName: string): void {
    this.lastAppReconnectAt.set(packageName, Date.now());
  }

  getAppSubscriptions(packageName: string): ExtendedStreamType[] {
    const subs = this.subscriptions.get(packageName);
    const result = subs ? Array.from(subs) : [];
    this.logger.debug(
      { userId: this.userSession.userId, packageName, subscriptions: result },
      "Retrieved app subscriptions",
    );
    return result;
  }

  hasSubscription(packageName: string, subscription: StreamType): boolean {
    const subs = this.subscriptions.get(packageName);
    if (!subs) return false;
    return (
      subs.has(subscription) ||
      subs.has(StreamType.WILDCARD) ||
      subs.has(StreamType.ALL)
    );
  }

  getSubscribedApps(subscription: ExtendedStreamType): string[] {
    const subscribedApps: string[] = [];
    for (const [packageName, subs] of this.subscriptions.entries()) {
      for (const sub of subs) {
        if (
          sub === subscription ||
          sub === StreamType.ALL ||
          sub === StreamType.WILDCARD
        ) {
          subscribedApps.push(packageName);
          break;
        }

        // Back-compat: location_stream implies location_update
        if (
          subscription === StreamType.LOCATION_UPDATE &&
          sub === StreamType.LOCATION_STREAM
        ) {
          subscribedApps.push(packageName);
          break;
        }
      }
    }
    return subscribedApps;
  }

  getSubscribedAppsForAugmentosSetting(settingKey: string): string[] {
    const subscribed: string[] = [];
    const target = `augmentos:${settingKey}`;
    for (const [packageName, subs] of this.subscriptions.entries()) {
      for (const sub of subs) {
        if (
          sub === target ||
          sub === ("augmentos:*" as any) ||
          sub === ("augmentos:all" as any)
        ) {
          subscribed.push(packageName);
          break;
        }
      }
    }
    this.logger.info(
      { userId: this.userSession.userId, settingKey, subscribed },
      "AugmentOS setting subscription results",
    );
    return subscribed;
  }

  getMinimalLanguageSubscriptions(): ExtendedStreamType[] {
    const result: ExtendedStreamType[] = [];
    for (const [langStream, count] of this.languageStreamCounts.entries()) {
      if (count > 0) result.push(langStream);
    }
    return result;
  }

  hasPCMTranscriptionSubscriptions(): {
    hasMedia: boolean;
    hasPCM: boolean;
    hasTranscription: boolean;
  } {
    const hasPCM = this.pcmSubscriptionCount > 0;
    const hasTranscription = this.transcriptionLikeSubscriptionCount > 0;
    const hasMedia = hasPCM || hasTranscription;
    return { hasMedia, hasPCM, hasTranscription };
  }

  cacheCalendarEvent(event: any): void {
    this.calendarEventsCache.push(event);
    this.logger.info(
      {
        userId: this.userSession.userId,
        count: this.calendarEventsCache.length,
      },
      "Cached calendar event",
    );
  }

  getAllCalendarEvents(): any[] {
    return [...this.calendarEventsCache];
  }

  async updateSubscriptions(
    packageName: string,
    subscriptions: SubscriptionRequest[],
  ): Promise<UserI | null> {
    // Serialize per-app updates via promise chaining
    const previous =
      this.updateChainsByApp.get(packageName) || Promise.resolve();
    let resultUser: UserI | null = null;

    const chained = previous.then(async () => {
      const now = Date.now();
      const lastReconnect = this.lastAppReconnectAt.get(packageName) || 0;

      // Process incoming subscriptions array (strings and special location objects)
      const streamSubscriptions: ExtendedStreamType[] = [];
      let locationRate: string | null = null;
      for (const sub of subscriptions) {
        if (
          typeof sub === "object" &&
          sub !== null &&
          "stream" in sub &&
          (sub as any).stream === StreamType.LOCATION_STREAM
        ) {
          locationRate = (sub as any).rate || null;
          streamSubscriptions.push(StreamType.LOCATION_STREAM);
        } else if (typeof sub === "string") {
          streamSubscriptions.push(sub as ExtendedStreamType);
        }
      }

      const processed: ExtendedStreamType[] = streamSubscriptions.map((sub) =>
        sub === StreamType.TRANSCRIPTION
          ? createTranscriptionStream("en-US")
          : sub,
      );

      // Reconnect grace: ignore empty subs right after reconnect
      if (
        processed.length === 0 &&
        now - lastReconnect <= this.CONNECT_GRACE_MS
      ) {
        this.logger.warn(
          { userId: this.userSession.userId, packageName },
          "Ignoring empty subscription update within reconnect grace window",
        );
        resultUser = await this.persistLocationRate(packageName, locationRate);
        return; // Skip applying empty update
      }

      // Validate permissions (best-effort)
      let allowedProcessed: ExtendedStreamType[] = processed;
      try {
        const app = await App.findOne({ packageName });
        if (app) {
          const { allowed, rejected } =
            SimplePermissionChecker.filterSubscriptions(app, processed);
          if (rejected.length > 0) {
            this.logger.warn(
              {
                userId: this.userSession.userId,
                packageName,
                rejectedCount: rejected.length,
              },
              "Rejected subscriptions due to missing permissions",
            );
          }
          allowedProcessed = allowed;
        }
      } catch (error) {
        const logger = this.logger.child({ packageName });
        logger.error(error, "Error validating subscriptions; continuing");
      }

      // Compute delta and update maps atomically
      const oldSet =
        this.subscriptions.get(packageName) || new Set<ExtendedStreamType>();
      const newSet = new Set<ExtendedStreamType>(allowedProcessed);
      this.applyDelta(packageName, oldSet, newSet);
      this.subscriptions.set(packageName, newSet);
      this.addHistory(packageName, {
        timestamp: new Date(),
        subscriptions: [...newSet],
        action: "update",
      });

      this.logger.info(
        {
          userId: this.userSession.userId,
          packageName,
          processedSubscriptions: [...newSet],
        },
        "Updated subscriptions successfully",
      );

      // Sync managers and mic
      await this.syncManagers();
      this.userSession.microphoneManager?.handleSubscriptionChange();

      // Persist location rate setting for this app
      resultUser = await this.persistLocationRate(packageName, locationRate);
    });

    // Store chain and return when this link finishes
    this.updateChainsByApp.set(
      packageName,
      chained.catch(() => {}),
    );
    await chained;
    return resultUser;
  }

  async removeSubscriptions(packageName: string): Promise<UserI | null> {
    const existing = this.subscriptions.get(packageName);
    if (existing) {
      this.addHistory(packageName, {
        timestamp: new Date(),
        subscriptions: Array.from(existing),
        action: "remove",
      });
      // apply delta to aggregates and clear
      this.applyDelta(packageName, existing, new Set<ExtendedStreamType>());
      this.subscriptions.delete(packageName);
      this.logger.info(
        { userId: this.userSession.userId, packageName },
        "Removed in-memory subscriptions for app",
      );
    }

    await this.syncManagers();
    this.userSession.microphoneManager?.handleSubscriptionChange();

    // Clear location rate for this app in DB
    try {
      const user = await User.findOne({ email: this.userSession.userId });
      if (user) {
        const sanitizedPackage = MongoSanitizer.sanitizeKey(packageName);
        if (user.locationSubscriptions?.has(sanitizedPackage)) {
          user.locationSubscriptions.delete(sanitizedPackage);
          user.markModified("locationSubscriptions");
          await user.save();
        }
        return user;
      }
    } catch (error) {
      const logger = this.logger.child({ packageName });
      logger.error(error, "Error removing location subscription from DB");
    }
    return null;
  }

  getHistory(packageName: string) {
    return this.history.get(packageName) || [];
  }

  dispose(): void {
    this.subscriptions.clear();
    this.history.clear();
    this.calendarEventsCache = [];
    this.lastAppReconnectAt.clear();
  }

  // ===== Private helpers =====

  private addHistory(
    packageName: string,
    entry: {
      timestamp: Date;
      subscriptions: ExtendedStreamType[];
      action: "add" | "remove" | "update";
    },
  ): void {
    const list = this.history.get(packageName) || [];
    list.push(entry);
    this.history.set(packageName, list);
  }

  private async persistLocationRate(
    packageName: string,
    locationRate: string | null,
  ): Promise<UserI | null> {
    try {
      const user = await User.findOne({ email: this.userSession.userId });
      if (!user) return null;

      const sanitizedPackageName = MongoSanitizer.sanitizeKey(packageName);
      if (!user.locationSubscriptions) {
        // @ts-ignore - mongoose map
        user.locationSubscriptions = new Map();
      }
      if (locationRate) {
        user.locationSubscriptions.set(sanitizedPackageName, {
          rate: locationRate,
        });
      } else {
        if (user.locationSubscriptions.has(sanitizedPackageName)) {
          user.locationSubscriptions.delete(sanitizedPackageName);
        }
      }
      user.markModified("locationSubscriptions");
      await user.save();
      return user;
    } catch (error) {
      const logger = this.logger.child({ packageName });
      logger.error(error, "Error persisting location rate");
      return null;
    }
  }

  private getTranscriptionSubscriptions(): ExtendedStreamType[] {
    const subs: ExtendedStreamType[] = [];
    for (const set of this.subscriptions.values()) {
      for (const sub of set) {
        if (
          typeof sub === "string" &&
          sub.includes("transcription") &&
          !sub.includes("translation")
        ) {
          subs.push(sub);
        }
      }
    }
    return subs;
  }

  private getTranslationSubscriptions(): ExtendedStreamType[] {
    const subs: ExtendedStreamType[] = [];
    for (const set of this.subscriptions.values()) {
      for (const sub of set) {
        if (typeof sub === "string" && sub.includes("translation")) {
          subs.push(sub);
        }
      }
    }
    return subs;
  }

  private async syncManagers(): Promise<void> {
    try {
      const transcriptionSubs = this.getTranscriptionSubscriptions();
      await this.userSession.transcriptionManager.updateSubscriptions(
        transcriptionSubs,
      );
      const translationSubs = this.getTranslationSubscriptions();
      await this.userSession.translationManager.updateSubscriptions(
        translationSubs,
      );

      await Promise.all([
        this.userSession.transcriptionManager.ensureStreamsExist(),
        this.userSession.translationManager.ensureStreamsExist(),
      ]);
    } catch (error) {
      const logger = this.logger.child({ userId: this.userSession.userId });
      logger.error(error, "Error syncing managers with subscriptions");
    }
  }

  /**
   * Apply delta between old and new subscription sets to cached aggregates
   */
  private applyDelta(
    packageName: string,
    oldSet: Set<ExtendedStreamType>,
    newSet: Set<ExtendedStreamType>,
  ): void {
    // Removals
    for (const sub of oldSet) {
      if (!newSet.has(sub)) {
        this.applySingle(sub, /*isAdd*/ false);
      }
    }
    // Additions
    for (const sub of newSet) {
      if (!oldSet.has(sub)) {
        this.applySingle(sub, /*isAdd*/ true);
      }
    }
  }

  /**
   * Apply a single subscription add/remove to cached aggregates
   */
  private applySingle(sub: ExtendedStreamType, isAdd: boolean): void {
    // PCM stream
    if (sub === StreamType.AUDIO_CHUNK) {
      this.pcmSubscriptionCount += isAdd ? 1 : -1;
      if (this.pcmSubscriptionCount < 0) this.pcmSubscriptionCount = 0;
      return;
    }

    // Direct transcription/translation
    if (sub === StreamType.TRANSCRIPTION || sub === StreamType.TRANSLATION) {
      this.transcriptionLikeSubscriptionCount += isAdd ? 1 : -1;
      if (this.transcriptionLikeSubscriptionCount < 0)
        this.transcriptionLikeSubscriptionCount = 0;
      return;
    }

    // Language-specific streams
    if (isLanguageStream(sub)) {
      const langInfo = parseLanguageStream(sub as string);
      if (
        langInfo &&
        (langInfo.type === StreamType.TRANSCRIPTION ||
          langInfo.type === StreamType.TRANSLATION)
      ) {
        this.transcriptionLikeSubscriptionCount += isAdd ? 1 : -1;
        if (this.transcriptionLikeSubscriptionCount < 0)
          this.transcriptionLikeSubscriptionCount = 0;
      }
      const prev = this.languageStreamCounts.get(sub) || 0;
      const next = prev + (isAdd ? 1 : -1);
      if (next <= 0) this.languageStreamCounts.delete(sub);
      else this.languageStreamCounts.set(sub, next);
      return;
    }
  }
}

export default SubscriptionManager;
