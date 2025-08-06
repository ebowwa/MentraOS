// Express Routes for App Uptime API Endpoints
// This file defines web endpoints that external systems can call to manage app uptime tracking

// Import Express framework components for handling HTTP requests
import { Router, Request, Response } from 'express';
import { logger } from "../services/logging/pino-logger";
import * as AppUptimeService from "../services/core/app-uptime.service";
import axios from 'axios';
import { fetchSubmittedAppHealthStatus } from '../services/core/app-uptime.service';

const router = Router();

// Start the uptime scheduler when the routes are loaded
// AppUptimeService.startUptimeScheduler(); 
logger.info("🔄 App uptime monitoring scheduler started automatically");

// Endpoint to start the uptime check process TESTING PURPOSES
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

// Endpoint to start recording app uptime TESTING PURPOSES
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

// Endpoint to create app uptime data TESTING PURPOSES
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

async function pingAppHealth (req: Request, res: Response) {
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
}
  
async function appsStatus (req: Request, res: Response) {
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
}

async function getAppUptimeDays (req: Request, res: Response) {
  const month = req.query.month as string;
  const year = parseInt(req.query.year as string);

  try {
    const result = await AppUptimeService.collectAllAppBatchStatus(month, year);
    res.json(result);
  } catch(error) {
    logger.error('Error fetching app uptime days:', error);
    res.status(500).json({
      error: true,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
}

// Api Endpoints
router.post('/start-uptimecheck', startUptimeCheck);

router.post('/record-app-uptime', startRecordAppUptime);

router.post('/create-app-uptime-data', createAppUptimeData);

router.get('/ping', pingAppHealth);

router.get('/status', appsStatus);

router.get('/get-app-uptime-days', getAppUptimeDays);

  


export default router;