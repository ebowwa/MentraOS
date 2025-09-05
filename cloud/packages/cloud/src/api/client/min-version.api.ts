// cloud/src/api/client/feedback.routes.ts
// API endpoints for sending user feedback

import { Router, Request, Response } from "express";
import { logger } from "../../services/logging/pino-logger";
import { CLIENT_VERSIONS } from "../../version";

const router = Router();

// API Endpoints // /api/client/feedback*
router.get("/", getClientMinVersions);

// Handler functions
// Get all settings for a user
async function getClientMinVersions(req: Request, res: Response) {
  try {
    res.json({
      success: true,
      data: CLIENT_VERSIONS,
      timestamp: new Date()
    });
  } catch (error) {
    logger.error(error, `Error getting client minimum versions`);
    res.status(500).json({
      success: false,
      message: "Failed to get client minimum versions",
      timestamp: new Date()
    });
  }
}

export default router;