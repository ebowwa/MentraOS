//backend/src/routes/apps.ts
import express from 'express';
import UserSession from '../services/session/UserSession';
import { TranscriptSegment } from '@mentra/sdk';
const router = express.Router();

// GET /api/transcripts/:appSessionId
// Headers:
//   - X-API-Key: <app-api-key>
//   - X-Package-Name: <app-package-name>
// Query Parameters:
//   - duration: number (seconds to look back)
//   - startTime?: ISO timestamp (optional alternative to duration)
//   - endTime?: ISO timestamp (optional alternative to duration)
//   - language?: string (language code, e.g. 'en-US', 'fr-FR', defaults to 'en-US')

// Get all available apps
router.get('/api/transcripts/:appSessionId', async (req, res) => {
  try {
    const appSessionId = req.params.appSessionId;
    const duration = req.query.duration;
    const startTime = req.query.startTime;
    const endTime = req.query.endTime;
    const language = (req.query.language as string) || 'en-US';

    console.log(`🔍 Fetching transcripts for session ${appSessionId}, language: ${language}`);

    if (!duration && !startTime && !endTime) {
      return res.status(400).json({ error: 'duration, startTime, or endTime is required' });
    }

    const userSessionId = appSessionId.split('-')[0];
    const userSession = UserSession.getById(userSessionId);
    if (!userSession) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Use TranscriptionManager to get transcript history
    const timeRange: any = {};

    if (duration) {
      timeRange.duration = parseInt(duration as string);
    }

    // TODO: Add handling for startTime/endTime filters
    if (startTime) {
      timeRange.startTime = new Date(startTime as string);
    }

    if (endTime) {
      timeRange.endTime = new Date(endTime as string);
    }

    const transcriptSegments = userSession.transcriptionManager.getTranscriptHistory(
      language,
      Object.keys(timeRange).length > 0 ? timeRange : undefined
    );

    console.log(`💬 Returning ${transcriptSegments.length} transcript segments for language ${language}`);

    res.json({
      language: language,
      segments: transcriptSegments
    });

  } catch (error) {
    console.error('Error fetching transcripts:', error);
    res.status(500).json({ error: 'Error fetching transcripts' });
  }
});

export default router;