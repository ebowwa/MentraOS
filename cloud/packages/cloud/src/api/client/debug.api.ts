/* eslint-disable no-restricted-imports */
// cloud/src/api/client/debug.api.ts
// Debug endpoints for testing and simulating various connection states
// Mounted at: /api/client/debug/*

import { Router, Request, Response } from "express";

import { logger } from "../../services/logging/pino-logger";
import UserSession from "../../services/session/UserSession";

const router = Router();

// Routes: POST /api/client/debug/*
router.post("/break-ping-pong/:userId", breakPingPong);
router.post("/force-disconnect/:userId", forceDisconnect);

/**
 * POST /api/client/debug/break-ping-pong
 *
 * Simulates a ping/pong timeout by forcing the WebSocket to close
 * with code 1001 (Ping timeout). This mimics what happens when the
 * mobile device switches WiFi networks and stops responding to pings.
 *
 * Use this to test mobile reconnection logic without actually switching networks.
 *
 * Response: { success: boolean, message: string, timestamp: Date }
 */
async function breakPingPong(req: Request, res: Response) {
  try {
    const userId = req.params.userId;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "Missing userId",
        timestamp: new Date(),
      });
    }

    logger.info(
      { userId, service: "debug.api" },
      `[DEBUG] Simulating ping/pong timeout for user ${userId}`,
    );

    const session = UserSession.getById(userId);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: `No active session found for user ${userId}`,
        timestamp: new Date(),
      });
    }

    // Call the break ping/pong method
    const result = session.breakPingPong();

    if (result) {
      logger.info(
        { userId, service: "debug.api" },
        `[DEBUG] Successfully triggered ping/pong timeout for user ${userId}`,
      );

      return res.json({
        success: true,
        message: `Ping/pong timeout simulated for user ${userId}. WebSocket will close with code 1001. Mobile should reconnect within 1-5 seconds.`,
        timestamp: new Date(),
      });
    } else {
      return res.status(500).json({
        success: false,
        message: `Failed to break ping/pong for user ${userId}. WebSocket might not be open.`,
        timestamp: new Date(),
      });
    }
  } catch (error) {
    logger.error(
      { error, service: "debug.api" },
      "[DEBUG] Error breaking ping/pong",
    );

    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date(),
    });
  }
}

/**
 * POST /api/client/debug/force-disconnect
 *
 * Forcibly closes the WebSocket connection with code 1006 (abnormal closure).
 * This simulates a network interruption or crash.
 *
 * Response: { success: boolean, message: string, timestamp: Date }
 */
async function forceDisconnect(req: Request, res: Response) {
  try {
    const userId = req.params.userId;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "Missing userId",
        timestamp: new Date(),
      });
    }

    logger.info(
      { userId, service: "debug.api" },
      `[DEBUG] Forcing disconnect for user ${userId}`,
    );

    const session = UserSession.getById(userId);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: `No active session found for user ${userId}`,
        timestamp: new Date(),
      });
    }

    // Terminate the connection abruptly (simulates network failure)
    if (session.websocket && session.websocket.readyState === 1) {
      session.websocket.terminate();

      logger.info(
        { userId, service: "debug.api" },
        `[DEBUG] Successfully terminated WebSocket for user ${userId}`,
      );

      return res.json({
        success: true,
        message: `WebSocket terminated for user ${userId}. This simulates a network failure (code 1006).`,
        timestamp: new Date(),
      });
    } else {
      return res.status(400).json({
        success: false,
        message: `WebSocket is not open for user ${userId}`,
        timestamp: new Date(),
      });
    }
  } catch (error) {
    logger.error(
      { error, service: "debug.api" },
      "[DEBUG] Error forcing disconnect",
    );

    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date(),
    });
  }
}

export default router;
