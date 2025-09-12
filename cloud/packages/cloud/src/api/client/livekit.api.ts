
// cloud/src/api/client/livekit-test.api.ts
// Public test endpoint to mint a short-lived LiveKit token (no auth)
// Mounted at: /api/client/livekit/test

import { Router, Request, Response } from "express";
import { logger } from "../../services/logging/pino-logger";
import * as LiveKitService from "../../services/client/livekit.service";
import { authWithEmail, authWithUser, RequestWithEmail, RequestWithUser } from "../../middleware/client/client-auth-middleware";

const router = Router();

// Routes: POST /api/client/livekit/*
router.post("/test/mint-token", mintTestToken);
router.get("/token", authWithEmail, mintToken);


// POST /api/client/livekit/test/mint-token
// Body: { email: string, roomName: string }
// Response: { success: boolean, data?: { url, token, room, identity, expiresAt }, message?: string, timestamp }
async function mintTestToken(req: Request, res: Response) {
  try {
    const { email, roomName } = (req.body ?? {}) as { email?: string; roomName?: string };
    if (!email || typeof email !== "string" || !roomName || typeof roomName !== "string") {
      return res.status(400).json({
        success: false,
        message: "email and roomName are required",
        timestamp: new Date(),
      });
    }

    // Optional feature flag to disable in prod
    if (process.env.LIVEKIT_TEST_ENABLED === "false") {
      return res.status(404).json({
        success: false,
        message: "Not found",
        timestamp: new Date(),
      });
    }

    const { url, token, identity } = await LiveKitService.mintTestToken(email, roomName);

    return res.json({
      success: true,
      data: { url, token, room: roomName, identity },
      timestamp: new Date(),
    });
  } catch (error) {
    logger.error(error, "Error minting LiveKit test token");
    return res.status(500).json({
      success: false,
      message: "Failed to mint token",
      timestamp: new Date(),
    });
  }
}

async function mintToken(req: Request, res: Response) {
  const email = (req as RequestWithEmail).email;

  try {
    const roomName = email; // Use email as room name for now
    if (!email || typeof email !== "string" || !roomName || typeof roomName !== "string") {
      return res.status(400).json({
        success: false,
        message: "email and roomName are required",
        timestamp: new Date(),
      });
    }

    const { url, token, identity } = await LiveKitService.mintToken(email, roomName);

    return res.json({
      success: true,
      data: { url, token, room: roomName, identity },
      timestamp: new Date(),
    });
  } catch (error) {
    logger.error(error, "Error minting LiveKit test token");
    return res.status(500).json({
      success: false,
      message: "Failed to mint token",
      timestamp: new Date(),
    });
  }
}

export default router;
