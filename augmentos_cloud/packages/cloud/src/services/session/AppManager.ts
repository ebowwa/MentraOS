/**
 * @fileoverview AppManager manages app lifecycle and TPA connections within a user session.
 * It encapsulates all app-related functionality that was previously
 * scattered throughout the session and WebSocket services.
 * 
 * This follows the pattern used by other managers like MicrophoneManager and DisplayManager.
 */

import WebSocket from 'ws';
import {
  CloudToTpaMessageType,
  CloudToGlassesMessageType,
  TpaConnectionInit,
  AppStateChange,
  AppI,
  WebhookRequestType,
  SessionWebhookRequest
} from '@augmentos/sdk';
import { Logger } from 'pino';
import subscriptionService from './subscription.service';
import appService from '../core/app.service';
import * as developerService from '../core/developer.service';
import { PosthogService } from '../logging/posthog.service';
import UserSession from './UserSession';
import { User } from '../../models/user.model';
import { logger as rootLogger } from '../logging/pino-logger';
import sessionService from './session.service';
import axios, { AxiosError } from 'axios';
import { GlassesErrorCode } from '../websocket/websocket-glasses.service';

const logger = rootLogger.child({ service: 'AppManager' });

const CLOUD_PUBLIC_HOST_NAME = process.env.CLOUD_PUBLIC_HOST_NAME; // e.g., "prod.augmentos.cloud"
const CLOUD_LOCAL_HOST_NAME = process.env.CLOUD_LOCAL_HOST_NAME; // e.g., "localhost:8002" | "cloud" | "cloud-debug-cloud.default.svc.cluster.local:80"
const AUGMENTOS_AUTH_JWT_SECRET = process.env.AUGMENTOS_AUTH_JWT_SECRET;

const TPA_SESSION_TIMEOUT_MS = 5000;  // 5 seconds

if (!CLOUD_PUBLIC_HOST_NAME) {
  logger.error("CLOUD_PUBLIC_HOST_NAME is not set. Please set it in your environment variables.");
}

if (!CLOUD_LOCAL_HOST_NAME) {
  logger.error("CLOUD_LOCAL_HOST_NAME is not set. Please set it in your environment variables.");
}

if (!AUGMENTOS_AUTH_JWT_SECRET) {
  logger.error("AUGMENTOS_AUTH_JWT_SECRET is not set. Please set it in your environment variables.");
}


/**
 * Manages app lifecycle and TPA connections for a user session
 */
export class AppManager {
  private userSession: UserSession;
  private logger: Logger;

  // Cache of installed apps
  // private installedApps: AppI[] = [];

  constructor(userSession: UserSession) {
    this.userSession = userSession;
    this.logger = userSession.logger.child({ component: 'AppManager' });
    this.logger.info('AppManager initialized');
  }

