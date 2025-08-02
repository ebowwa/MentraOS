// routes/tools.routes.ts
import { Router, Request, Response } from 'express';
import { logger } from "../services/logging/pino-logger";
import * as AppUptimeService from "../services/core/app-uptime.service";

const router = Router();

/**
 * Get all tools for a specific App
 * Used by Mira AI to discover available tools
 */
const startUptimeCheck = async (req: Request, res: Response) => {
  try {
    await AppUptimeService.startAppUptimeCheck()
    // Return the tools array
    res.send({
      message: "cool"
    });
  } catch (error) {
    logger.error('Error fetching App tools:', error);
    res.status(500).json({
      error: true,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};


// Tool webhook routes - Used by Mira AI
router.post('/start-uptimecheck', startUptimeCheck);

export default router;