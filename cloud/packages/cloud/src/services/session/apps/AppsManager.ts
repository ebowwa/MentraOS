/**
 * AppsManager (new) — thin orchestrator/registry for per-app sessions.
 *
 * IMPORTANT:
 * - This file is a scaffold for the new AppsManager and does not touch the legacy AppManager.
 * - It intentionally keeps responsibilities minimal and delegates per-app lifecycle to AppSession instances.
 * - Wiring this into the system should be guarded by a feature flag (see isEnabled()).
 */

import type WebSocket from "ws";
import type { Logger } from "pino";
import UserSession from "../UserSession";
import { logger as rootLogger } from "../../logging/pino-logger";
import AppSession from "./AppSession";
import { CloudToGlassesMessageType, AppStateChange } from "@mentra/sdk";

/**
 * Minimal App start result used by the new manager/session path.
 * Mirrors the shape we already use elsewhere so callers can rely on consistent semantics.
 */
export interface AppStartResult {
  success: boolean;
  error?: {
    stage:
      | "WEBHOOK"
      | "CONNECTION"
      | "AUTHENTICATION"
      | "TIMEOUT"
      | "HARDWARE_CHECK";
    message: string;
    details?: unknown;
  };
}

/**
 * Minimal per-app session interface the AppsManager depends on.
 * AppSession implementations should encapsulate per-app lifecycle and state.
 */
export interface AppSessionI {
  /**
   * Start the app lifecycle (trigger webhook, create pending connection, etc).
   * Must resolve fast on failure (no retries, short timeouts).
   */
  start(): Promise<AppStartResult>;

  /**
   * Stop the app gracefully (close WS, cleanup timers/state).
   */
  stop(): Promise<void>;

  /**
   * Handle App WebSocket connection init (validate, ACK, heartbeat, resolve pending).
   */
  handleConnection(ws: WebSocket, initMessage: unknown): Promise<void>;

  /**
   * Send a message to the app.
   */
  sendMessage?(message: any): Promise<{
    sent: boolean;
    resurrectionTriggered?: boolean;
    error?: string;
  }>;

  /**
   * Dispose all resources (idempotent).
   */
  dispose(): void;

  /**
   * Optional state snapshot helpers (not required by AppsManager).
   */
  getState?(): unknown;
  isRunning?(): boolean;
}

/**
 * Factory signature used by AppsManager to create per-app sessions.
 * The concrete AppSession implementation will be injected when wiring.
 */
export type AppSessionFactory = (
  packageName: string,
  userSession: UserSession,
) => AppSessionI;

/**
 * New AppsManager — thin orchestrator:
 * - Maintains a registry of per-app sessions (packageName → AppSession)
 * - Delegates lifecycle actions to AppSession
 * - Keeps existing legacy AppManager intact and untouched
 *
 * NOTE: This is intentionally minimal. Feature parity and migration will be
 * handled incrementally, guarded behind a feature flag.
 */
export class AppsManager {
  private readonly userSession: UserSession;
  private readonly logger: Logger;
  private readonly appSessions = new Map<string, AppSessionI>();
  private readonly createSession: AppSessionFactory;

  /**
   * Feature flag to enable/disable the new AppsManager path.
   * Example usage: if (!AppsManager.isEnabled()) { use legacy AppManager }
   */
  public static isEnabled(): boolean {
    const v = process.env.USE_APP_SESSION;
    return v === "1" || v === "true" || v === "on";
  }

  /**
   * Construct a new AppsManager.
   * @param userSession owning UserSession
   * @param factory injected AppSession factory
   * @param logger optional logger (defaults to child logger)
   */
  constructor(
    userSession: UserSession,
    factory?: AppSessionFactory,
    logger?: Logger,
  ) {
    this.userSession = userSession;
    this.logger =
      logger ||
      userSession.logger?.child({ service: "AppsManager" }) ||
      rootLogger.child({ service: "AppsManager" });
    this.createSession =
      factory ||
      ((packageName: string, userSession: UserSession) => {
        return new AppSession(packageName, userSession, this.logger, this);
      });
    this.logger.info(
      { userId: userSession.userId, feature: "app-start" },
      "AppsManager (new) initialized",
    );
  }