  /**
   * 🚀🪝 Initiates a new TPA session and triggers the TPA's webhook.
   * @param packageName - TPA identifier
   * @throws Error if app not found or webhook fails
   */
  async startApp(packageName: string): Promise<void> {
    // check if it's already loading or running, if so return the session id.
    if (this.userSession.loadingApps.has(packageName) || this.userSession.runningApps.has(packageName)) {
      this.logger.info({
        loadingApps: this.userSession.loadingApps,
        runningApps: this.userSession.runningApps,
        packageName,
      },
        `App ${packageName} already loading or running`);
      return;
    }

    // TODO(isaiah): Test if we can use the installedApps cache instead of fetching from DB
    const app = await appService.getApp(packageName);
    if (!app) {
      this.logger.error({ packageName }, `App ${packageName} not found`);
      throw new Error(`App ${packageName} not found`);
    }

    this.logger.info({ packageName }, `⚡️ Loading app ${packageName} for user ${this.userSession.userId}`);
    this.userSession.loadingApps.add(packageName);
    this.logger.debug({ loadingApps: this.userSession.loadingApps }, 'Current Loading Apps');

    try {
      // Trigger TPA webhook 
      const { packageName, name, publicUrl } = app;
      this.logger.debug({ packageName, name, publicUrl }, `Triggering TPA webhook for ${packageName} for user ${this.userSession.userId}`);

      // Set up the websocket URL for the TPA connection
      let augmentOSWebsocketUrl = '';

      // Determine the appropriate WebSocket URL based on the environment and app type
      if (app.isSystemApp) {
        // For system apps in container environments, use internal service name
        if (process.env.CONTAINER_ENVIRONMENT === 'true' ||
          process.env.CLOUD_HOST_NAME === 'cloud' ||
          process.env.PORTER_APP_NAME) {

          // Porter environment (Kubernetes)
          if (process.env.PORTER_APP_NAME) {
            augmentOSWebsocketUrl = `ws://${process.env.PORTER_APP_NAME}-cloud.default.svc.cluster.local:80/tpa-ws`;
            this.logger.info(`Using Porter internal URL for system app ${packageName}`);
          } else {
            // Docker Compose environment
            augmentOSWebsocketUrl = 'ws://cloud/tpa-ws';
            this.logger.info(`Using Docker internal URL for system app ${packageName}`);
          }
        } else {
          // Local development for system apps
          augmentOSWebsocketUrl = 'ws://localhost:8002/tpa-ws';
          this.logger.info(`Using local URL for system app ${packageName}`);
        }
      } else {
        // For non-system apps, use the public host
        augmentOSWebsocketUrl = `wss://${CLOUD_PUBLIC_HOST_NAME}/tpa-ws`;
        this.logger.info({ augmentOSWebsocketUrl, packageName, name }, `Using public URL for app ${packageName}`);
      }

      this.logger.info(`Server WebSocket URL: ${augmentOSWebsocketUrl}`);
      // Construct the webhook URL from the app's public URL
      const webhookURL = `${app.publicUrl}/webhook`;
      this.logger.info(`[websocket.service]: Start Session webhook URL: ${webhookURL}`);
      await this.triggerWebhook(webhookURL, {
        type: WebhookRequestType.SESSION_REQUEST,
        sessionId: this.userSession.userId + '-' + packageName,
        userId: this.userSession.userId,
        timestamp: new Date().toISOString(),
        augmentOSWebsocketUrl,
      });

      // Trigger boot screen.
      this.userSession.displayManager.handleAppStart(app.packageName);

      // Set timeout to clean up pending session
      setTimeout(() => {
        if (this.userSession.loadingApps.has(packageName)) {
          this.userSession.loadingApps.delete(packageName);
          this.logger.info({ packageName }, `👴🏻 TPA ${packageName} expired without connection`);

          // Clean up boot screen.
          this.userSession.displayManager.handleAppStop(app.packageName);
        }
      }, TPA_SESSION_TIMEOUT_MS);

      // Add the app to active sessions after successfully starting it
      this.userSession.runningApps.add(packageName);

      // Remove from loading apps after successfully starting
      this.userSession.loadingApps.delete(packageName);
      this.logger.info(`[websocket.service]: Successfully started app ${packageName}`);

      // TODO: we can get and cache the user model from the database and store in userSession so no need for db call every time.
      // and the addRunningApp method can be called without await to avoid blocking the process.
      // Update database
      try {
        const user = await User.findByEmail(this.userSession.userId);
        if (user) {
          await user.addRunningApp(packageName);
        }
      } catch (error) {
        this.logger.error(`Error updating user's running apps:`, error);
      }

      // Check if we need to update microphone state for media subscriptions
      if (this.userSession.websocket && this.userSession.websocket.readyState === 1) {
        // Send explicit app_started message
        const appStartedMessage = {
          type: 'app_started',
          packageName,
          timestamp: new Date(),
        };
        this.userSession.websocket.send(JSON.stringify(appStartedMessage));
        this.userSession.microphoneManager.handleSubscriptionChange();
      }

      return;
    } catch (error) {
      this.logger.error(error, `Error starting app ${packageName} for user ${this.userSession.userId}`);
      this.userSession.loadingApps.delete(packageName);
      this.userSession.sendError(GlassesErrorCode.INTERNAL_ERROR, `Error starting app ${packageName}: ${app.name}`);
      // throw error;
    }
  }


