import express from 'express';
import sessionService from '../services/core/session.service';

const router = express.Router();

// POST /api/user-data/set-datetime
// Body: { userId: string, datetime: string (ISO format) }
router.post('/set-datetime', (req, res) => {
  const { userId, datetime } = req.body;
  console.log('Setting datetime for user', userId, datetime);
  if (!userId || !datetime || isNaN(Date.parse(datetime))) {
    return res.status(400).json({ error: 'Missing or invalid userId or datetime (must be ISO string)' });
  }
  const userSession = sessionService.getSessionByUserId(userId);
  if (!userSession) {
    return res.status(404).json({ error: 'User session not found' });
  }
  // Store the datetime in the session (custom property)
  userSession.userDatetime = datetime;
  console.log('User session updated', userSession.userDatetime);

  // Send a DashboardSystemUpdate message to the dashboard TPA to update the topLeft section
  console.log('Sending DashboardSystemUpdate message to dashboard TPA');
  console.log('userSession.appConnections', userSession.appConnections);
  if (userSession.appConnections && userSession.appConnections.has('system.augmentos.dashboard')) {
    console.log('Sending custom message to dashboard TPA');
    const ws = userSession.appConnections.get('system.augmentos.dashboard');
    if (ws && ws.readyState === 1) { // WebSocket.OPEN === 1
      const customMessage = {
        type: 'custom_message',
        action: 'update_datetime',
        payload: {
          datetime: datetime,
          section: 'topLeft'
        },
        timestamp: new Date()
      };
      ws.send(JSON.stringify(customMessage));
    }
  }

  // Trigger dashboard update if dashboardManager exists
  if (userSession.dashboardManager && typeof userSession.dashboardManager.updateDashboard === 'function') {
    console.log('Triggering dashboard update');
    userSession.dashboardManager.updateDashboard();
  } else {
    console.log('No dashboard manager found');
  }
  res.json({ success: true, userId, datetime });
});

export default router; 