  /**
   * Start an app via AppSession.
   * - Creates a new session if none exists.
   * - Delegates to session.start() and records the result.
   * - KEEPS session in registry even on failure to allow late connections.
   */
  async startApp(packageName: string): Promise<AppStartResult> {
    const logger = this.logger.child({ packageName, function: "startApp" });

    // Already running? Treat as success (idempotent start).
    if (this.appSessions.has(packageName)) {
      logger.debug("Session already exists; treating start as success");
      return { success: true };
    }

    logger.info({ feature: "app-start" }, "Creating AppSession");
    const session = this.createSession(packageName, this.userSession);
    this.appSessions.set(packageName, session);

    try {
      logger.info({ feature: "app-start" }, "Delegating to session.start()");
      const result = await session.start();

      if (!result.success) {
        logger.warn(
          { error: result.error, feature: "app-start" },
          "Session start failed, but keeping in registry for potential late connection",
        );
        // DON'T delete session - app might connect late (e.g., flash webhook timeout)
        // this.appSessions.delete(packageName);
      } else {
        logger.info({ feature: "app-start" }, "Session start succeeded");
      }

      return result;
    } catch (error) {
      logger.error(
        { error, feature: "app-start" },
        "Session start threw, but keeping in registry for potential late connection",
      );
      // DON'T delete session - app might connect late
      // this.appSessions.delete(packageName);
      return {
        success: false,
        error: {
          stage: "CONNECTION",
          message: "Unhandled error during session start",
          details: (error as Error)?.message ?? String(error),
        },
      };
    }
  }

  /**
   * Stop an app session (if present) and remove it from registry.
   */
  async stopApp(packageName: string): Promise<void> {
    const logger = this.logger.child({ packageName, function: "stopApp" });
    const session = this.appSessions.get(packageName);

    if (!session) {
      logger.debug("No session found; nothing to stop");
      return;
    }

    try {
      logger.info("Delegating to session.stop()");
      await session.stop();
    } catch (error) {
      logger.error({ error }, "Error while stopping session");
    } finally {
      this.appSessions.delete(packageName);
      logger.info("Session removed from registry");
    }
  }

  /**
   * Handle App WebSocket connection init by delegating to the matching session.
   * If no session is present, we ignore (or could surface a structured error upstream).
   */
  async handleAppInit(
    packageName: string,
    ws: WebSocket,
    initMessage: unknown,
  ): Promise<void> {
    const logger = this.logger.child({
      packageName,
      function: "handleAppInit",
    });
    const appSession = this.appSessions.get(packageName);

    if (!appSession) {
      logger.warn(
        { feature: "app-start" },
        "No AppSession found for handleAppInit; ignoring",
      );
      return;
    }

    await appSession.handleConnection(ws, initMessage);
  }

  /**
   * Return the AppSession instance for a package, if any.
   */
  getAppSession(packageName: string): AppSessionI | undefined {
    return this.appSessions.get(packageName);
  }

  /**
   * Return a list of currently tracked app package names.
   * NOTE: This reflects the registry, not necessarily "RUNNING" state.
   */
  getTrackedApps(): string[] {
    return Array.from(this.appSessions.keys());
  }

  /**
   * Best-effort "running apps" derived from the registry.
   * If AppSession exposes isRunning(), prefer it; otherwise fallback to presence.
   */
  getRunningApps(): string[] {
    const running: string[] = [];
    for (const [pkg, session] of this.appSessions.entries()) {
      if (typeof session.isRunning === "function") {
        if (session.isRunning()) running.push(pkg);
      } else {
        // Fallback: presence implies "active" (not strictly RUNNING)
        running.push(pkg);
      }
    }
    return running;
  }

