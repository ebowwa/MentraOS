/**
 * Dashboard Manager TPA 
 * 
 * System TPA that provides the dashboard functionality for AugmentOS
 * using the SDK Dashboard API.
 */
import express from 'express';
import { 
  DashboardMode
} from '@augmentos/sdk';
import { logger } from '@augmentos/utils';
import { 
  initializeDashboardSession, 
  changeDashboardMode,
  updateUserSettings,
  updateAllDashboards,
  getActiveSessions
} from './dashboard';

// Configuration
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 80;
const CLOUD_HOST_NAME = process.env.CLOUD_LOCAL_HOST_NAME || "cloud";
const PACKAGE_NAME = "system.augmentos.dashboard";
const API_KEY = process.env.AUGMENTOS_AUTH_JWT_SECRET;

if (!API_KEY) {
  logger.error("API_KEY is not set. Please set the AUGMENTOS_AUTH_JWT_SECRET environment variable.");
  process.exit(1);
}

// Express app setup
const app = express();
app.use(express.json());

// ==================================
// Webhook Endpoint - Entry Point
// ==================================
app.post('/webhook', async (req: express.Request, res: express.Response) => {
  try {
    const { sessionId, userId } = req.body;
    logger.info(`Session start for user ${userId}, session ${sessionId}`);

    // Initialize a new dashboard session
    await initializeDashboardSession(
      sessionId, 
      userId, 
      API_KEY, 
      `ws://${CLOUD_HOST_NAME}/tpa-ws`
    );

    // Respond to webhook
    res.status(200).json({ status: 'connected' });
  } catch (error) {
    logger.error('Error handling webhook', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================================
// Dashboard Mode Control
// ==================================
app.post('/mode', (req: express.Request, res: express.Response) => {
  try {
    const { sessionId, mode } = req.body;
    
    if (!sessionId || !mode) {
      return res.status(400).json({ error: 'Missing sessionId or mode' });
    }
    
    if (!Object.values(DashboardMode).includes(mode)) {
      return res.status(400).json({ error: 'Invalid dashboard mode' });
    }
    
    changeDashboardMode(sessionId, mode as DashboardMode);
    res.status(200).json({ status: 'mode updated' });
  } catch (error) {
    logger.error('Error updating dashboard mode', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================================
// Settings Endpoint
// ==================================
app.post('/settings', (req: express.Request, res: express.Response) => {
  try {
    const { userIdForSettings } = req.body;
    logger.info('Received settings update for dashboard:', req.body);
    
    if (!userIdForSettings) {
      return res.status(400).json({ error: 'Missing userIdForSettings' });
    }
    
    updateUserSettings(userIdForSettings, req.body);
    res.status(200).json({ status: 'settings updated' });
  } catch (error) {
    logger.error('Error updating settings', error);
    res.status(500).json({ error: 'Internal server error updating settings' });
  }
});

// ==================================
// Admin Endpoints
// ==================================

// Force update all dashboards
app.post('/admin/update-all', (req: express.Request, res: express.Response) => {
  try {
    updateAllDashboards();
    res.status(200).json({ status: 'all dashboards updated' });
  } catch (error) {
    logger.error('Error updating all dashboards', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all active sessions
app.get('/admin/sessions', (req: express.Request, res: express.Response) => {
  try {
    const sessions = getActiveSessions();
    res.status(200).json({ sessions, count: sessions.length });
  } catch (error) {
    logger.error('Error getting sessions', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================================
// Health Check
// ==================================
app.get('/health', (req: express.Request, res: express.Response) => {
  res.json({ 
    status: 'healthy', 
    app: PACKAGE_NAME,
    sessions: getActiveSessions().length
  });
});

// ==================================
// Start Server
// ==================================
app.listen(PORT, () => {
  logger.info(`Dashboard Manager TPA running on port ${PORT}`);
  logger.info(`Connecting to AugmentOS Cloud at ${CLOUD_HOST_NAME}`);
});

// Handle termination gracefully
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down');
  process.exit(0);
});