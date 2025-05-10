import express from 'express';
import sessionService, { IS_LC3 } from '../services/core/session.service';
const router = express.Router();

// GET /api/audio/:sessionId
// Returns the last 10 seconds of audio for the session as a binary buffer (decoded to PCM if LC3)
router.get('/api/audio/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const userSession = sessionService.getSession(userId);

    if (!userSession) {
      return res.status(404).json({ error: 'Session not found' });
    }
    if (!userSession.recentAudioBuffer || userSession.recentAudioBuffer.length === 0) {
      return res.status(404).json({ error: 'No audio available' });
    }

    let buffers: Buffer[] = [];
    if (IS_LC3 && userSession.lc3Service) {
      // Decode each chunk to PCM
      for (const chunk of userSession.recentAudioBuffer) {
        try {
          // decodeAudioChunk may be async
          const decoded = await userSession.lc3Service.decodeAudioChunk(chunk.data);
          if (decoded) {
            buffers.push(Buffer.from(decoded));
          }
        } catch (err) {
          console.error('Error decoding LC3 chunk:', err);
        }
      }
    } else {
      // Not LC3, just use the raw data
      buffers = userSession.recentAudioBuffer.map(chunk => Buffer.from(chunk.data));
    }
    if (buffers.length === 0) {
      return res.status(404).json({ error: 'No decodable audio available' });
    }
    const audioBuffer = Buffer.concat(buffers);
    res.set('Content-Type', 'application/octet-stream');
    res.send(audioBuffer);
  } catch (error) {
    console.error('Error fetching audio:', error);
    res.status(500).json({ error: 'Error fetching audio' });
  }
});

export default router; 