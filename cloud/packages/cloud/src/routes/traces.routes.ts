/**
 * Traces API Routes
 *
 * Endpoints for retrieving photo capture timing data
 */

import express, { Request, Response } from "express";
import { getTrace, getAllTraces, clearAllTraces } from "../tracing/trace-store";
import { logger as rootLogger } from "../services/logging/pino-logger";

const router = express.Router();
const logger = rootLogger.child({ service: "traces-routes" });

/**
 * @route GET /api/traces/:requestId
 * @desc Get timing data for a specific photo request
 * @access Public (for debugging)
 */
router.get("/:requestId", (req: Request, res: Response) => {
  const { requestId } = req.params;

  logger.info({ requestId }, "📊 Fetching trace data");

  const traceData = getTrace(requestId);

  if (!traceData) {
    return res.status(404).json({
      error: "Trace not found",
      requestId,
    });
  }

  return res.json(traceData);
});

/**
 * @route GET /api/traces
 * @desc Get all active traces
 * @access Public (for debugging)
 */
router.get("/", (req: Request, res: Response) => {
  logger.info("📊 Fetching all traces");

  const traces = getAllTraces();

  return res.json({
    count: traces.length,
    traces,
  });
});

/**
 * @route DELETE /api/traces
 * @desc Clear all traces (for testing)
 * @access Public (for debugging)
 */
router.delete("/", (req: Request, res: Response) => {
  logger.info("🧹 Clearing all traces");

  clearAllTraces();

  return res.json({
    success: true,
    message: "All traces cleared",
  });
});

export default router;
