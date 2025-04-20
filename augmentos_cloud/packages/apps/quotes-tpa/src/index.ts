/**
 * Quotes TPA
 * 
 * A TPA that provides inspirational quotes to the AugmentOS dashboard.
 * Demonstrates proper handling of SDK event types.
 */
import express from 'express';
import { 
  TpaSession,
  DashboardMode,
  CloudToTpaMessageType,
  StreamType
} from '@augmentos/sdk';
import { logger } from '@augmentos/utils';
import { FamousQuotesAgent } from '@augmentos/agents';

// Configuration
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3002;
const CLOUD_HOST_NAME = process.env.CLOUD_LOCAL_HOST_NAME || "cloud";
const PACKAGE_NAME = "org.augmentos.quotes";
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
  quoteHistory: string[];
  currentQuote?: string;
  updateInterval?: NodeJS.Timeout;
  isActive: boolean;
  lastQuoteTime?: number;
}

const activeSessions = new Map<string, SessionInfo>();

// Quote generation frequency (in milliseconds)
const QUOTE_UPDATE_INTERVAL = 10 * 60 * 1000; // 10 minutes

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
      quoteHistory: [],
      isActive: true
    });

    // Connect to AugmentOS Cloud
    await session.connect(sessionId);
    logger.info(`Connected to AugmentOS Cloud for session ${sessionId}`);

    // Set up event handlers
    setupEventHandlers(sessionId, session);

    // Generate the first quote after a short delay
    setTimeout(() => {
      generateAndSendQuote(sessionId);
    }, 3000);

    // Start periodic quote generation
    const updateInterval = setInterval(() => {
      generateAndSendQuote(sessionId);
    }, QUOTE_UPDATE_INTERVAL);

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
  // CORRECT WAY: Using the high-level event handler for head position
  session.onHeadPosition((data) => {
    if (data.position === 'up') {
      // Generate a new quote when the user looks up (if enough time has passed)
      const sessionInfo = activeSessions.get(sessionId);
      if (sessionInfo && sessionInfo.isActive) {
        const lastQuoteTime = sessionInfo.lastQuoteTime || 0;
        const now = Date.now();
        if (now - lastQuoteTime > 45000) { // 45 seconds minimum between quotes
          generateAndSendQuote(sessionId);
          sessionInfo.lastQuoteTime = now;
        }
      }
    }
  });

  // CORRECT WAY: Using the dashboard API for mode changes
  session.dashboard.content.onModeChange((mode) => {
    logger.info(`Dashboard mode changed to ${mode} for session ${sessionId}`);
    
    // Update quote for the new mode if it's expanded
    if (mode === DashboardMode.EXPANDED) {
      const sessionInfo = activeSessions.get(sessionId);
      if (sessionInfo && sessionInfo.currentQuote) {
        session.dashboard.content.writeToExpanded(sessionInfo.currentQuote);
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
// Quote Generation
// ==================================
async function generateAndSendQuote(sessionId: string): Promise<void> {
  const sessionInfo = activeSessions.get(sessionId);
  if (!sessionInfo || !sessionInfo.isActive) return;

  try {
    // Use FamousQuotesAgent to generate a quote
    const quotesAgent = new FamousQuotesAgent();
    const result = await quotesAgent.handleContext({ 
      agentHistory: sessionInfo.quoteHistory || [] 
    });

    if (result && result.insight) {
      const quote = result.insight;
      
      // Update session info
      sessionInfo.currentQuote = quote;
      if (result.agentHistory) {
        sessionInfo.quoteHistory = result.agentHistory;
      }
      
      // Send quote to dashboard for main and expanded modes
      logger.info(`Sending quote to dashboard: ${quote.substring(0, 30)}...`);
      sessionInfo.session.dashboard.content.write(
        quote, 
        [DashboardMode.MAIN, DashboardMode.EXPANDED]
      );
      
      // Send a shortened version to always-on mode
      const shortQuote = quote.length > 40 
        ? quote.substring(0, 40) + '...' 
        : quote;
      sessionInfo.session.dashboard.content.writeToAlwaysOn(shortQuote);
      
      // Remember when we sent this quote
      sessionInfo.lastQuoteTime = Date.now();
    }
  } catch (error) {
    logger.error(`Error generating quote for session ${sessionId}:`, error);
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

// Force generate a new quote
app.post('/admin/generate-quote', async (req: express.Request, res: express.Response) => {
  try {
    const { sessionId } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Missing sessionId' });
    }
    
    if (!activeSessions.has(sessionId)) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    await generateAndSendQuote(sessionId);
    res.status(200).json({ status: 'quote generated' });
  } catch (error) {
    logger.error('Error generating quote', error);
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
  logger.info(`Quotes TPA running on port ${PORT}`);
  logger.info(`Connecting to AugmentOS Cloud at ${CLOUD_HOST_NAME}`);
});