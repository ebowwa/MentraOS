import express from 'express';
import { logger } from '../services/logging/pino-logger';
import { sessionService } from '../services/session/session.service';

const router = express.Router();

/**
 * Get Cloudflare ingest URL for a specific stream
 * Used by RTMP relay to lookup where to forward streams
 */
router.get('/cf-url/:userId/:streamId', (req, res) => {
  const { userId, streamId } = req.params;
  
  logger.info({ userId, streamId }, 'RTMP relay requesting Cloudflare URL');
  
  try {
    // Get user session
    const userSession = sessionService.getSessionByUserId(userId);
    
    if (!userSession) {
      logger.warn({ userId, streamId }, 'User session not found for RTMP relay request');
      return res.status(404).json({ 
        error: 'Session not found',
        message: `No active session found for userId: ${userId}`
      });
    }
    
    // Access StreamStateManager through ManagedStreamingExtension
    const streamState = userSession.managedStreamingExtension.getStreamByStreamId(streamId);
    
    if (!streamState) {
      logger.warn({ userId, streamId }, 'Stream not found for RTMP relay request');
      return res.status(404).json({ 
        error: 'Stream not found',
        message: `No active stream found for streamId: ${streamId}`
      });
    }
    
    // Verify this is a managed stream
    if (streamState.type !== 'managed') {
      logger.warn({ 
        userId, 
        streamId, 
        streamType: streamState.type 
      }, 'RTMP relay requested URL for non-managed stream');
      return res.status(400).json({ 
        error: 'Invalid stream type',
        message: 'Only managed streams can be relayed'
      });
    }
    
    // Verify userId matches
    if (streamState.userId !== userId) {
      logger.warn({ 
        userId, 
        streamId, 
        expectedUserId: streamState.userId 
      }, 'UserId mismatch in RTMP relay request');
      return res.status(403).json({ 
        error: 'Unauthorized',
        message: 'UserId does not match stream owner'
      });
    }
    
    // Return the Cloudflare ingest URL
    logger.info({ 
      userId, 
      streamId,
      cfLiveInputId: streamState.cfLiveInputId 
    }, 'Returning Cloudflare URL to RTMP relay');
    
    res.json({ 
      url: streamState.cfIngestUrl,
      streamId: streamState.streamId,
      cfLiveInputId: streamState.cfLiveInputId
    });
    
  } catch (error) {
    logger.error({ 
      error, 
      userId, 
      streamId 
    }, 'Error processing RTMP relay request');
    
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Failed to retrieve stream information'
    });
  }
});

/**
 * Notify cloud that HLS streams are ready
 * Called by MediaMTX relay when streams become available
 */
router.post('/hls-ready', (req, res) => {
  const { userId, streamId, hlsUrl, dashUrl } = req.body;
  
  logger.info({ 
    userId, 
    streamId, 
    hlsUrl,
    dashUrl 
  }, 'RTMP relay notifying HLS ready');
  
  try {
    // Validate required fields
    if (!userId || !streamId || !hlsUrl) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['userId', 'streamId', 'hlsUrl']
      });
    }
    
    // Get user session
    const userSession = sessionService.getSessionByUserId(userId);
    
    if (!userSession) {
      logger.warn({ userId, streamId }, 'User session not found for HLS ready notification');
      return res.status(404).json({ 
        error: 'Session not found',
        message: `No active session found for userId: ${userId}`
      });
    }
    
    // Transform localhost URLs to public relay URLs
    // The relay sends localhost:8888 but we need the public URL
    const relay = userSession.managedStreamingExtension.getRelayForUser(userId);
    
    // Replace localhost:8888 with the relay's public HLS URL
    const publicHlsUrl = hlsUrl.replace('http://localhost:8888', relay.hlsBaseUrl || 'http://localhost:8888');
    const publicDashUrl = dashUrl ? dashUrl.replace('http://localhost:8888', relay.hlsBaseUrl || 'http://localhost:8888') : undefined;
    
    // Update stream state with public URLs
    const updated = userSession.managedStreamingExtension.updateStreamUrls(
      streamId,
      publicHlsUrl,
      publicDashUrl
    );
    
    if (!updated) {
      logger.warn({ userId, streamId }, 'Stream not found for HLS ready notification');
      return res.status(404).json({ 
        error: 'Stream not found',
        message: `No active stream found for streamId: ${streamId}`
      });
    }
    
    logger.info({ 
      userId, 
      streamId 
    }, 'Successfully updated stream with HLS URLs');
    
    res.json({ 
      success: true,
      message: 'HLS URLs updated'
    });
    
  } catch (error) {
    logger.error({ 
      error, 
      userId, 
      streamId 
    }, 'Error processing HLS ready notification');
    
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Failed to update stream URLs'
    });
  }
});

/**
 * Health check endpoint for RTMP relay service monitoring
 */
router.get('/health', (req, res) => {
  // Get stats from any active user session (they all share the same state)
  const sessions = sessionService.getAllSessions();
  let stats = { totalStreams: 0, managedStreams: 0, totalViewers: 0 };
  
  if (sessions.length > 0) {
    stats = sessions[0].managedStreamingExtension.getStats();
  }
  
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    streams: {
      total: stats.totalStreams,
      managed: stats.managedStreams,
      viewers: stats.totalViewers
    }
  });
});

export default router;