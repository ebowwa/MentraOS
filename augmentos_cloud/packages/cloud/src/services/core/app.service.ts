/**
 * @fileoverview Service for managing TPAs (Third Party Applications).
 * Handles app lifecycle, authentication, and webhook interactions.
 * 
 * Currently uses in-memory storage with hardcoded system TPAs.
 * Design decision: Separate system TPAs from user-created TPAs
 * to maintain core functionality regardless of database state.
 */

import { AppI, StopWebhookRequest, TpaType, WebhookResponse, AppState } from '@augmentos/sdk';
import axios, { AxiosError } from 'axios';
import { systemApps } from '@augmentos/config';
import App from '../../models/app.model';
import { User } from '../../models/user.model';
import crypto from 'crypto';


const APPSTORE_ENABLED = true;

/**
 * System TPAs that are always available.
 * These are core applications provided by the platform.
 * @Param developerId - leaving this undefined indicates a system app.
 */
export const LOCAL_APPS: AppI[] = [
  {
    packageName: systemApps.captions.packageName,
    name: systemApps.captions.name,
    tpaType: TpaType.STANDARD,
    webhookURL: `http://${systemApps.captions.host}/webhook`,
    logoURL: `https://cloud.augmentos.org/${systemApps.captions.packageName}.png`,
    description: systemApps.captions.description
  },
  {
    packageName: systemApps.notify.packageName,
    name: systemApps.notify.name,
    tpaType: TpaType.BACKGROUND,
    webhookURL: `http://${systemApps.notify.host}/webhook`,
    logoURL: `https://cloud.augmentos.org/${systemApps.notify.packageName}.png`,
    description: systemApps.notify.description,
  },
  {
    packageName: systemApps.mira.packageName,
    name: systemApps.mira.name,
    tpaType: TpaType.BACKGROUND,
    webhookURL: `http://${systemApps.mira.host}/webhook`,
    logoURL: `https://cloud.augmentos.org/${systemApps.mira.packageName}.png`,
    description: systemApps.mira.description,
  },
  {
    packageName: systemApps.merge.packageName,
    name: systemApps.merge.name,
    tpaType: TpaType.BACKGROUND,
    webhookURL: `http://${systemApps.merge.host}/webhook`,
    logoURL: `https://cloud.augmentos.org/${systemApps.merge.packageName}.png`,
    description: "Proactive AI that helps you during conversations. Turn it on, have a conversation, and let Merge agents enhance your convo.",
  },
  {
    packageName: systemApps.liveTranslation.packageName,
    name: systemApps.liveTranslation.name,
    tpaType: TpaType.STANDARD,
    webhookURL: `http://${systemApps.liveTranslation.host}/webhook`,
    logoURL: `https://cloud.augmentos.org/${systemApps.liveTranslation.packageName}.png`,
    description: systemApps.liveTranslation.description,
  },
  // {
  //   packageName: systemApps.teleprompter.packageName,
  //   name: "Teleprompt",
  //   tpaType: TpaType.STANDARD,
  //   webhookURL: `http://${systemApps.teleprompter.host}/webhook`,
  //   logoURL: `https://cloud.augmentos.org/${systemApps.teleprompter.packageName}.png`,
  //   description: systemApps.teleprompter.description,
  // }
];

// if we are not in production, add the dashboard to the app 
if (process.env.NODE_ENV !== 'production') {
  LOCAL_APPS.push({
    packageName: systemApps.flash.packageName,
    name: "Navigation",
    description: systemApps.flash.description,
    tpaType: TpaType.BACKGROUND,
    webhookURL: `http://${systemApps.flash.host}/webhook`,
    logoURL: `https://cloud.augmentos.org/${systemApps.flash.packageName}.png`,
  });
  LOCAL_APPS.push({
    packageName: "com.augmentos.screenmirror",
    name: "Screen Mirror",
    description: systemApps.flash.description,
    tpaType: TpaType.BACKGROUND,
    webhookURL: `http://${systemApps.flash.host}/webhook`,
    logoURL: `https://cloud.augmentos.org/${systemApps.flash.packageName}.png`,
  });
}

/**
 * System TPAs that are always available.
 * These are core applications provided by the platform.
 * @Param developerId - leaving this undefined indicates a system app.
 */
export const SYSTEM_TPAS: AppI[] = [
  {
    packageName: systemApps.dashboard.packageName,
    name: systemApps.dashboard.name,
    tpaType: TpaType.BACKGROUND,
    description: "The time, The news, The weather, The notifications, The everything. 😎🌍🚀",
    webhookURL: `http:/${systemApps.dashboard.host}/webhook`,
    logoURL: `https://cloud.augmentos.org/${systemApps.dashboard.packageName}.png`,
  },
];

