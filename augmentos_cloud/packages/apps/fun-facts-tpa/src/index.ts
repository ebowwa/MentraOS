/**
 * Fun Facts TPA
 * 
 * A simple TPA that provides fun facts to the dashboard.
 * Demonstrates using the SDK's dashboard content API.
 */
import express from 'express';
import { 
  TpaSession,
  DashboardMode,
  StreamType
} from '@augmentos/sdk';
import { logger } from '@augmentos/utils';
import { FunFactAgent } from '@augmentos/agents';

// Configuration
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;
const CLOUD_HOST_NAME = process.env.CLOUD_LOCAL_HOST_NAME || "cloud";
const PACKAGE_NAME = "org.augmentos.fun-facts";
const API_KEY = process.env.AUGMENTOS_AUTH_JWT_SECRET;

if (!API_KEY) {
  logger.error("API_KEY is not set. Please set the AUGMENTOS_AUTH_JWT_SECRET environment variable.");
  process.exit(1);
}

// Express app setup
const app = express();
app.use(express.json());

// Session management
interface SessionInfo {
  userId: string;
  session: TpaSession;
  factHistory: string[];
  currentFact?: string;
  updateInterval?: NodeJS.Timeout;
  isActive: boolean;
}

const activeSessions = new Map<string, SessionInfo>();

// Fun fact generation frequency (in milliseconds)
const FACT_UPDATE_INTERVAL = 5 * 60 * 1000; // 5 minutes

// ==================================
// Webhook Endpoint - Entry Point
// ==================================
app.post('/webhook', async (req: express.Request, res: express.Response) => {
  try {
    const { sessionId, userId } = req.body;
    logger.info(`Session start for user ${userId}, session ${sessionId}`);

    // Clean up any existing session
    cleanupSession(sessionId);

    // Create new TPA session
    const session = new TpaSession({
      packageName: PACKAGE_NAME,
      apiKey: API_KEY,
      augmentOSWebsocketUrl: `ws://${CLOUD_HOST_NAME}/tpa-ws`
    });

    // Store session info
    activeSessions.set(sessionId, {
      userId,
      session,
      factHistory: [],
      isActive: true
    });

    // Connect to AugmentOS Cloud
    await session.connect(sessionId);
    logger.info(`Connected to AugmentOS Cloud for session ${sessionId}`);

    // Set up event handlers
    setupEventHandlers(sessionId, session);

    // Generate the first fun fact after a short delay
    setTimeout(() => {
      generateAndSendFact(sessionId);
    }, 2000);

    // Start periodic fact generation
    const updateInterval = setInterval(() => {
      generateAndSendFact(sessionId);
    }, FACT_UPDATE_INTERVAL);

    // Store update interval
    const sessionInfo = activeSessions.get(sessionId);
    if (sessionInfo) {
      sessionInfo.updateInterval = updateInterval;
    }

    // Respond to webhook
    res.status(200).json({ status: 'connected' });
  } catch (error) {
    logger.error('Error handling webhook', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================================
// Event Handlers
// ==================================
function setupEventHandlers(sessionId: string, session: TpaSession): void {
  // Listen for head position to update the fact when the user looks up
  session.onHeadPosition((data) => {
    if (data.position === 'up') {
      // Only generate a new fact if it's been at least 30 seconds since the last one
      const sessionInfo = activeSessions.get(sessionId);
      if (sessionInfo && sessionInfo.isActive) {
        // Check if we've sent a fact recently
        const lastFactTime = sessionInfo.lastFactTime || 0;
        const now = Date.now();
        if (now - lastFactTime > 30000) { // 30 seconds
          generateAndSendFact(sessionId);
          sessionInfo.lastFactTime = now;
        }
      }
    }
  });

  // Listen for dashboard mode changes
  session.dashboard.content.onModeChange((mode) => {
    logger.info(`Dashboard mode changed to ${mode} for session ${sessionId}`);
    
    // If mode has changed to expanded, send a fact to expanded mode
    if (mode === DashboardMode.EXPANDED) {
      const sessionInfo = activeSessions.get(sessionId);
      if (sessionInfo && sessionInfo.currentFact) {
        session.dashboard.content.writeToExpanded(sessionInfo.currentFact);
      }
    }
  });

  // Handle disconnection
  session.events.on('disconnected', (reason) => {
    logger.info(`Session ${sessionId} disconnected: ${reason}`);
    cleanupSession(sessionId);
  });
}

// ==================================
// Fun Fact Generation
// ==================================
async function generateAndSendFact(sessionId: string): Promise<void> {
  const sessionInfo = activeSessions.get(sessionId);
  if (!sessionInfo || !sessionInfo.isActive) return;

  try {
    // Use FunFactAgent to generate a fact
    const funFactAgent = new FunFactAgent();
    const result = await funFactAgent.handleContext({ 
      agentHistory: sessionInfo.factHistory || [] 
    });

    if (result && result.insight) {
      const fact = result.insight;
      
      // Update session info
      sessionInfo.currentFact = fact;
      if (result.agentHistory) {
        sessionInfo.factHistory = result.agentHistory;
      }
      
      // Send fact to dashboard for main and expanded modes
      logger.info(`Sending fun fact to dashboard: ${fact.substring(0, 30)}...`);
      sessionInfo.session.dashboard.content.write(
        fact, 
        [DashboardMode.MAIN, DashboardMode.EXPANDED]
      );
      
      // Send a shortened version to always-on mode if needed
      const shortFact = fact.length > 40 
        ? fact.substring(0, 40) + '...' 
        : fact;
      sessionInfo.session.dashboard.content.writeToAlwaysOn(shortFact);
    }
  } catch (error) {
    logger.error(`Error generating fun fact for session ${sessionId}:`, error);
  }
}

// ==================================
// Session Management
// ==================================
function cleanupSession(sessionId: string): void {
  const sessionInfo = activeSessions.get(sessionId);
  if (!sessionInfo) return;
  
  // Clear interval
  if (sessionInfo.updateInterval) {
    clearInterval(sessionInfo.updateInterval);
  }
  
  // Mark as inactive
  sessionInfo.isActive = false;
  
  // Disconnect session
  try {
    sessionInfo.session.disconnect();
  } catch (error) {
    logger.error(`Error disconnecting session ${sessionId}:`, error);
  }
  
  // Remove from active sessions
  activeSessions.delete(sessionId);
  logger.info(`Cleaned up session ${sessionId}`);
}

// ==================================
// Admin Endpoints
// ==================================

// Force generate a new fact
app.post('/admin/generate-fact', async (req: express.Request, res: express.Response) => {
  try {
    const { sessionId } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Missing sessionId' });
    }
    
    if (!activeSessions.has(sessionId)) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    await generateAndSendFact(sessionId);
    res.status(200).json({ status: 'fact generated' });
  } catch (error) {
    logger.error('Error generating fact', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get active sessions
app.get('/admin/sessions', (req: express.Request, res: express.Response) => {
  const sessions = Array.from(activeSessions.keys());
  res.status(200).json({ sessions, count: sessions.length });
});

// ==================================
// Health Check
// ==================================
app.get('/health', (req: express.Request, res: express.Response) => {
  res.json({ 
    status: 'healthy', 
    app: PACKAGE_NAME,
    sessions: activeSessions.size
  });
});

// ==================================
// Start Server
// ==================================
app.listen(PORT, () => {
  logger.info(`Fun Facts TPA running on port ${PORT}`);
  logger.info(`Connecting to AugmentOS Cloud at ${CLOUD_HOST_NAME}`);
});