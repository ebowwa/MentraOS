/**
 * Gratitude TPA
 * 
 * A TPA that provides gratitude reminders to the AugmentOS dashboard.
 * Demonstrates best practices for using the SDK.
 */
import express from 'express';
import { 
  TpaSession,
  DashboardMode
} from '@augmentos/sdk';
import { logger } from '@augmentos/utils';
import { GratitudePingAgent } from '@augmentos/agents';

// Configuration
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3003;
const CLOUD_HOST_NAME = process.env.CLOUD_LOCAL_HOST_NAME || "cloud";
const PACKAGE_NAME = "org.augmentos.gratitude";
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
  gratitudeHistory: string[];
  currentReminder?: string;
  updateInterval?: NodeJS.Timeout;
  isActive: boolean;
  lastUpdateTime?: number;
}

const activeSessions = new Map<string, SessionInfo>();

// Gratitude reminder frequency (in milliseconds)
const GRATITUDE_UPDATE_INTERVAL = 20 * 60 * 1000; // 20 minutes

// ==================================
// Webhook Endpoint - Entry Point
// ==================================
app.post('/webhook', async (req: express.Request, res: express.Response) => {
  try {
    const { sessionId, userId } = req.body;
    logger.info(`Session start for user ${userId}, session ${sessionId}`);

    // Clean up any existing session
    cleanupSession(sessionId);

    // Create new TPA session using the SDK
    const session = new TpaSession({
      packageName: PACKAGE_NAME,
      apiKey: API_KEY,
      augmentOSWebsocketUrl: `ws://${CLOUD_HOST_NAME}/tpa-ws`
    });

    // Store session info
    activeSessions.set(sessionId, {
      userId,
      session,
      gratitudeHistory: [],
      isActive: true
    });

    // Connect to AugmentOS Cloud
    await session.connect(sessionId);
    logger.info(`Connected to AugmentOS Cloud for session ${sessionId}`);

    // Set up event handlers
    setupEventHandlers(sessionId, session);

    // Generate the first gratitude reminder after a short delay
    setTimeout(() => {
      generateAndSendGratitudeReminder(sessionId);
    }, 4000);

    // Start periodic gratitude reminder generation
    const updateInterval = setInterval(() => {
      generateAndSendGratitudeReminder(sessionId);
    }, GRATITUDE_UPDATE_INTERVAL);

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
  // Handle head position using the proper SDK event handler
  session.onHeadPosition((data) => {
    if (data.position === 'up') {
      // Only generate a new reminder if it's been at least 1 minute
      const sessionInfo = activeSessions.get(sessionId);
      if (sessionInfo && sessionInfo.isActive) {
        const lastUpdateTime = sessionInfo.lastUpdateTime || 0;
        const now = Date.now();
        if (now - lastUpdateTime > 60000) { // 1 minute
          generateAndSendGratitudeReminder(sessionId);
          sessionInfo.lastUpdateTime = now;
        }
      }
    }
  });

  // Listen for dashboard mode changes to adjust content
  session.dashboard.content.onModeChange((mode) => {
    logger.info(`Dashboard mode changed to ${mode} for session ${sessionId}`);
    
    if (mode === DashboardMode.EXPANDED) {
      const sessionInfo = activeSessions.get(sessionId);
      if (sessionInfo && sessionInfo.currentReminder) {
        // For expanded mode, add more context to the gratitude reminder
        const expandedReminder = `Gratitude Reminder: ${sessionInfo.currentReminder}`;
        session.dashboard.content.writeToExpanded(expandedReminder);
      }
    }
  });

  // Handle session disconnection
  session.events.on('disconnected', (reason) => {
    logger.info(`Session ${sessionId} disconnected: ${reason}`);
    cleanupSession(sessionId);
  });
}

// ==================================
// Gratitude Reminder Generation
// ==================================
async function generateAndSendGratitudeReminder(sessionId: string): Promise<void> {
  const sessionInfo = activeSessions.get(sessionId);
  if (!sessionInfo || !sessionInfo.isActive) return;

  try {
    // Use GratitudePingAgent to generate a gratitude reminder
    const gratitudeAgent = new GratitudePingAgent();
    const result = await gratitudeAgent.handleContext({ 
      agentHistory: sessionInfo.gratitudeHistory || [] 
    });

    if (result && result.insight) {
      const reminder = result.insight;
      
      // Update session info
      sessionInfo.currentReminder = reminder;
      if (result.agentHistory) {
        sessionInfo.gratitudeHistory = result.agentHistory;
      }
      
      // Send reminder to dashboard for main mode
      logger.info(`Sending gratitude reminder to dashboard: ${reminder.substring(0, 30)}...`);
      
      // Send appropriately formatted content to each dashboard mode
      const mainReminder = reminder;
      const expandedReminder = `Gratitude Reminder: ${reminder}`;
      const alwaysOnReminder = reminder.length > 35 
        ? reminder.substring(0, 35) + '...' 
        : reminder;
      
      // Main mode
      sessionInfo.session.dashboard.content.writeToMain(mainReminder);
      
      // Expanded mode
      sessionInfo.session.dashboard.content.writeToExpanded(expandedReminder);
      
      // Always-on mode
      sessionInfo.session.dashboard.content.writeToAlwaysOn(alwaysOnReminder);
      
      // Update timestamp
      sessionInfo.lastUpdateTime = Date.now();
    }
  } catch (error) {
    logger.error(`Error generating gratitude reminder for session ${sessionId}:`, error);
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

// Force generate a new gratitude reminder
app.post('/admin/generate-reminder', async (req: express.Request, res: express.Response) => {
  try {
    const { sessionId } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Missing sessionId' });
    }
    
    if (!activeSessions.has(sessionId)) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    await generateAndSendGratitudeReminder(sessionId);
    res.status(200).json({ status: 'reminder generated' });
  } catch (error) {
    logger.error('Error generating reminder', error);
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
  logger.info(`Gratitude TPA running on port ${PORT}`);
  logger.info(`Connecting to AugmentOS Cloud at ${CLOUD_HOST_NAME}`);
});