/**
 * Interface for webhook payloads sent to TPAs.
 */
interface WebhookPayload {
  type: 'session_request' | 'app_update' | 'system_event';
  sessionId?: string;
  userId?: string;
  timestamp: string;
  data?: any;
}

/**
 * Implementation of the app management service.
 * Design decisions:
 * 1. Separate system and user TPAs
 * 2. Immutable system TPA list
 * 3. Webhook retry logic
 * 4. API key validation
 */
export class AppService {
  // In-memory cache for app states
  // Map of userId to Map of packageName to AppState
  private appStates = new Map<string, Map<string, AppState>>();

  /**
   * Gets all available TPAs, both system and user-created.
   * @returns Promise resolving to array of all apps
   */
  async getAllApps(userId?: string): Promise<AppI[]> {
    const usersApps: AppI[] = [];

    if (APPSTORE_ENABLED && userId) {
      // Find apps the developer made.
      const _madeByUser = await App.find({ developerId: userId }) as AppI[];

      // Find apps the user installed.
      const user = await User.findOne({ email: userId });
      const _installedApps = user?.installedApps?.map((installedApp: { packageName: string; installedDate: Date; }) => {
        return installedApp.packageName;
      }) || [];

      // Fetch the apps from the appstore.
      const _appstoreApps = await App.find({ packageName: { $in: _installedApps } }) as AppI[];

      // remove duplicates.
      const _allApps = [..._madeByUser, ..._appstoreApps];
      const _appMap = new Map<string, AppI>();
      _allApps.forEach(app => {
        _appMap.set(app.packageName, app);
      }
      );
      usersApps.push(..._appMap.values());
    }
    const allApps = [...LOCAL_APPS, ...usersApps];
    return allApps;
  }

  // /**
  //  * Gets available system TPAs.
  //  * @returns array of system apps.
  //  */
  getSystemApps(): AppI[] {
    return SYSTEM_TPAS;
  }

  /**
   * Gets a specific TPA by ID.
   * @param packageName - TPA identifier
   * @returns Promise resolving to app if found
   */
  async getApp(packageName: string): Promise<AppI | undefined> {
    // return [...SYSTEM_TPAS, ...APP_STORE].find(app => app.packageName === packageName);
    let app: AppI | undefined = [...SYSTEM_TPAS, ...LOCAL_APPS].find(app => app.packageName === packageName);
    // if we can't find the app, try checking the appstore via the App Mongodb model.

    if (APPSTORE_ENABLED) {
      if (!app) {
        app = await App.findOne({
          packageName: packageName
        }) as AppI;
      }
    }

    return app;
  }

  async findFromAppStore(packageName: string): Promise<AppI | undefined> {
    const app = await App.findOne({
      packageName: packageName
    }) as AppI;
    return app;
  }

