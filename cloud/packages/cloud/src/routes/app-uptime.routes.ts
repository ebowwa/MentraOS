// Express Routes for App Uptime API Endpoints
// This file defines web endpoints that external systems can call to manage app uptime tracking

// Import Express framework components for handling HTTP requests
import { Router, Request, Response } from 'express';
import { logger } from "../services/logging/pino-logger";
import * as AppUptimeService from "../services/core/app-uptime.service";
import axios from 'axios';
import { fetchSubmittedAppHealthStatus } from '../services/core/app-uptime.service';

// Create Express router - this groups related routes together
const router = Router();

// Start the uptime scheduler when the routes are loaded
// AppUptimeService.startUptimeScheduler();
logger.info("🔄 App uptime monitoring scheduler started automatically");

/**
 * HTTP POST endpoint handler for starting uptime checks
 * When someone makes a POST request to /start-uptimecheck, this function runs
 * 
 * @param req - The incoming HTTP request (contains data sent by client)
 * @param res - The HTTP response we'll send back to the client
 */
const startUptimeCheck = async (req: Request, res: Response) => {
  try {
    // Call the service function that contains the business logic
    await AppUptimeService.startAppUptimeCheck()
    
    // Send success response back to the client
    res.send({
      message: "cool"
    });
  } catch (error) {
    // If something goes wrong, log the error and send error response
    logger.error('Error starting uptime check:', error);
    res.status(500).json({
      error: true,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};


const startRecordAppUptime = async (req: Request, res: Response) => {
  try {
    // Call the service function that contains the business logic
    await AppUptimeService.recordAppUptime("test.package.name");

    // Send success response back to the client
    res.send({
      message: "created app uptime data successfully"
    });
  } catch (error) {
    // If something goes wrong, log the error and send error response
    logger.error('Error starting uptime check:', error);
    res.status(500).json({
      error: true,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};


const createAppUptimeData = async (req: Request, res: Response) => {
  try {
    await AppUptimeService.createAppUptimeData("test.package.name");

    res.send({
      message: "App uptime data created successfully"
    });

  } 
  catch (error) {
    logger.error('Error creating app uptime data:', error);
    res.status(500).json({
      error: true,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
}

const getAppHealthStatus = async (req: Request, res: Response) => {
  const packageName = req.query.packageName as string;
  try {
    const healthData = await AppUptimeService.getAppHealth(packageName);
    res.send(healthData);
  } catch (error) {
    logger.error('Error fetching app health:', error);
    res.status(500).json({
      error: true,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Register the route - when POST request comes to '/start-uptimecheck', 
// call the startUptimeCheck function
// POST is used because this action triggers a process (not just retrieving data)
router.post('/start-uptimecheck', startUptimeCheck);

router.post('/record-app-uptime', startRecordAppUptime);


router.post('/create-app-uptime-data', createAppUptimeData);

router.get('/get-app-health', async (req: Request, res: Response) => {
  const packageName = req.query.packageName as string;
  try {
    const healthData = await AppUptimeService.getAppHealth(packageName);
    res.send(healthData);
  } catch (error) {
    logger.error('Error fetching app health:', error);
    res.status(500).json({
      error: true,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});
// /api/ping.ts (or .js)

router.get('/ping', async (req, res) => {
  const url = req.query.url as string;
  if (!url) return res.status(400).send('Missing URL');

  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' }
    });
    
    // If it's a health endpoint, return the actual health data
    if (url.includes('/health')) {
      res.json({
        status: response.status,
        success: response.status === 200,
        data: response.data
      });
    } else {
      res.json({
        status: response.status,
        success: response.status === 200
      });
    }
  } catch (err) {
    if (axios.isAxiosError(err)) {
      res.json({
        status: err.response?.status || 500,
        success: false,
        error: err.code === 'ECONNABORTED' ? 'Timeout' : 'Failed to reach URL'
      });
    } else {
      res.json({
        status: 500,
        success: false,
        error: 'Unknown error'
      });
    }
  }
});

router.post('/send-batch', async (req: Request, res: Response) => {
  try {
    await AppUptimeService.sendBatchUptimeData();
    res.json({
      success: true,
      message: "Batch uptime data sent successfully"
    });
  } catch (error) {
    logger.error('Error sending batch uptime data:', error);
    res.status(500).json({
      error: true,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

router.post('/start-scheduler', async (req: Request, res: Response) => {
  try {
    AppUptimeService.startUptimeScheduler();
    res.json({
      success: true,
      message: "Uptime scheduler started successfully"
    });
  } catch (error) {
    logger.error('Error starting uptime scheduler:', error);
    res.status(500).json({
      error: true,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

router.post('/stop-scheduler', async (req: Request, res: Response) => {
  try {
    AppUptimeService.stopUptimeScheduler();
    res.json({
      success: true,
      message: "Uptime scheduler stopped successfully"
    });
  } catch (error) {
    logger.error('Error stopping uptime scheduler:', error);
    res.status(500).json({
      error: true,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});



router.get('/get-submitted-app-health-status', async (req: Request, res: Response) => {
  console.log('🔍 GET /get-submitted-app-health-status called');

  try {
    const result = await fetchSubmittedAppHealthStatus();
    res.json(result);
  } catch (error) {
    console.log('❌ Error in get-submitted-app-health-status:', error);
    logger.error('Error fetching submitted app health status:', error);
    res.status(500).json({
      error: true,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

router.get('/status', async (req: Request, res: Response) => {
  try {
    const healthStatus = await fetchSubmittedAppHealthStatus();
    res.json({
      timestamp: new Date(),
      status: 'active',
      ...healthStatus
    });
  } catch (error) {
    logger.error('Error fetching app status:', error);
    res.status(500).json({
      error: true,
      message: error instanceof Error ? error.message : 'Unknown error occurred',
      timestamp: new Date()
    });
  }
});


// Export the router so it can be used in the main Express app
export default router;