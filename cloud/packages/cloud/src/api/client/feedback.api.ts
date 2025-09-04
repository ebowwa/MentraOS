// cloud/src/api/client/feedback.routes.ts
// API endpoints for sending user feedback

import { Router, Request, Response } from "express";
import { logger } from "../../services/logging/pino-logger";
import * as FeedbackService from "../../services/client/feedback.service";
import { authWithUser, RequestWithUser } from "../../middleware/client/client-auth-middleware";

const router = Router();

// API Endpoints // /api/client/*
router.post("/feedback", authWithUser, submitFeedback);
router.post("/feedback/test", authWithUser, submitFeedbackTest);

// Handler functions
// Get all settings for a user
async function submitFeedback(req: Request, res: Response) {
  const user = (req as RequestWithUser).user;
  try {
    const feedback = await FeedbackService.submitFeedback(user.email, req.body.feedback);
    res.json({
      success: true,
      data: { feedback },
      timestamp: new Date()
    });
  } catch (error) {
    logger.error(error, `Error submitting feedback for user ${user.email}`,);
    res.status(500).json({
      success: false,
      message: "Failed to submit feedback",
      timestamp: new Date()
    });
  }
}

async function submitFeedbackTest(req: Request, res: Response) {
  const email = "test@mentra.glass";
  try {
    const feedback = await FeedbackService.submitFeedback(email, req.body.feedback);
    res.json({
      success: true,
      data: { feedback },
      timestamp: new Date()
    });
  } catch (error) {
    logger.error(error, `Error submitting feedback for user ${email}`,);
    res.status(500).json({
      success: false,
      message: "Failed to submit feedback",
      timestamp: new Date()
    });
  }
}

export default router;