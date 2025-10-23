/**
 * Client Apps API
 *
 * /api/client/apps
 *
 * Minimal app list endpoint for mobile home screen display.
 * Fast, focused, no bloat - <100ms response time target.
 *
 * Uses @mentra/types for client-facing interfaces.
 */

import { Router, Request, Response } from "express";
import { ClientAppsService } from "../../services/client/apps.service";
import {
  clientAuthWithEmail,
  RequestWithEmail,
} from "../middleware/client.middleware";
import { logger } from "../../services/logging/pino-logger";
import UserSession from "../../services/session/UserSession";

const router = Router();

// ============================================================================
// Routes
// ============================================================================

// GET /api/client/apps - Get apps for home screen
router.get("/", clientAuthWithEmail, getApps);
router.post("/start/:packageName", clientAuthWithEmail, startApp);
router.post("/stop/:packageName", clientAuthWithEmail, stopApp);
// ============================================================================
// Handlers
// ============================================================================

/**
 * Get apps for home screen
 *
 * Returns minimal app list optimized for client display:
 * - packageName, name, webviewUrl, logoUrl
 * - type, permissions, hardwareRequirements
 * - running (session state), healthy (cached status)
 *
 * Performance: <100ms response time, ~2KB for 10 apps
 */
async function getApps(req: Request, res: Response) {
  const { email } = req as RequestWithEmail;
  const startTime = Date.now();

  try {
    const apps = await ClientAppsService.getAppsForHomeScreen(email);

    const duration = Date.now() - startTime;

    logger.debug(
      { email, count: apps.length, duration },
      "Apps fetched for home screen",
    );

    res.json({
      success: true,
      data: apps,
      timestamp: new Date(),
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(
      { error, email, duration },
      "Failed to fetch apps for home screen",
    );

    res.status(500).json({
      success: false,
      message: "Failed to fetch apps",
      timestamp: new Date(),
    });
  }
}

/**
 * Start an app for the current user session (new system only)
 */
async function startApp(req: Request, res: Response) {
  const startedAt = Date.now();
  const { packageName } = req.params as { packageName: string };
  const { email } = req as RequestWithEmail;
  const userSession = UserSession.getById(email);
  if (!userSession) {
    return res.status(401).json({ success: false, message: "No user session" });
  }

  try {
    // Ensure new AppsManager exists for this session (no legacy in /api/client)

    const result = await userSession.appManager.startApp(packageName);

    if (!result?.success) {
      const status =
        result?.error?.stage === "AUTHENTICATION"
          ? 401
          : result?.error?.stage === "HARDWARE_CHECK"
            ? 400
            : result?.error?.stage === "TIMEOUT"
              ? 504
              : 502; // WEBHOOK/CONNECTION/default infra error

      logger.error(
        result?.error,
        "AppsManagerNew.startApp failed (client endpoint)",
      );
      return res.status(status).json({
        success: false,
        message: result?.error?.message || "Failed to start app",
        stage: result?.error?.stage,
        duration: Date.now() - startedAt,
      });
    }

    // New broadcast (temporary scaffold) // TODO: this should be done in AppsManagerNew.startApp
    try {
      await userSession.appManager.broadcastAppState();
    } catch (error) {
      userSession.logger
        .child({ packageName, service: "client.apps.api" })
        .error(error, "AppsManagerNew.broadcastAppState failed after start");
    }

    return res.json({
      success: true,
      message: "App started successfully",
      duration: Date.now() - startedAt,
    });
  } catch (error) {
    logger.error(error, "AppsManagerNew.startApp threw (client endpoint)");
    return res.status(502).json({
      success: false,
      message: "Error starting app",
      duration: Date.now() - startedAt,
    });
  }
}

/**
 * Stop an app for the current user session (new system only)
 */
async function stopApp(req: Request, res: Response) {
  const { packageName } = req.params as { packageName: string };
  // const userSession = (req as RequestWithEmail).userSession;
  const userSession = UserSession.getById((req as RequestWithEmail).email);

  if (!userSession) {
    return res.status(401).json({ success: false, message: "No user session" });
  }

  const startedAt = Date.now();

  try {
    await userSession.appManager.stopApp(packageName);

    // New broadcast (temporary scaffold)
    try {
      await userSession.appManager.broadcastAppState();
    } catch (e) {
      logger.error(e, "AppsManagerNew.broadcastAppState failed after stop");
    }

    return res.json({
      success: true,
      message: "App stopped successfully",
      duration: Date.now() - startedAt,
    });
  } catch (error) {
    logger.error(error, "AppsManagerNew.stopApp threw (client endpoint)");
    return res.status(502).json({
      success: false,
      message: "Error stopping app",
      duration: Date.now() - startedAt,
    });
  }
}

export default router;
