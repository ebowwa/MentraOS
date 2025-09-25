import { Router, Request, Response } from "express";
import { logger } from "../services/logging/pino-logger";
import { liveKitTokenService } from "../services/session/LiveKitTokenService";
import UserSession from "../services/session/UserSession";

const router = Router();

// Handlers (defined first per code style)
async function getLiveKitInfo(req: Request, res: Response) {
  try {
    // const { sessionId, mode } = req.query as { sessionId?: string; mode?: string };
    const { userId } = req.query as { userId?: string };
    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }
    const userSession = UserSession.getById(userId);
    if (!userSession) {
      return res.status(404).json({ error: "session_not_found" });
    }

    const url = userSession.liveKitManager.getUrl();
    const roomName = userSession.liveKitManager.getRoomName();
    // const token = mode === 'subscribe'
    //   ? userSession.liveKitManager.mintAgentSubscribeToken()
    //   : userSession.liveKitManager.mintClientPublishToken();
    const token = userSession.liveKitManager.mintClientPublishToken();

    if (!url || !roomName || !token) {
      return res.status(500).json({ error: "livekit_not_configured" });
    }

    res.json({ url, roomName, token });
  } catch (error) {
    logger.error({ error }, "Error getting LiveKit info");
    res.status(500).json({ error: "internal_error" });
  }
}

// Routes (at bottom)
router.get("/livekit/info", getLiveKitInfo);

// Dev-only: mint a LiveKit token for quick testing (subscribe or publish)
router.post("/livekit/token", async (req: Request, res: Response) => {
  try {
    const { identity, roomName, mode, ttlSeconds } = req.body as {
      identity: string;
      roomName?: string;
      mode?: "publish" | "subscribe";
      ttlSeconds?: number;
    };
    if (!identity)
      return res.status(400).json({ error: "identity is required" });
    const rn =
      roomName ||
      (identity.includes(":") ? identity.split(":").pop()! : identity);
    const token = await liveKitTokenService.mintAccessTokenAsync({
      identity,
      roomName: rn,
      grants: {
        roomJoin: true,
        canPublish: mode === "subscribe" ? false : true,
        canSubscribe: mode === "subscribe" ? true : false,
        room: rn,
      },
      ttlSeconds: ttlSeconds && ttlSeconds > 0 ? ttlSeconds : 300,
    });
    if (!token) return res.status(500).json({ error: "Failed to mint token" });
    return res.json({ url: liveKitTokenService.getUrl(), roomName: rn, token });
  } catch (error) {
    logger.error({ error }, "Error minting LiveKit token");
    return res.status(500).json({ error: "internal_error" });
  }
});

export default router;
