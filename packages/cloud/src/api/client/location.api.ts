// cloud/src/api/client/location.api.ts
// API endpoints for location updates from mobile clients

import { Router, Request, Response } from "express";
import {
  clientAuthWithUserSession,
  RequestWithUserSession,
} from "../middleware/client.middleware";

const router = Router();

// API Endpoints // /api/client/location/*
router.post("/", clientAuthWithUserSession, updateLocation);
router.post(
  "/poll-response/:correlationId",
  clientAuthWithUserSession,
  updateLocationPollResponse,
);

// Handler functions
// POST     /api/client/location
// BODY     { location: { lat, lng, accuracy?, timestamp? } } or Expo LocationObjectCoords
async function updateLocation(req: Request, res: Response) {
  const _req = req as RequestWithUserSession;
  const userSession = _req.userSession;
  const { location } = req.body;

  if (!location || typeof location !== "object") {
    return res.status(400).json({
      success: false,
      message: "location object required",
    });
  }

  try {
    await userSession.locationManager.updateFromAPI({ location });
    return res.json({
      success: true,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    _req.logger.error(
      error,
      `Error updating location for user ${userSession.userId}:`,
    );

    return res.status(500).json({
      success: false,
      message: "Failed to update location",
      timestamp: new Date().toISOString(),
    });
  }
}

// POST     /api/client/location/poll-response/:correlationId
// BODY     { location: { lat, lng, accuracy?, timestamp? } } or Expo LocationObjectCoords
async function updateLocationPollResponse(req: Request, res: Response) {
  const _req = req as RequestWithUserSession;
  const userSession = _req.userSession;
  const { location } = req.body;
  const { correlationId } = req.params;

  if (!location || typeof location !== "object") {
    return res.status(400).json({
      success: false,
      message: "location object required",
    });
  }

  if (!correlationId) {
    return res.status(400).json({
      success: false,
      message: "correlationId parameter required",
    });
  }

  try {
    // Add correlationId to location payload
    const locationWithCorrelation = {
      ...location,
      correlationId,
    };

    await userSession.locationManager.updateFromAPI({
      location: locationWithCorrelation,
    });

    return res.json({
      success: true,
      resolved: true, // Indicates this was a poll response
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    _req.logger.error(
      error,
      `Error updating location poll response for user ${userSession.userId}:`,
    );

    return res.status(500).json({
      success: false,
      message: "Failed to update location poll response",
      timestamp: new Date().toISOString(),
    });
  }
}

export default router;
