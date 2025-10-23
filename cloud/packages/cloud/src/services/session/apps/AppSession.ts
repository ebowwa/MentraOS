/**
 * AppSession (new) — per-app lifecycle management.
 *
 * Encapsulates all state and behavior for a single app instance:
 * - Webhook triggering (fail fast, 3s timeout)
 * - Connection handling and ACK
 * - Message sending with resurrection
 * - Heartbeat and cleanup
 */

import type WebSocket from "ws";
import type { Logger } from "pino";
import UserSession from "../UserSession";
import { logger as rootLogger } from "../../logging/pino-logger";
import type { AppStartResult, AppSessionI } from "./AppsManager";
import {
  CloudToAppMessageType,
  WebhookRequestType,
  SessionWebhookRequest,
  StopWebhookRequest,
  AppConnectionInit,
} from "@mentra/sdk";
import axios from "axios";
import * as developerService from "../../core/developer.service";
import { User } from "../../../models/user.model";
import { PosthogService } from "../../logging/posthog.service";

const CLOUD_PUBLIC_HOST_NAME = process.env.CLOUD_PUBLIC_HOST_NAME;
const WEBHOOK_TIMEOUT_MS = 3000; // 3s - fail fast per architecture
const CONNECTION_TIMEOUT_MS = 5000; // 5s total timeout for app to connect

// Default AugmentOS system settings
const DEFAULT_AUGMENTOS_SETTINGS = {
  useOnboardMic: false,
  contextualDashboard: true,
  headUpAngle: 20,
  brightness: 50,
  autoBrightness: false,
  sensingEnabled: true,
  alwaysOnStatusBar: false,
  bypassVad: false,
  bypassAudioEncoding: false,
  metricSystemEnabled: false,
} as const;

/**
 * Minimal AppSession intended to encapsulate per-app lifecycle:
 * - start(): trigger webhook, create pending connection, timeouts (future)
 * - handleConnection(): validate, ACK, heartbeat (future)
 * - stop()/dispose(): clear timers and resources
 *
 * Current implementation is a scaffold that logs and behaves as a no-op to
 * enable safe, incremental wiring under a feature flag.
 */
export class AppSession implements AppSessionI {
  private readonly packageName: string;
  private readonly userSession: UserSession;
  private readonly logger: Logger;

  // Connection state
  private ws: WebSocket | null = null;
  private disposed = false;
  private startTime: number = 0;

  // Pending connection tracking
  private pendingResolve: ((result: AppStartResult) => void) | null = null;
  private pendingReject: ((error: Error) => void) | null = null;

  // Timers
  private connectionTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor(packageName: string, userSession: UserSession, logger?: Logger) {
    this.packageName = packageName;
    this.userSession = userSession;
    this.logger =
      logger ||
      userSession.logger?.child({
        service: "AppSession",
        packageName,
      }) ||
      rootLogger.child({ service: "AppSession", packageName });

    this.logger.info(
      { userId: userSession.userId, feature: "app-start" },
      "AppSession (scaffold) constructed",
    );
  }

  /**
   * Start the app session.
   * - Triggers webhook (3s timeout, no retries, fail fast)
   * - Creates pending connection promise
   * - Sets connection timeout (5s)
   * - Returns promise that resolves when app connects OR times out
   */
  async start(): Promise<AppStartResult> {
    if (this.disposed) {
      this.logger.warn(
        { feature: "app-start" },
        "start() called on disposed session",
      );
      return {
        success: false,
        error: { stage: "CONNECTION", message: "Session disposed" },
      };
    }

    this.startTime = Date.now();
    this.logger.info({ feature: "app-start" }, "⚡️ Starting app session");

    // Mark as loading in UserSession (bridge during migration)
    this.userSession.loadingApps.add(this.packageName);

    // Get app from installed apps cache
    const app = this.userSession.installedApps.get(this.packageName);
    if (!app) {
      this.logger.error(
        { feature: "app-start" },
        "App not found in installed apps cache",
      );
      this.userSession.loadingApps.delete(this.packageName);
      return {
        success: false,
        error: { stage: "WEBHOOK", message: "App not found" },
      };
    }

    // Create pending connection promise
    return new Promise<AppStartResult>((resolve, reject) => {
      this.pendingResolve = resolve;
      this.pendingReject = reject;

      // Set up connection timeout
      this.connectionTimer = setTimeout(() => {
        this.logger.error(
          { feature: "app-start", duration: Date.now() - this.startTime },
          `Connection timeout after ${CONNECTION_TIMEOUT_MS}ms`,
        );

        this.cleanup();
        this.userSession.loadingApps.delete(this.packageName);

        if (this.pendingResolve) {
          this.pendingResolve({
            success: false,
            error: {
              stage: "TIMEOUT",
              message: `Connection timeout after ${CONNECTION_TIMEOUT_MS}ms`,
            },
          });
          this.pendingResolve = null;
          this.pendingReject = null;
        }
      }, CONNECTION_TIMEOUT_MS);

      // Trigger webhook (fail fast)
      this.triggerWebhook(app).catch((error) => {
        this.logger.error(error, `Webhook failed for ${this.packageName}`);
        this.cleanup();
        this.userSession.loadingApps.delete(this.packageName);

        if (this.pendingResolve) {
          this.pendingResolve({
            success: false,
            error: {
              stage: "WEBHOOK",
              message: error instanceof Error ? error.message : String(error),
            },
          });
          this.pendingResolve = null;
          this.pendingReject = null;
        }
      });
    });
  }

