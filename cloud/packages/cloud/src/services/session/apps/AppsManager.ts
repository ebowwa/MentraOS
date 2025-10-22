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
        return new AppSession(packageName, userSession, this.logger);
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
   * - On failure, removes the created session to keep registry clean.
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
          "Session start failed; removing session from registry",
        );
        this.appSessions.delete(packageName);
      } else {
        logger.info({ feature: "app-start" }, "Session start succeeded");
      }

      return result;
    } catch (error) {
      logger.error(
        { error, feature: "app-start" },
        "Session start threw; removing session from registry",
      );
      this.appSessions.delete(packageName);
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
   * Broadcast state to clients.
   * Intentionally minimal scaffold — concrete implementation should be added
   * once we decide the payload contract and routing for the new path.
   */
  async broadcastAppState(): Promise<void> {
    const logger = this.logger.child({ function: "broadcastAppState" });
    try {
      const running = this.getRunningApps();
      logger.debug(
        { running, feature: "app-start" },
        "Broadcasting app state (scaffold)",
      );
      // TODO: Implement message construction and delivery via userSession when contract is finalized.
    } catch (error) {
      logger.error({ error }, "Error broadcasting app state");
    }
  }

  /**
   * Dispose all sessions and clear the registry.
   */
  dispose(): void {
    this.logger.info("Disposing AppsManager and all sessions");
    for (const session of this.appSessions.values()) {
      try {
        session.dispose();
      } catch (error) {
        this.logger.error({ error }, "Error disposing AppSession");
      }
    }
    this.appSessions.clear();
  }
}

export default AppsManager;
