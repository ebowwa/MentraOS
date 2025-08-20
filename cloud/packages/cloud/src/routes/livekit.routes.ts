import { Router, Request, Response } from 'express';
import { logger } from '../services/logging/pino-logger';
import { sessionService } from '../services/session/session.service';

const router = Router();

// Handlers (defined first per code style)
async function getLiveKitInfo(req: Request, res: Response) {
  try {
    const { sessionId, mode } = req.query as { sessionId?: string; mode?: string };
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }
    const userSession = sessionService.getSession(sessionId);
    if (!userSession) {
      return res.status(404).json({ error: 'session_not_found' });
    }

    const url = userSession.liveKitManager.getUrl();
    const roomName = userSession.liveKitManager.getRoomName();
    const token = mode === 'subscribe'
      ? userSession.liveKitManager.mintAgentSubscribeToken()
      : userSession.liveKitManager.mintClientPublishToken();

    if (!url || !roomName || !token) {
      return res.status(500).json({ error: 'livekit_not_configured' });
    }

    res.json({ url, roomName, token });
  } catch (error) {
    logger.error({ error }, 'Error getting LiveKit info');
    res.status(500).json({ error: 'internal_error' });
  }
}

// Routes (at bottom)
router.get('/livekit/info', getLiveKitInfo);

export default router;