  /**
   * Trigger webhook to app server (fail fast, no retries).
   */
  private async triggerWebhook(app: any): Promise<void> {
    const sessionId = `${this.userSession.userId}-${this.packageName}`;
    const augmentOSWebsocketUrl = `wss://${CLOUD_PUBLIC_HOST_NAME}/app-ws`;
    const webhookURL = `${app.publicUrl}/webhook`;

    this.logger.info(
      { feature: "app-start", webhookURL, augmentOSWebsocketUrl },
      "Triggering webhook",
    );

    // Trigger boot screen
    this.userSession.displayManager.handleAppStart(this.packageName);

    const payload: SessionWebhookRequest = {
      type: WebhookRequestType.SESSION_REQUEST,
      sessionId,
      userId: this.userSession.userId,
      timestamp: new Date().toISOString(),
      augmentOSWebsocketUrl,
    };

    try {
      await axios.post(webhookURL, payload, {
        headers: { "Content-Type": "application/json" },
        timeout: WEBHOOK_TIMEOUT_MS,
      });

      this.logger.info(
        { feature: "app-start", duration: Date.now() - this.startTime },
        "Webhook sent successfully, waiting for app connection",
      );
    } catch (error) {
      // Clean up boot screen on failure
      this.userSession.displayManager.handleAppStop(this.packageName);
      this.userSession.dashboardManager.cleanupAppContent(this.packageName);

      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Webhook failed: ${errorMsg}`);
    }
  }

  /**
   * Handle App WebSocket connection initialization.
   * - Validates API key
   * - Sends CONNECTION_ACK
   * - Sets up heartbeat
   * - Resolves pending connection promise
   */
  async handleConnection(ws: WebSocket, initMessage: unknown): Promise<void> {
    if (this.disposed) {
      this.logger.warn(
        { feature: "app-start" },
        "handleConnection() called on disposed session",
      );
      try {
        if (ws.readyState === 1) ws.close(1000, "Session disposed");
      } catch (error) {
        this.logger
          .child({ feature: "app-start" })
          .warn(error, "Failed to close WebSocket");
      }
      return;
    }

    const init = initMessage as AppConnectionInit;
    const { packageName, apiKey, sessionId } = init;

    this.logger.info({ feature: "app-start", sessionId }, "App connecting");

    // Validate API key
    const isValidApiKey = await developerService.validateApiKey(
      packageName,
      apiKey,
      this.userSession,
    );

    if (!isValidApiKey) {
      this.logger.error({ feature: "app-start" }, "Invalid API key");

      try {
        ws.send(
          JSON.stringify({
            type: CloudToAppMessageType.CONNECTION_ERROR,
            code: "INVALID_API_KEY",
            message: "Invalid API key",
            timestamp: new Date(),
          }),
        );
        ws.close(1008, "Invalid API key");
      } catch (error) {
        this.logger.error(error, "Error sending auth error");
      }

      this.resolvePending({
        success: false,
        error: { stage: "AUTHENTICATION", message: "Invalid API key" },
      });
      return;
    }

    // Store WebSocket
    this.ws = ws;
    this.userSession.appWebsockets.set(packageName, ws);

    // Set up close handler
    ws.on("close", (code: number, reason: Buffer) => {
      this.handleConnectionClosed(code, reason.toString());
    });

    // Set up heartbeat
    this.setupHeartbeat();

    // Update session state (bridge during migration)
    this.userSession.runningApps.add(packageName);
    this.userSession.loadingApps.delete(packageName);

    // Build and send CONNECTION_ACK
    let user;
    try {
      user = await User.findOrCreateUser(this.userSession.userId);
      const app = this.userSession.installedApps.get(packageName);
      const userSettings =
        user.getAppSettings(packageName) || app?.settings || [];
      const userAugmentosSettings =
        user.augmentosSettings || DEFAULT_AUGMENTOS_SETTINGS;

      const ackMessage = {
        type: CloudToAppMessageType.CONNECTION_ACK,
        sessionId,
        settings: userSettings,
        augmentosSettings: userAugmentosSettings,
        capabilities: this.userSession.getCapabilities(),
        timestamp: new Date(),
      };

      ws.send(JSON.stringify(ackMessage));
      this.logger.info({ feature: "app-start" }, "Sent CONNECTION_ACK");
    } catch (error) {
      this.logger.error(error, "Error building/sending CONNECTION_ACK");
    }

    // Resolve pending connection FIRST (return to API caller immediately)
    const duration = Date.now() - this.startTime;
    this.logger.info(
      { feature: "app-start", duration },
      `✅ App connected and authenticated in ${duration}ms`,
    );

    this.resolvePending({ success: true });

    // AFTER resolving: Do non-critical background tasks (fire-and-forget, off critical path)
    // Reuse user object from ACK construction (no second DB query)
    if (user) {
      // Update DB (async, non-blocking)
      user.addRunningApp(packageName).catch((error) => {
        this.logger.error(error, "Error updating user running apps in DB");
      });

      // Track in PostHog (async, non-blocking)
      PosthogService.trackEvent("app_start", this.userSession.userId, {
        packageName,
        userId: this.userSession.userId,
        sessionId: this.userSession.sessionId,
      }).catch((error) => {
        this.logger.error(error, "Error tracking app_start in PostHog");
      });
    }
  }

  /**
   * Stop the app session gracefully.
   * Implements complete stop flow with webhook, subscription cleanup, and analytics.
   */
  async stop(): Promise<void> {
    this.logger.info("Stopping app session");

    // 1. Clean up timers
    this.cleanup();

    // 2. Trigger stop webhook (non-blocking, continue on error)
    this.triggerStopWebhook().catch((error) => {
      this.logger.error(error, "Stop webhook failed (continuing anyway)");
    });

    // 3. Remove subscriptions
    try {
      await this.userSession.subscriptionManager.removeSubscriptions(
        this.packageName,
      );
      this.logger.info("Subscriptions removed");
    } catch (error) {
      this.logger.error(error, "Error removing subscriptions");
    }

    // 4. Send APP_STOPPED message to app and close WebSocket
    if (this.ws && this.ws.readyState === 1) {
      try {
        const message = {
          type: CloudToAppMessageType.APP_STOPPED,
          timestamp: new Date(),
        };
        this.ws.send(JSON.stringify(message));
        this.logger.info("Sent APP_STOPPED message to app");
      } catch (error) {
        this.logger.error(error, "Error sending APP_STOPPED message");
      }

      try {
        this.ws.close(1000, "Session stopped");
      } catch (error) {
        this.logger.warn(error, "Error closing WebSocket");
      }
    }
    this.ws = null;

    // 5. Update UserSession state (bridge during migration)
    this.userSession.runningApps.delete(this.packageName);
    this.userSession.loadingApps.delete(this.packageName);
    this.userSession.appWebsockets.delete(this.packageName);

    // 6. Clean up UI
    this.userSession.displayManager.handleAppStop(this.packageName);
    this.userSession.dashboardManager.cleanupAppContent(this.packageName);

    // AFTER FUNCTION RETURNS: Background tasks (fire-and-forget, off critical path)

    // 7. Remove from DB (fire-and-forget)
    User.findOrCreateUser(this.userSession.userId)
      .then((user) => user.removeRunningApp(this.packageName))
      .catch((error) => {
        this.logger.error(
          error,
          "Error removing app from user running apps in DB",
        );
      });

    // 8. Track in PostHog (fire-and-forget)
    const sessionDuration = Date.now() - this.startTime;
    PosthogService.trackEvent("app_stop", this.userSession.userId, {
      packageName: this.packageName,
      userId: this.userSession.userId,
      sessionId: this.userSession.sessionId,
      sessionDuration,
    }).catch((error) => {
      this.logger.error(error, "Error tracking app_stop in PostHog");
    });
  }

  /**
   * Trigger stop webhook to notify app server that session is ending.
   * Non-blocking - continues stop flow even if webhook fails.
   */
  private async triggerStopWebhook(): Promise<void> {
    const app = this.userSession.installedApps.get(this.packageName);
    if (!app?.publicUrl) {
      this.logger.debug("No publicUrl for app, skipping stop webhook");
      return;
    }

    const sessionId = `${this.userSession.userId}-${this.packageName}`;
    const payload: StopWebhookRequest = {
      type: WebhookRequestType.STOP_REQUEST,
      sessionId,
      userId: this.userSession.userId,
      reason: "user_disabled",
      timestamp: new Date().toISOString(),
    };

    try {
      const webhookURL = `${app.publicUrl}/webhook`;
      this.logger.info({ webhookURL }, "Triggering stop webhook");

      await axios.post(webhookURL, payload, {
        headers: { "Content-Type": "application/json" },
        timeout: WEBHOOK_TIMEOUT_MS,
      });

      this.logger.info("Stop webhook sent successfully");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(error, `Stop webhook failed: ${errorMsg}`);
      throw error; // Re-throw so caller can catch and log
    }
  }

  /**
   * Dispose all resources (idempotent).
   */
  dispose(): void {
    if (this.disposed) return;
    this.logger.info("dispose() invoked");

    // Best-effort stop
    void this.stop();

    this.disposed = true;
  }

  /**
   * Send a message to the app.
   * Returns info about send status and resurrection.
   */
  async sendMessage(message: any): Promise<{
    sent: boolean;
    resurrectionTriggered?: boolean;
    error?: string;
  }> {
    if (!this.ws || this.ws.readyState !== 1) {
      this.logger.warn("WebSocket not available for messaging");
      return {
        sent: false,
        resurrectionTriggered: false,
        error: "Connection not available",
      };
    }

    try {
      this.ws.send(JSON.stringify(message));
      this.logger.debug(
        { messageType: message.type || "unknown" },
        "Message sent to app",
      );
      return { sent: true, resurrectionTriggered: false };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(error, "Failed to send message to app");
      return {
        sent: false,
        resurrectionTriggered: false,
        error: errorMessage,
      };
    }
  }

  /**
   * State snapshot for debugging/observability.
   */
  getState(): {
    packageName: string;
    hasWebSocket: boolean;
    disposed: boolean;
  } {
    return {
      packageName: this.packageName,
      hasWebSocket: Boolean(this.ws),
      disposed: this.disposed,
    };
  }

  /**
   * Optional helper to infer "running" state for registry queries.
   * Scaffold uses presence of WebSocket as a proxy.
   */
  isRunning(): boolean {
    return Boolean(this.ws);
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private setupHeartbeat(): void {
    if (this.heartbeatTimer || !this.ws) return;

    const HEARTBEAT_INTERVAL = 10000; // 10 seconds

    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === 1) {
        this.ws.ping();
      } else {
        this.clearHeartbeat();
      }
    }, HEARTBEAT_INTERVAL);

    // Set up pong handler
    this.ws.on("pong", () => {
      // Connection is alive
    });

    this.logger.debug({ feature: "app-start" }, "Heartbeat established");
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private cleanup(): void {
    this.clearHeartbeat();
    if (this.connectionTimer) {
      clearTimeout(this.connectionTimer);
      this.connectionTimer = null;
    }
  }

  private resolvePending(result: AppStartResult): void {
    this.cleanup();
    if (this.pendingResolve) {
      this.pendingResolve(result);
      this.pendingResolve = null;
      this.pendingReject = null;
    }
  }

  private handleConnectionClosed(code: number, reason: string): void {
    this.logger.warn({ code, reason }, "App connection closed");

    // Clean up state
    this.ws = null;
    this.userSession.appWebsockets.delete(this.packageName);
    this.userSession.runningApps.delete(this.packageName);

    // TODO: Implement grace period and resurrection logic
  }
}

export default AppSession;
