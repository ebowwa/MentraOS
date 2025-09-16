// cloud/src/api/client/user-settings.routes.ts
// API endpoints for managing user settings
// /api/client/user/settings
// Uses UserSettingsService for business logic

import { Router, Request, Response } from "express";
import { logger } from "../../services/logging/pino-logger";
import * as UserSettingsService from "../../services/client/user-settings.service";
import { authWithUser, RequestWithUser } from "../../middleware/client/client-auth-middleware";

const router = Router();

// API Endpoints // /api/client/user/settings/*
router.get("/", authWithUser, getUserSettings);               // GET      /api/client/user/settings
router.put("/", authWithUser, updateUserSettings);            // PUT      /api/client/user/settings
router.post("/", authWithUser, updateUserSettings);           // POST     /api/client/user/settings
router.get("/key/:key", authWithUser, getUserSetting);        // GET      /api/client/user/settings/key/:key
router.put("/key/:key", authWithUser, setUserSetting);        // PUT      /api/client/user/settings/key/:key
router.delete("/key/:key", authWithUser, deleteUserSetting);  // DELETE   /api/client/user/settings/key/:key

// Handler functions

// Get all settings for a user
async function getUserSettings(req: Request, res: Response) {
  const user = (req as RequestWithUser).user;

  try {
    const settings = await UserSettingsService.getUserSettings(user._id);

    res.json({
      success: true,
      data: { settings },
      timestamp: new Date()
    });
  } catch (error) {
    logger.error(`Error fetching settings for user ${user.email}:`, error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user settings",
      timestamp: new Date()
    });
  }
}

// Update settings for a user
async function updateUserSettings(req: Request, res: Response) {
  const user = (req as RequestWithUser).user;
  const { settings } = req.body;
  
  if (!settings || typeof settings !== "object") {
    return res.status(400).json({
      success: false,
      message: "Settings object required"
    });
  }

  try {
    const updatedSettings = await UserSettingsService.updateUserSettings(user._id, settings);

    res.json({
      success: true,
      data: { settings: updatedSettings },
      timestamp: new Date()
    });
  } catch (error) {
    logger.error(`Error updating settings for user ${user.email}:`, error);

    if (error instanceof Error && error.message === "User not found") {
      return res.status(404).json({
        success: false,
        message: "User not found",
        timestamp: new Date()
      });
    }
    
    res.status(500).json({
      success: false,
      message: "Failed to update user settings",
      timestamp: new Date()
    });
  }
}

// Get a specific setting by key
async function getUserSetting(req: Request, res: Response) {
  const user = (req as RequestWithUser).user;
  const { key } = req.params;
  
  if (!key) {
    return res.status(400).json({
      success: false,
      message: "Setting key required"
    });
  }

  try {
    const value = await UserSettingsService.getUserSetting(user._id, key);
    res.json({
      success: true,
      data: {
        key,
        value: value ?? null,
        exists: value !== undefined
      },
      timestamp: new Date()
    });
  } catch (error) {
    logger.error(error, `Error fetching setting ${key} for user ${user.email}`);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user setting",
      timestamp: new Date()
    });
  }
}

// Set a specific setting
async function setUserSetting(req: Request, res: Response) {
  const user = (req as RequestWithUser).user;
  const { key } = req.params;
  const { value } = req.body;
  
  if (!key) {
    return res.status(400).json({
      success: false,
      message: "Setting key required"
    });
  }

  try {
    await UserSettingsService.setUserSetting(user._id, key, value);

    res.json({
      success: true,
      data: { key, value },
      timestamp: new Date()
    });
  } catch (error) {
    logger.error(`Error setting ${key} for user ${user.email}:`, error);
    res.status(500).json({
      success: false,
      message: "Failed to set user setting",
      timestamp: new Date()
    });
  }
}

// Delete a specific setting
async function deleteUserSetting(req: Request, res: Response) {
  const user = (req as RequestWithUser).user;
  const { key } = req.params;

  try {
    await UserSettingsService.deleteUserSetting(user._id, key);

    res.json({
      success: true,
      data: { key, deleted: true },
      timestamp: new Date()
    });
  } catch (error) {
    logger.error(`Error deleting setting ${key} for user ${user.email}:`, error);
    res.status(500).json({
      success: false,
      message: "Failed to delete user setting",
      timestamp: new Date()
    });
  }
}

export default router;