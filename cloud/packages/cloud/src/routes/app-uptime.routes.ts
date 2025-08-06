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

// Endpoint to ping an app's health status
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
  
// Endpoint to get the status of all apps
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

// Endpoint to get app uptime days for a specific month and year
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

// Endpoint to ping an app's health status
router.get('/ping', pingAppHealth);

// Endpoint to get the status of all apps
router.get('/status', appsStatus);

// Endpoint to get app uptime days for a specific month and year
router.get('/get-app-uptime-days', getAppUptimeDays);

  


export default router;