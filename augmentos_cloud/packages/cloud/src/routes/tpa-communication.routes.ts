import express, { Request, Response } from 'express';
import { validateCoreToken } from '../middleware/supabaseMiddleware';
import sessionService from '../services/core/session.service';
import multiUserTpaService from '../services/core/multi-user-tpa.service';

const router = express.Router();

/**
 * @route POST /api/tpa-communication/discover-users
 * @desc Discover other users currently using the same TPA
 * @access Private (requires core token)
 * @body { packageName: string, includeUserProfiles?: boolean }
 */
router.post('/discover-users', validateCoreToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).email;
    const { packageName, includeUserProfiles = false } = req.body;
    if (!packageName) {
      return res.status(400).json({ error: 'packageName is required' });
    }
    // Find the user's active session
    const userSession = sessionService.getSessionByUserId(userId);
    if (!userSession) {
      return res.status(404).json({ error: 'No active session found for user' });
    }
    // Build a discovery message object
    const discoveryMessage = {
      type: 'tpa_user_discovery',
      packageName,
      sessionId: userSession.sessionId + '-' + packageName,
      includeUserProfiles,
      requestId: `discovery_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      timestamp: new Date()
    };
    // Use the service to get the user list (adapted from websocket handler)
    const users = multiUserTpaService.getActiveTpaUsers(packageName)
      .filter((otherUserId: string) => otherUserId !== userId)
      .map((otherUserId: string) => {
        const otherSession = sessionService.getSessionByUserId(otherUserId);
        return {
          userId: otherUserId,
          sessionId: otherSession?.sessionId || 'unknown',
          joinedAt: new Date(), // TODO: Track actual join time
          userProfile: includeUserProfiles ? multiUserTpaService['getUserProfile'](otherUserId) : undefined
        };
      });
    return res.json({
      users,
      totalUsers: users.length,
      timestamp: new Date()
    });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

export default router;
