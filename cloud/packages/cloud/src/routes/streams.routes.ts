import express, { Request, Response } from "express";
import { logger } from "../services/logging/pino-logger";
import UserSession from "../services/session/UserSession";
import { validateAppApiKey } from "../middleware/validateApiKey";
import { RestreamDestination } from "@mentra/sdk";
import { AppI } from "../models/app.model";

// Type for requests authenticated with validateAppApiKey middleware
type AppAuthenticatedRequest = Request & {
  app: AppI;
};

const router = express.Router();

// Limits for outputs
const MAX_OUTPUTS_PER_STREAM = 10;
const MAX_OUTPUTS_PER_APP = 10;

/**
 * Add a restream output to an active managed stream
 */
router.post(
  "/:streamId/outputs",
  validateAppApiKey,
  async (req: any, res: Response) => {
    const { streamId } = req.params;
    const { url, name } = req.body as RestreamDestination;
    const app = req.app;
    const packageName = app.packageName;

    logger.info(
      {
        streamId,
        packageName,
        url,
        name,
      },
      "Adding restream output to managed stream",
    );

    try {
      // Validate input
      if (!url || typeof url !== "string") {
        return res.status(400).json({
          error: "INVALID_URL",
          message: "URL is required and must be a string",
        });
      }

      // Validate RTMP URL format
      if (!url.startsWith("rtmp://") && !url.startsWith("rtmps://")) {
        return res.status(400).json({
          error: "INVALID_URL_FORMAT",
          message: "URL must start with rtmp:// or rtmps://",
        });
      }

      // Find user session by app
  const userSessions = UserSession.getAllSessions();
      let targetUserSession = null;
      let targetStream = null;

      for (const session of userSessions) {
        if (session.appManager.isAppRunning(packageName)) {
          const stream =
            session.managedStreamingExtension.getStreamByStreamId(streamId);
          if (stream && stream.type === "managed") {
            targetUserSession = session;
            targetStream = stream;
            break;
          }
        }
      }

      if (!targetUserSession || !targetStream) {
        return res.status(404).json({
          error: "STREAM_NOT_FOUND",
          message: "Managed stream not found or app is not a viewer",
        });
      }

      // Check if app is a viewer of this stream
      if (!targetStream.activeViewers.has(packageName)) {
        return res.status(403).json({
          error: "NOT_A_VIEWER",
          message: "App must be viewing the stream to add outputs",
        });
      }

      // Add the output
      const result =
        await targetUserSession.managedStreamingExtension.addRestreamOutput(
          streamId,
          packageName,
          { url, name },
        );

      if (result.success) {
        res.json({
          success: true,
          outputId: result.outputId,
          message: "Output added successfully",
        });
      } else {
        // Map internal errors to HTTP status codes
        const statusCode =
          result.error === "MAX_OUTPUTS_REACHED" ||
          result.error === "MAX_APP_OUTPUTS_REACHED"
            ? 409
            : result.error === "DUPLICATE_URL"
              ? 409
              : result.error === "CLOUDFLARE_ERROR"
                ? 502
                : 400;

        res.status(statusCode).json({
          error: result.error,
          message: result.message,
        });
      }
    } catch (error) {
      logger.error(
        {
          error,
          streamId,
          packageName,
        },
        "Error adding restream output",
      );

      res.status(500).json({
        error: "INTERNAL_ERROR",
        message: "Failed to add restream output",
      });
    }
  },
);

/**
 * Remove a restream output from an active managed stream
 */
router.delete(
  "/:streamId/outputs/:outputId",
  validateAppApiKey,
  async (req: any, res: Response) => {
    const { streamId, outputId } = req.params;
    const app = req.app;
    const packageName = app.packageName;

    logger.info(
      {
        streamId,
        outputId,
        packageName,
      },
      "Removing restream output from managed stream",
    );

    try {
      // Find user session by app
  const userSessions = UserSession.getAllSessions();
      let targetUserSession = null;
      let targetStream = null;

      for (const session of userSessions) {
        if (session.appManager.isAppRunning(packageName)) {
          const stream =
            session.managedStreamingExtension.getStreamByStreamId(streamId);
          if (stream && stream.type === "managed") {
            targetUserSession = session;
            targetStream = stream;
            break;
          }
        }
      }

      if (!targetUserSession || !targetStream) {
        return res.status(404).json({
          error: "STREAM_NOT_FOUND",
          message: "Managed stream not found",
        });
      }

      // Remove the output
      const result =
        await targetUserSession.managedStreamingExtension.removeRestreamOutput(
          streamId,
          outputId,
          packageName,
        );

      if (result.success) {
        res.json({
          success: true,
          message: "Output removed successfully",
        });
      } else {
        const statusCode =
          result.error === "OUTPUT_NOT_FOUND"
            ? 404
            : result.error === "NOT_AUTHORIZED"
              ? 403
              : result.error === "CLOUDFLARE_ERROR"
                ? 502
                : 400;

        res.status(statusCode).json({
          error: result.error,
          message: result.message,
        });
      }
    } catch (error) {
      logger.error(
        {
          error,
          streamId,
          outputId,
          packageName,
        },
        "Error removing restream output",
      );

      res.status(500).json({
        error: "INTERNAL_ERROR",
        message: "Failed to remove restream output",
      });
    }
  },
);

/**
 * List all restream outputs for a managed stream
 */
router.get(
  "/:streamId/outputs",
  validateAppApiKey,
  async (req: any, res: Response) => {
    const { streamId } = req.params;
    const app = req.app;
    const packageName = app.packageName;

    try {
      // Find user session by app
  const userSessions = UserSession.getAllSessions();
      let targetStream = null;

      for (const session of userSessions) {
        if (session.appManager.isAppRunning(packageName)) {
          const stream =
            session.managedStreamingExtension.getStreamByStreamId(streamId);
          if (stream && stream.type === "managed") {
            targetStream = stream;
            break;
          }
        }
      }

      if (!targetStream) {
        return res.status(404).json({
          error: "STREAM_NOT_FOUND",
          message: "Managed stream not found",
        });
      }

      // Check if app is a viewer of this stream
      if (!targetStream.activeViewers.has(packageName)) {
        return res.status(403).json({
          error: "NOT_A_VIEWER",
          message: "App must be viewing the stream to list outputs",
        });
      }

      // Format outputs for response
      const outputs =
        targetStream.outputs?.map((output: any) => ({
          outputId: output.cfOutputId,
          url: output.url,
          name: output.name,
          addedBy: output.addedBy,
          status: output.status?.status?.current?.state || "unknown",
          error: output.status?.status?.current?.lastError,
        })) || [];

      res.json({
        streamId,
        outputs,
        total: outputs.length,
        maxPerStream: MAX_OUTPUTS_PER_STREAM,
        maxPerApp: MAX_OUTPUTS_PER_APP,
      });
    } catch (error) {
      logger.error(
        {
          error,
          streamId,
          packageName,
        },
        "Error listing restream outputs",
      );

      res.status(500).json({
        error: "INTERNAL_ERROR",
        message: "Failed to list restream outputs",
      });
    }
  },
);

export default router;
export { MAX_OUTPUTS_PER_STREAM, MAX_OUTPUTS_PER_APP };
