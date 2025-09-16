// services/core/user-settings.service.ts
// Business logic for managing user settings

import { Types } from "mongoose";
import { UserSettings } from "../../models/user-settings.model";
import { User } from "../../models/user.model";
import { logger } from "../logging/pino-logger";

/**
 * Find settings document by userId
 */
export async function findByUserId(userId: Types.ObjectId) {
  return UserSettings.findOne({ userId });
}

/**
 * Find or create settings document for a user
 */
export async function findOrCreateForUser(userId: Types.ObjectId) {
  let userSettings = await UserSettings.findOne({ userId });
  
  if (!userSettings) {
    userSettings = await UserSettings.create({
      userId,
      settings: new Map(),
      lastUpdated: new Date(),
    });
    
    logger.info(`Created settings document for user ${userId}`);
  }
  
  return userSettings;
}

/**
 * Get all settings for a user
 */
export async function getUserSettings(userId: string | Types.ObjectId): Promise<Record<string, any>> {
  const objectId = typeof userId === "string" ? new Types.ObjectId(userId) : userId;
  
  const userSettings = await findByUserId(objectId);
  return userSettings?.getSettings() || {};
}

/**
 * Update settings for a user
 */
export async function updateUserSettings(
  userId: string | Types.ObjectId,
  settings: Record<string, any>
): Promise<Record<string, any>> {
  const objectId = typeof userId === "string" ? new Types.ObjectId(userId) : userId;
  
  // Verify user exists
  const user = await User.findById(objectId);
  if (!user) {
    throw new Error("User not found");
  }

  const userSettings = await findOrCreateForUser(objectId);
  await userSettings.updateSettings(settings);
  
  logger.info(`User settings updated`, {
    userId: objectId.toString(),
    updatedKeys: Object.keys(settings),
  });
  
  return userSettings.getSettings();
}

/**
 * Get a specific setting by key
 */
export async function getUserSetting(
  userId: string | Types.ObjectId,
  key: string
): Promise<any> {
  const objectId = typeof userId === "string" ? new Types.ObjectId(userId) : userId;
  
  const userSettings = await findByUserId(objectId);
  return userSettings?.getSetting(key);
}

/**
 * Set a specific setting
 */
export async function setUserSetting(
  userId: string | Types.ObjectId,
  key: string,
  value: any
): Promise<void> {
  const objectId = typeof userId === "string" ? new Types.ObjectId(userId) : userId;
  
  const userSettings = await findOrCreateForUser(objectId);
  await userSettings.setSetting(key, value);
  
  logger.info(`User setting updated`, {
    userId: objectId.toString(),
    key,
  });
}

/**
 * Delete a specific setting
 */
export async function deleteUserSetting(
  userId: string | Types.ObjectId,
  key: string
): Promise<void> {
  const objectId = typeof userId === "string" ? new Types.ObjectId(userId) : userId;
  
  const userSettings = await findByUserId(objectId);
  if (userSettings) {
    await userSettings.deleteSetting(key);
    
    logger.info(`User setting deleted`, {
      userId: objectId.toString(),
      key,
    });
  }
}

/**
 * Delete all settings for a user (for cleanup)
 */
export async function deleteAllUserSettings(userId: string | Types.ObjectId): Promise<boolean> {
  const objectId = typeof userId === "string" ? new Types.ObjectId(userId) : userId;
  
  const result = await UserSettings.findOneAndDelete({ userId: objectId });
  
  if (result) {
    logger.info(`All settings deleted for user ${objectId}`);
  }
  
  return !!result;
}

/**
 * Get user with settings in single optimized query
 * Use this when you always need both user + settings
 */
export async function getUserWithSettings(userId: string | Types.ObjectId): Promise<(typeof User & { settings: Record<string, any>, settingsLastUpdated?: Date }) | null> {
  const objectId = typeof userId === "string" ? new Types.ObjectId(userId) : userId;
  
  const result = await User.aggregate([
    { $match: { _id: objectId } },
    {
      $lookup: {
        from: "usersettings",
        localField: "_id", 
        foreignField: "userId",
        as: "userSettings"
      }
    },
    {
      $addFields: {
        settings: {
          $ifNull: [
            { $arrayElemAt: ["$userSettings.settings", 0] },
            {}
          ]
        },
        settingsLastUpdated: {
          $arrayElemAt: ["$userSettings.lastUpdated", 0] 
        }
      }
    },
    {
      $unset: "userSettings" // Remove the lookup array from response
    }
  ]);

  return result[0] || null;
}

/**
 * Batch get multiple users with their settings
 */
export async function getBatchUsersWithSettings(userIds: (string | Types.ObjectId)[]) {
  const objectIds = userIds.map(id => 
    typeof id === "string" ? new Types.ObjectId(id) : id
  );
  
  return User.aggregate([
    { $match: { _id: { $in: objectIds } } },
    {
      $lookup: {
        from: "usersettings",
        localField: "_id",
        foreignField: "userId", 
        as: "userSettings"
      }
    },
    {
      $addFields: {
        settings: {
          $ifNull: [
            { $arrayElemAt: ["$userSettings.settings", 0] },
            {}
          ]
        }
      }
    },
    { $unset: "userSettings" }
  ]);
}