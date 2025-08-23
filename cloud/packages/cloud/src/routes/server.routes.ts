// // routes/admin.routes.ts
// import { Router, Request, Response } from 'express';
// import { logger  } from '../services/logging/pino-logger';
// import { liveKitTokenService } from '../services/session/LiveKitTokenService';
// // import { getSessionStats } from '../services/debug/server-stats';

// const router = Router();

// /**
//  * Get admin dashboard stats - simplified version
//  */
// // async function sessionStats(req: Request, res: Response) {
// //   try {
// //     const sessionStats = getSessionStats();
// //     res.json(sessionStats);
// //   } catch (error) {
// //     logger.error('Error fetching admin stats:', error);
// //     res.status(500).json({ error: 'Failed to fetch admin stats' });
// //   }
// // };

// // // App review routes
// // router.get('/session-stats', sessionStats);

// // Dev-only: mint a LiveKit token for quick testing (DO NOT EXPOSE IN PROD)
// router.post('/livekit/token', (req: Request, res: Response) => {
//   try {
//     const { identity, roomName, mode } = req.body as { identity: string; roomName: string; mode?: 'publish' | 'subscribe' };
//     if (!identity || !roomName) {
//       return res.status(400).json({ error: 'identity and roomName are required' });
//     }
//     const token = liveKitTokenService.mintAccessTokenAsync({
//       identity,
//       roomName,
//       grants: {
//         roomJoin: true,
//         canPublish: mode === 'subscribe' ? false : true,
//         canSubscribe: mode === 'subscribe' ? true : false,
//         room: roomName,
//       },
//       ttlSeconds: 300,
//     });
//     if (!token) {
//       return res.status(500).json({ error: 'Failed to mint token' });
//     }
//     res.json({ url: liveKitTokenService.getUrl(), token });
//   } catch (error) {
//     logger.error({ error }, 'Error minting LiveKit token');
//     res.status(500).json({ error: 'internal_error' });
//   }
// });


// export default router;