/**
 * AppSession (new) — per-app lifecycle scaffold.
 *
 * IMPORTANT:
 * - This file is a scaffold that implements the minimal shape expected by the new AppsManager.
 * - It does NOT touch or replace the legacy AppManager. Wiring this into the system should
 *   be guarded by a feature flag on the orchestrator side.
 * - The methods here are intentionally no-ops with logging so that enabling the feature flag
 *   won’t break existing behavior while we iterate.
 */

import type WebSocket from "ws";
import type { Logger } from "pino";
import UserSession from "../UserSession";
import { logger as rootLogger } from "../../logging/pino-logger";
import type { AppStartResult, AppSessionI } from "./AppsManager";

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

  // Timings (reserved for future use)
  private readonly connectionTimeoutMs = 5000; // 5s
  private readonly webhookTimeoutMs = 3000; // 3s

  // Connection state (scaffold)
  private ws: WebSocket | null = null;
  private connecting = false;
  private disposed = false;

  // Timers (reserved for future use)
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
   *
   * Scaffold behavior:
   * - Logs intent
   * - Returns success immediately (no side effects)
   *
   * NOTE: Real implementation will:
   * - Trigger webhook (fail fast, no retries)
   * - Create pending connection with timeout
   * - Resolve on connection init or timeout/error
   */
  async start(): Promise<AppStartResult> {
    if (this.disposed) {
      this.logger.warn(
        { feature: "app-start" },
        "start() called on disposed session (scaffold)",
      );
      return {
        success: false,
        error: {
          stage: "CONNECTION",
          message: "Session disposed",
        },
      };
    }

    if (this.connecting) {
      this.logger.debug(
        { feature: "app-start" },
        "start() called while connecting (scaffold)",
      );
    }

    this.logger.info(
      { feature: "app-start", connectionTimeoutMs: this.connectionTimeoutMs },
      "start() invoked (scaffold no-op)",
    );

    // Scaffold returns success to avoid disrupting flows while wiring.
    return { success: true };
  }

  /**
   * Handle App WebSocket connection initialization.
   *
   * Scaffold behavior:
   * - Records the WebSocket
   * - Logs the init message
   * - No validation/ACK performed
   */
  async handleConnection(ws: WebSocket, initMessage: unknown): Promise<void> {
    if (this.disposed) {
      this.logger.warn(
        { feature: "app-start" },
        "handleConnection() called on disposed session (scaffold)",
      );
      try {
        // Attempt to close immediately if we were erroneously invoked post-disposal.
        // Using numeric 1 to avoid depending on WebSocket.OPEN const at type level.
        const OPEN = 1;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const state = (ws as any)?.readyState;
        if (state === OPEN) {
          ws.close(1000, "Session disposed");
        }
      } catch {
        // ignore
      }
      return;
    }

    this.ws = ws;
    this.logger.info(
      { feature: "app-start", initMessage },
      "handleConnection() invoked (scaffold no-op)",
    );

    // Placeholder: future heartbeat wiring
    this.setupHeartbeat();
  }

  /**
   * Stop the app session gracefully.
   *
   * Scaffold behavior:
   * - Clears timers
   * - Closes WS if open
   * - Leaves disposed flag untouched (stop != dispose)
   */
  async stop(): Promise<void> {
    this.logger.info("stop() invoked (scaffold no-op)");
    this.clearHeartbeat();

    try {
      const OPEN = 1;
      const state = this.ws?.readyState;
      if (this.ws && state === OPEN) {
        this.ws.close(1000, "Session stopped");
      }
    } catch (error) {
      this.logger.warn({ error }, "Error closing WebSocket on stop()");
    } finally {
      this.ws = null;
    }

    // Clear any pending connection timer (if used in future impl)
    if (this.connectionTimer) {
      clearTimeout(this.connectionTimer);
      this.connectionTimer = null;
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
   * Optional state snapshot helper for debugging/observability.
   */
  getState(): {
    packageName: string;
    hasWebSocket: boolean;
    connecting: boolean;
    disposed: boolean;
  } {
    return {
      packageName: this.packageName,
      hasWebSocket: Boolean(this.ws),
      connecting: this.connecting,
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
  // Internal helpers (scaffold stubs)
  // ---------------------------------------------------------------------------

  private setupHeartbeat(): void {
    if (this.heartbeatTimer) return;

    // Light periodic log to observe session liveness; placeholder for real ping/pong.
    this.heartbeatTimer = setInterval(() => {
      this.logger.debug(
        {
          feature: "app-start",
          state: this.getState(),
        },
        "AppSession heartbeat (scaffold)",
      );
    }, 10_000);
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}

export default AppSession;