  /**
   * Triggers a webhook for a TPA.
   * @param url - Webhook URL
   * @param payload - Data to send
   * @throws If webhook fails after retries
   */
  private async triggerWebhook(url: string, payload: SessionWebhookRequest): Promise<void> {
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
            // Enrich the error with context for better debugging
            const enrichedError = Object.assign(error, {
              packageName: payload.sessionId.split('-')[1],
              webhookUrl: url,
              attempts: maxRetries,
              timeout: 10000,
              operation: 'triggerWebhook',
              userId: payload.userId,
              payloadType: payload.type
            });
            this.logger.error(enrichedError, `Webhook failed after ${maxRetries} attempts`);
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
   * Stop an app by package name
   * 
   * @param packageName Package name of the app to stop
   */
  async stopApp(packageName: string): Promise<void> {
    try {
      if (!this.isAppRunning(packageName)) {
        this.logger.info(`App ${packageName} not running, ignoring stop request`);
        return;
      }

      this.logger.info(`Stopping app ${packageName}`);

      // Remove from active app sessions
      this.userSession.runningApps.delete(packageName);

      // Remove from loading apps if present
      this.userSession.loadingApps.delete(packageName);

      // Trigger app stop webhook
      try {
        // TODO(isaiah): Move logic to stop app out of appService and into this class.
        await appService.triggerStopByPackageName(packageName, this.userSession.userId);
      } catch (webhookError) {
        this.logger.error(`Error triggering stop webhook for ${packageName}:`, webhookError);
      }

      // Remove subscriptions.
      try {
        subscriptionService.removeSubscriptions(this.userSession, packageName);
      } catch (error) {
        this.logger.error(`Error removing subscriptions for ${packageName}:`, error);
      }

      // Broadcast app state change
      await this.broadcastAppState();

      // Close WebSocket connection if exists
      const appWebsocket = this.userSession.appWebsockets.get(packageName);
      if (appWebsocket && appWebsocket.readyState === WebSocket.OPEN) {
        try {
          // Send app stopped message
          const message = {
            type: CloudToTpaMessageType.APP_STOPPED,
            timestamp: new Date()
          };
          appWebsocket.send(JSON.stringify(message));

          // Close the connection
          appWebsocket.close(1000, 'App stopped');
        } catch (error) {
          this.logger.error({ error }, `Error closing connection for ${packageName}`);
        }
      }

      // Update user's running apps in database
      try {
        const user = await User.findByEmail(this.userSession.userId);
        if (user) {
          await user.removeRunningApp(packageName);
        }
      } catch (error) {
        this.userSession.logger.error({ error }, `Error updating user's running apps`);
      }

      // Remove from app connections
      this.userSession.appWebsockets.delete(packageName);

    } catch (error) {
      this.logger.error(`Error stopping app ${packageName}:`, error);
    }
  }

  /**
   * Check if an app is currently running
   * 
   * @param packageName Package name to check
   * @returns Whether the app is running
   */
  isAppRunning(packageName: string): boolean {
    return this.userSession.runningApps.has(packageName);
  }

  /**
   * Handle TPA initialization
   * 
   * @param ws WebSocket connection
   * @param initMessage TPA initialization message
   */
  async handleTpaInit(ws: WebSocket, initMessage: TpaConnectionInit): Promise<void> {
    try {
      const { packageName, apiKey, sessionId } = initMessage;

      // Validate the API key
      const isValidApiKey = await developerService.validateApiKey(packageName, apiKey, this.userSession);

      if (!isValidApiKey) {
        this.logger.error(`Invalid API key for TPA ${packageName}`);

        try {
          ws.send(JSON.stringify({
            type: CloudToTpaMessageType.CONNECTION_ERROR,
            code: 'INVALID_API_KEY',
            message: 'Invalid API key',
            timestamp: new Date()
          }));

          ws.close(1008, 'Invalid API key');
        } catch (sendError) {
          this.logger.error(`Error sending auth error to TPA ${packageName}:`, sendError);
        }

        return;
      }

      // Check if app is in loading state
      if (!this.userSession.loadingApps.has(packageName) && !this.userSession.runningApps.has(packageName)) {
        this.logger.error({ packageName }, `App ${packageName} not in loading or active state for session ${this.userSession.userId}`);
        try {
          ws.send(JSON.stringify({
            type: CloudToTpaMessageType.CONNECTION_ERROR,
            code: 'APP_NOT_STARTED',
            message: 'App not started for this session',
            timestamp: new Date()
          }));
        } catch (sendError) {
          this.logger.error(`Error sending app not started error to TPA ${packageName}:`, sendError);
        }
        ws.close(1008, 'App not started for this session');
        return;
      }

      // Store the WebSocket connection
      this.userSession.appWebsockets.set(packageName, ws);

      // Add to active app sessions if not already present
      this.userSession.runningApps.add(packageName);

      // Remove from loading apps if present. // TODO(isaiah): make sure this is the right place to do this.
      this.userSession.loadingApps.delete(packageName);

      // Get app settings
      // const app = this.userSession.installedApps.find(app => app.packageName === packageName);
      const app = this.userSession.installedApps.get(packageName);

      // Send connection acknowledgment
      const ackMessage = {
        type: CloudToTpaMessageType.CONNECTION_ACK,
        sessionId: sessionId,
        settings: app?.settings || [],
        timestamp: new Date()
      };

      ws.send(JSON.stringify(ackMessage));

      // Log successful connection
      this.logger.info(`TPA ${packageName} connected to session ${this.userSession.sessionId}`);

      // Track connection in analytics
      PosthogService.trackEvent('tpa_connection', this.userSession.userId, {
        packageName,
        sessionId: this.userSession.sessionId,
        timestamp: new Date().toISOString()
      });

      // Broadcast app state change
      await this.broadcastAppState();

    } catch (error) {
      this.logger.error(`Error handling TPA init:`, error);

      try {
        ws.send(JSON.stringify({
          type: CloudToTpaMessageType.CONNECTION_ERROR,
          code: 'INTERNAL_ERROR',
          message: 'Internal server error',
          timestamp: new Date()
        }));

        ws.close(1011, 'Internal server error');
      } catch (sendError) {
        this.logger.error(`Error sending internal error to TPA:`, sendError);
      }
    }
  }

  /**
   * Broadcast app state to connected clients
   */
  async broadcastAppState(): Promise<AppStateChange | null> {
    try {
      // Refresh installed apps
      await this.refreshInstalledApps();

      // Transform session for client
      const clientSessionData = await sessionService.transformUserSessionForClient(this.userSession);

      // Create app state change message
      const appStateChange: AppStateChange = {
        type: CloudToGlassesMessageType.APP_STATE_CHANGE,
        sessionId: this.userSession.sessionId,
        userSession: clientSessionData,
        timestamp: new Date()
      };

      // Send to client
      if (!this.userSession.websocket || this.userSession.websocket.readyState !== WebSocket.OPEN) {
        this.logger.warn(`WebSocket is not open for client app state change`);
        return appStateChange;
      }

      this.userSession.websocket.send(JSON.stringify(appStateChange));
      this.logger.info({ appStateChange }, `Sent APP_STATE_CHANGE to ${this.userSession.userId}`);
      return appStateChange;
    } catch (error) {
      this.logger.error({ error }, `Error broadcasting app state for ${this.userSession.userId}`);
      return null;
    }
  }

  /**
   * Refresh the installed apps list
   */
  async refreshInstalledApps(): Promise<void> {
    try {
      // Fetch installed apps
      const installedAppsList = await appService.getAllApps(this.userSession.userId);
      const installedApps = new Map<string, AppI>();
      for (const app of installedAppsList) {
        installedApps.set(app.packageName, app);
      }
      this.logger.info({ installedAppsList: installedAppsList.map((app) => app.packageName) }, `Fetched ${installedApps.size} installed apps for ${this.userSession.userId}`);

      // Update session's installed apps
      this.userSession.installedApps = installedApps;

      this.logger.info(`Updated installed apps for ${this.userSession.userId}`);
    } catch (error) {
      this.logger.error(`Error refreshing installed apps:`, error);
    }
  }

  /**
   * Start all previously running apps
   */
  async startPreviouslyRunningApps(): Promise<void> {
    try {
      // Fetch previously running apps from database
      const user = await User.findOrCreateUser(this.userSession.userId);
      const previouslyRunningApps = user.runningApps;

      if (previouslyRunningApps.length === 0) {
        this.logger.info(`No previously running apps for ${this.userSession.userId}`);
        return;
      }

      this.logger.info(`Starting ${previouslyRunningApps.length} previously running apps for ${this.userSession.userId}`);

      // Start each app
      // Use Promise.all to start all apps concurrently
      const startedApps: string[] = [];

      await Promise.all(previouslyRunningApps.map(async (packageName) => {
        try {
          await this.startApp(packageName);
          startedApps.push(packageName);
        }
        catch (error) {
          this.logger.error(`Error starting previously running app ${packageName}:`, error);
          // Continue with other apps
        }
      }));
      this.logger.info({ previouslyRunningApps, startedApps }, `Started ${startedApps.length}/${previouslyRunningApps.length} previously running apps for ${this.userSession.userId}`);

    } catch (error) {
      this.logger.error(`Error starting previously running apps:`, error);
    }
  }

  /**
   * Handle app connection close
   * 
   * @param packageName Package name
   * @param code Close code
   * @param reason Close reason
   */
  async handleAppConnectionClosed(packageName: string, code: number, reason: string): Promise<void> {
    try {
      this.logger.info(`App connection closed for ${packageName}: ${code} - ${reason}`);

      // Remove from app connections
      this.userSession.appWebsockets.delete(packageName);

      // Don't automatically remove from active app sessions
      // The app may reconnect without losing its active status, if the reconnection is within the grace period

      // Clear any existing timer
      const existingTimer = this.userSession._reconnectionTimers.get(packageName);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      // Set new timer
      const reconnectionTimer = setTimeout(() => {
        this.logger.info(`Reconnection grace period expired for ${packageName}`);

        // If not reconnected, remove from active app sessions
        if (!this.userSession.appWebsockets.has(packageName)) {
          this.userSession.runningApps.delete(packageName);
          this.userSession.loadingApps.delete(packageName);

          // Broadcast app state change
          this.broadcastAppState().catch(error => {
            this.logger.error(`Error broadcasting app state after reconnection timeout:`, error);
          });
        }

        // Remove the timer from the map
        this.userSession._reconnectionTimers?.delete(packageName);
      }, 60000); // 1 minute reconnection grace period

      // Store the timer
      this.userSession._reconnectionTimers.set(packageName, reconnectionTimer);

    } catch (error) {
      this.logger.error(`Error handling app connection close for ${packageName}:`, error);
    }
  }

  /**
   * Clean up all resources
   */
  dispose(): void {
    try {
      this.logger.info('Disposing AppManager');

      // Clear reconnection timers
      if (this.userSession._reconnectionTimers) {
        for (const [packageName, timer] of this.userSession._reconnectionTimers.entries()) {
          clearTimeout(timer);
        }
        this.userSession._reconnectionTimers.clear();
      }

      // Close all app connections
      for (const [packageName, connection] of this.userSession.appWebsockets.entries()) {
        if (connection && connection.readyState === WebSocket.OPEN) {
          try {
            // Send app stopped message
            const message = {
              type: CloudToTpaMessageType.APP_STOPPED,
              timestamp: new Date()
            };
            connection.send(JSON.stringify(message));

            // Close the connection
            connection.close(1000, 'User session ended');
          } catch (error) {
            this.logger.error(`Error closing connection for ${packageName}:`, error);
          }
        }
      }

      // Clear connections
      this.userSession.appWebsockets.clear();

      // Clear active app sessions
      this.userSession.runningApps.clear();

      // Clear loading apps
      this.userSession.loadingApps.clear();

    } catch (error) {
      this.logger.error({ error }, `Error disposing AppManager for ${this.userSession.userId}`);
    }
  }
}

export default AppManager;