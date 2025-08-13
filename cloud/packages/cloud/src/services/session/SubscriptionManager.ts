import {
  StreamType,
  ExtendedStreamType,
  isLanguageStream,
  parseLanguageStream,
  createTranscriptionStream,
  SubscriptionRequest,
} from '@mentra/sdk';
import { logger as rootLogger } from '../logging/pino-logger';
import UserSession from './UserSession';
import App from '../../models/app.model';
import { SimplePermissionChecker } from '../permissions/simple-permission-checker';
import { User, UserI } from '../../models/user.model';
import { MongoSanitizer } from '../../utils/mongoSanitizer';

const logger = rootLogger.child({ service: 'SubscriptionManager' });

export class SubscriptionManager {
  private readonly userSession: UserSession;

  // Map of packageName -> Set of subscriptions
  private subscriptions: Map<string, Set<ExtendedStreamType>> = new Map();

  // History per app for debugging/restore
  private history: Map<string, { timestamp: Date; subscriptions: ExtendedStreamType[]; action: 'add' | 'remove' | 'update' }[]> =
    new Map();

  // Calendar cache (session-scoped)
  private calendarEventsCache: Array<any> = [];

  // Track app reconnect timestamps for empty-subscription grace handling
  private lastAppReconnectAt: Map<string, number> = new Map();
  private readonly CONNECT_GRACE_MS = 3000; // 3 seconds

  constructor(userSession: UserSession) {
    this.userSession = userSession;
    logger.info({ userId: userSession.userId }, 'SubscriptionManager initialized');
  }

  // ===== Public API =====

  markAppReconnected(packageName: string): void {
    this.lastAppReconnectAt.set(packageName, Date.now());
  }