  /**
   * Broadcast app state to connected clients.
   * Uses session cache only (no DB calls per architecture).
   */
  async broadcastAppState(): Promise<AppStateChange | null> {
    const logger = this.logger.child({ function: "broadcastAppState" });
    logger.debug("Broadcasting app state");

    try {
      // Build app state change message using session cache
      const appStateChange: AppStateChange = {
        type: CloudToGlassesMessageType.APP_STATE_CHANGE,
        sessionId: this.userSession.sessionId,
        timestamp: new Date(),
      };

      // Check WebSocket availability
      if (
        !this.userSession.websocket ||
        this.userSession.websocket.readyState !== 1 // WebSocket.OPEN = 1
      ) {
        logger.warn("WebSocket not open for app state broadcast");
        return appStateChange;
      }

      // Send to client
      this.userSession.websocket.send(JSON.stringify(appStateChange));
      logger.debug({ feature: "app-start" }, "Sent APP_STATE_CHANGE to client");

      return appStateChange;
    } catch (error) {
      logger.error(error, "Error broadcasting app state");
      return null;
    }
  }

  /**
   * Check if an app is currently running.
   * Bridges to UserSession state for compatibility during migration.
   * TODO: Once migration complete, read from AppSession.isRunning() only.
   */
  isAppRunning(packageName: string): boolean {
    // Bridge to legacy state during migration
    return this.userSession.runningApps.has(packageName);
  }

  /**
   * Send a message to a running app.
   * Delegates to AppSession if available, falls back to legacy path.
   */
  async sendMessageToApp(
    packageName: string,
    message: any,
  ): Promise<{
    sent: boolean;
    resurrectionTriggered?: boolean;
    error?: string;
  }> {
    const logger = this.logger.child({
      packageName,
      function: "sendMessageToApp",
    });

    // Try to delegate to AppSession first
    const session = this.appSessions.get(packageName);
    if (session && session.sendMessage) {
      logger.debug("Delegating to AppSession.sendMessage()");
      return session.sendMessage(message);
    }

    // Fallback: Bridge to legacy state during migration
    logger.debug("Using legacy bridge (no AppSession)");
    const websocket = this.userSession.appWebsockets.get(packageName);

    if (!websocket || websocket.readyState !== 1) {
      // WebSocket.OPEN = 1
      logger.warn("WebSocket not available for messaging");
      return {
        sent: false,
        resurrectionTriggered: false,
        error: "Connection not available",
      };
    }

    try {
      websocket.send(JSON.stringify(message));
      logger.debug(
        { messageType: message.type || "unknown" },
        "Message sent to app",
      );
      return { sent: true, resurrectionTriggered: false };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(error, "Failed to send message to app");
      return {
        sent: false,
        resurrectionTriggered: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Start all previously running apps from the database.
   * Fetches user's running apps and starts each one.
   */
  async startPreviouslyRunningApps(): Promise<void> {
    const logger = this.logger.child({
      function: "startPreviouslyRunningApps",
    });

    try {
      // Import User model at runtime to avoid circular dependencies
      const { User } = await import("../../../models/user.model");
      const user = await User.findOrCreateUser(this.userSession.userId);
      const previouslyRunningApps = user.runningApps;

      if (previouslyRunningApps.length === 0) {
        logger.debug("No previously running apps");
        return;
      }

      logger.info(
        { count: previouslyRunningApps.length },
        "Starting previously running apps",
      );

      const startedApps: string[] = [];

      await Promise.all(
        previouslyRunningApps.map(async (packageName) => {
          try {
            const result = await this.startApp(packageName);
            if (result.success) {
              startedApps.push(packageName);
            } else {
              logger.warn(
                { packageName, error: result.error },
                "Failed to start previously running app",
              );
            }
          } catch (error) {
            logger.error(
              error,
              `Error starting previously running app ${packageName}`,
            );
          }
        }),
      );

      logger.info(
        { startedApps, total: previouslyRunningApps.length },
        `Started ${startedApps.length}/${previouslyRunningApps.length} previously running apps`,
      );
    } catch (error) {
      logger.error(error, "Error starting previously running apps");
    }
  }

  // handleResurrection() removed - AppSession is now self-healing!
  // AppSession handles its own resurrection by triggering webhooks and reconnecting

  /**
   * Dispose all sessions and clear the registry.
   */
  dispose(): void {
    this.logger.info("Disposing AppsManager and all sessions");
    for (const session of this.appSessions.values()) {
      try {
        session.dispose();
      } catch (error) {
        this.logger.error(error, "Error disposing AppSession");
      }
    }
    this.appSessions.clear();
  }
}

export default AppsManager;