  /**
   * Triggers a webhook for a TPA.
   * @param url - Webhook URL
   * @param payload - Data to send
   * @throws If webhook fails after retries
   */
  async triggerWebhook(url: string, payload: WebhookPayload): Promise<void> {
    const maxRetries = 2;
    const baseDelay = 1000; // 1 second

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await axios.post(url, payload, {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 10000 // Increase timeout to 10 seconds
        });
        return;
      } catch (error: unknown) {
        if (attempt === maxRetries - 1) {
          if (axios.isAxiosError(error)) {
            console.error(`Webhook failed: ${error}`);
            console.error(`URL: ${url}`);
            console.error(`Response: ${error.response?.data}`);
            console.error(`Status: ${error.response?.status}`);
          }
          throw new Error(`Webhook failed after ${maxRetries} attempts: ${(error as AxiosError).message || 'Unknown error'}`);
        }
        // Exponential backoff
        await new Promise(resolve =>
          setTimeout(resolve, baseDelay * Math.pow(2, attempt))
        );
      }
    }
  }

  /**
 * Triggers the stop webhook for a TPA app session.
 * @param url - Stop Webhook URL
 * @param payload - Data to send
 * @throws If stop webhook fails
 */
  async triggerStopWebhook(webhookUrl: string, payload: StopWebhookRequest): Promise<{
    status: number;
    data: WebhookResponse;
  }> {
    const response = await axios.post(`${webhookUrl}/stop`, payload);
    return {
      status: response.status,
      data: response.data
    };
  }

  /**
   * Validates a TPA's API key.
   * @param packageName - TPA identifier
   * @param apiKey - API key to validate
   * @returns Promise resolving to validation result
   */
  async validateApiKey(packageName: string, apiKey: string): Promise<boolean> {
    const app = await this.getApp(packageName);
    if (!app) return false;

    // TODO: Implement proper API key validation
    // For now, accept all keys for development
    return true;
  }

  /**
   * Gets the current state of a TPA for a user.
   * @param packageName - TPA identifier
   * @param userId - User identifier
   * @returns Promise resolving to app state
   */
  async getAppState(packageName: string, userId: string): Promise<AppState> {
    const userStates = this.appStates.get(userId) || new Map<string, AppState>();

    // Return existing state or default to not_installed
    return userStates.get(packageName) || AppState.NOT_INSTALLED;
  }

  /**
   * Create a new app
   */
  async createApp(appData: any, developerId: string): Promise<{ app: AppI, apiKey: string }> {
    // Generate API key
    const apiKey = crypto.randomBytes(32).toString('hex');
    const hashedApiKey = this.hashApiKey(apiKey);

    // Create app
    const app = await App.create({
      ...appData,
      developerId,
      hashedApiKey
    });

    return { app, apiKey };
  }


  /**
   * Update an app
   */
  async updateApp(packageName: string, appData: any, developerId: string): Promise<AppI> {
    // Ensure developer owns the app
    const app = await App.findOne({ packageName });

    if (!app) {
      throw new Error(`App with package name ${packageName} not found`);
    }

    if (!developerId) {
      throw new Error('Developer ID is required');
    }

    if (!app.developerId) {
      throw new Error('Developer ID not found for this app');
    }

    if (app.developerId.toString() !== developerId) {
      throw new Error('You do not have permission to update this app');
    }

    // Update app
    const updatedApp = await App.findOneAndUpdate(
      { packageName },
      { $set: appData },
      { new: true }
    );

    return updatedApp!;
  }

  /**
   * Delete an app
   */
  async deleteApp(packageName: string, developerId: string): Promise<void> {
    // Ensure developer owns the app
    const app = await App.findOne({ packageName });

    if (!app) {
      throw new Error(`App with package name ${packageName} not found`);
    }

    if (!developerId) {
      throw new Error('Developer ID is required');
    }

    if (!app.developerId) {
      throw new Error('Developer ID not found for this app');
    }


    if (app.developerId.toString() !== developerId) {
      throw new Error('You do not have permission to delete this app');
    }

    await App.findOneAndDelete({ packageName });
  }

  /**
   * Regenerate API key for an app
   */
  async regenerateApiKey(packageName: string, developerId: string): Promise<string> {
    // Ensure developer owns the app
    const app = await App.findOne({ packageName });

    if (!app) {
      throw new Error(`App with package name ${packageName} not found`);
    }

    if (!developerId) {
      throw new Error('Developer ID is required');
    }

    if (!app.developerId) {
      throw new Error('Developer ID not found for this app');
    }

    if (app.developerId.toString() !== developerId) {
      throw new Error('You do not have permission to update this app');
    }

    // Generate new API key
    const apiKey = crypto.randomBytes(32).toString('hex');
    const hashedApiKey = this.hashApiKey(apiKey);

    // Update app with new hashed API key
    await App.findOneAndUpdate(
      { packageName },
      { $set: { hashedApiKey } }
    );

    return apiKey;
  }

  /**
   * Hash API key
   */
  hashApiKey(apiKey: string): string {
    return crypto.createHash('sha256').update(apiKey).digest('hex');
  }


  /**
   * Get apps by developer ID
   */
  async getAppsByDeveloperId(developerId: string): Promise<AppI[]> {
    return App.find({ developerId }).lean();
  }

  /**
   * Get app by package name
   */
  async getAppByPackageName(packageName: string, developerId?: string): Promise<AppI | null> {
    const query: any = { packageName };

    // If developerId is provided, ensure the app belongs to this developer
    if (developerId) {
      query.developerId = developerId;
    }

    return App.findOne(query).lean();
  }

  /**
   * Get public apps
   * TODO: DELETE THIS?
   */
  // export async function getPublicApps(developerEmail?: string): Promise<AppI[]> {
  async getPublicApps(): Promise<AppI[]> {
    // console.log('Getting public apps - developerEmail', developerEmail);
    // if (developerEmail) {
    //   const developer
    //     = await User.findOne({ email: developerEmail }).lean();
    //   if (!developer) {
    //     return App.find({ isPublic: true }).lean();
    //   }
    //   else {
    //     // Find all public apps, or apps by the developer.
    //     return App.find({ $or: [{ isPublic: true }, { developerId: developer.email}] }).lean();
    //   }
    // }
    return App.find({ isPublic: true }).lean();
    // return App.find();
  }

  /**
   * Get all available apps
   */
  async getAvailableApps(): Promise<AppI[]> {
    return App.find();
  }


}

// Create singleton instance
export const appService = new AppService();
console.log('✅ App Service');

export default appService;