  getAppSubscriptions(packageName: string): ExtendedStreamType[] {
    const subs = this.subscriptions.get(packageName);
    const result = subs ? Array.from(subs) : [];
    logger.debug({ userId: this.userSession.userId, packageName, subscriptions: result }, 'Retrieved app subscriptions');
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
        if (sub === target || sub === ('augmentos:*' as any) || sub === ('augmentos:all' as any)) {
          subscribed.push(packageName);
          break;
        }
      }
    }
    logger.info({ userId: this.userSession.userId, settingKey, subscribed }, 'AugmentOS setting subscription results');
    return subscribed;
  }

  getMinimalLanguageSubscriptions(): ExtendedStreamType[] {
    const languageSet = new Set<ExtendedStreamType>();
    for (const subs of this.subscriptions.values()) {
      for (const sub of subs) {
        if (isLanguageStream(sub)) {
          languageSet.add(sub);
        }
      }
    }
    return Array.from(languageSet);
  }

  hasPCMTranscriptionSubscriptions(): { hasMedia: boolean; hasPCM: boolean; hasTranscription: boolean } {
    let hasMedia = false;
    let hasPCM = false;
    let hasTranscription = false;
    for (const subs of this.subscriptions.values()) {
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
    return { hasMedia, hasPCM, hasTranscription };
  }

  cacheCalendarEvent(event: any): void {
    this.calendarEventsCache.push(event);
    logger.info({ userId: this.userSession.userId, count: this.calendarEventsCache.length }, 'Cached calendar event');
  }

  getAllCalendarEvents(): any[] {
    return [...this.calendarEventsCache];
  }

  async updateSubscriptions(
    packageName: string,
    subscriptions: SubscriptionRequest[],
  ): Promise<UserI | null> {
    const now = Date.now();
    const lastReconnect = this.lastAppReconnectAt.get(packageName) || 0;

    // Process incoming subscriptions array (strings and special location objects)
    const streamSubscriptions: ExtendedStreamType[] = [];
    let locationRate: string | null = null;
    for (const sub of subscriptions) {
      if (
        typeof sub === 'object' &&
        sub !== null &&
        'stream' in sub &&
        (sub as any).stream === StreamType.LOCATION_STREAM
      ) {
        locationRate = (sub as any).rate || null;
        streamSubscriptions.push(StreamType.LOCATION_STREAM);
      } else if (typeof sub === 'string') {
        streamSubscriptions.push(sub as ExtendedStreamType);
      }
    }

    const processed: ExtendedStreamType[] = streamSubscriptions.map((sub) =>
      sub === StreamType.TRANSCRIPTION ? createTranscriptionStream('en-US') : sub,
    );

    // Reconnect grace: ignore empty subs right after reconnect
    if (processed.length === 0 && now - lastReconnect <= this.CONNECT_GRACE_MS) {
      logger.warn(
        { userId: this.userSession.userId, packageName },
        'Ignoring empty subscription update within reconnect grace window',
      );
      return await this.persistLocationRate(packageName, locationRate);
    }

    // Validate permissions (best-effort)
    try {
      const app = await App.findOne({ packageName });
      if (app) {
        const { allowed, rejected } = SimplePermissionChecker.filterSubscriptions(
          app,
          processed,
        );
        if (rejected.length > 0) {
          logger.warn(
            { userId: this.userSession.userId, packageName, rejectedCount: rejected.length },
            'Rejected subscriptions due to missing permissions',
          );
        }
        // use allowed if any rejected
        processed.length = 0;
        processed.push(...allowed);
      }
    } catch (error) {
      logger.error({ error, packageName }, 'Error validating subscriptions; continuing');
    }

    // Update in-memory map
    this.subscriptions.set(packageName, new Set(processed));
    this.addHistory(packageName, { timestamp: new Date(), subscriptions: [...processed], action: 'update' });

    logger.info(
      {
        userId: this.userSession.userId,
        packageName,
        processedSubscriptions: processed,
      },
      'Updated subscriptions successfully',
    );

    // Sync managers and mic
    await this.syncManagers();
    this.userSession.microphoneManager?.handleSubscriptionChange();

    // Persist location rate setting for this app
    return await this.persistLocationRate(packageName, locationRate);
  }

  async removeSubscriptions(packageName: string): Promise<UserI | null> {
    const existing = this.subscriptions.get(packageName);
    if (existing) {
      this.addHistory(packageName, {
        timestamp: new Date(),
        subscriptions: Array.from(existing),
        action: 'remove',
      });
      this.subscriptions.delete(packageName);
      logger.info(
        { userId: this.userSession.userId, packageName },
        'Removed in-memory subscriptions for app',
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
          user.markModified('locationSubscriptions');
          await user.save();
        }
        return user;
      }
    } catch (error) {
      logger.error({ error, packageName }, 'Error removing location subscription from DB');
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
    entry: { timestamp: Date; subscriptions: ExtendedStreamType[]; action: 'add' | 'remove' | 'update' },
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
        user.locationSubscriptions.set(sanitizedPackageName, { rate: locationRate });
      } else {
        if (user.locationSubscriptions.has(sanitizedPackageName)) {
          user.locationSubscriptions.delete(sanitizedPackageName);
        }
      }
      user.markModified('locationSubscriptions');
      await user.save();
      return user;
    } catch (error) {
      logger.error({ error, packageName }, 'Error persisting location rate');
      return null;
    }
  }

  private getTranscriptionSubscriptions(): ExtendedStreamType[] {
    const subs: ExtendedStreamType[] = [];
    for (const set of this.subscriptions.values()) {
      for (const sub of set) {
        if (typeof sub === 'string' && sub.includes('transcription') && !sub.includes('translation')) {
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
        if (typeof sub === 'string' && sub.includes('translation')) {
          subs.push(sub);
        }
      }
    }
    return subs;
  }

  private async syncManagers(): Promise<void> {
    try {
      const transcriptionSubs = this.getTranscriptionSubscriptions();
      await this.userSession.transcriptionManager.updateSubscriptions(transcriptionSubs);
      const translationSubs = this.getTranslationSubscriptions();
      await this.userSession.translationManager.updateSubscriptions(translationSubs);

      await Promise.all([
        this.userSession.transcriptionManager.ensureStreamsExist(),
        this.userSession.translationManager.ensureStreamsExist(),
      ]);
    } catch (error) {
      logger.error({ error, userId: this.userSession.userId }, 'Error syncing managers with subscriptions');
    }
  }
}

export default SubscriptionManager;
