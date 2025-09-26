/* eslint-disable @typescript-eslint/no-explicit-any */
// cloud/src/models/user-settings.model.ts
import mongoose, { Schema, Document } from "mongoose";
import { logger } from "../services/logging/pino-logger";

export interface UserSettingsI extends Document {
  email: string;
  settings: Record<string, any>;
  lastUpdated: Date;
  version: string;

  // Methods
  updateSettings(newSettings: Record<string, any>): Promise<void>;
  getSettings(): Record<string, any>;
  getSetting(key: string): any;
  setSetting(key: string, value: any): Promise<void>;
  deleteSetting(key: string): Promise<void>;
}

const UserSettingsSchema = new Schema<UserSettingsI>(
  {
    email: {
      type: String,
      ref: "User",
      required: true,
      unique: true, // enforces 1:1 relationship with User
      index: true,
      lowercase: true,
      trim: true,
    },

    settings: {
      type: Map,
      of: Schema.Types.Mixed,
      default: new Map(),
    },

    lastUpdated: {
      type: Date,
      default: Date.now,
    },

    version: {
      type: String,
      default: "1.0.0",
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        delete ret.__v;
        ret.id = ret._id;
        delete ret._id;

        // Convert Map to plain object for JSON
        if (ret.settings instanceof Map) {
          ret.settings = Object.fromEntries(ret.settings);
        }
        return ret;
      },
    },
  },
);

// Index for efficient queries
UserSettingsSchema.index({ email: 1, lastUpdated: -1 });

// Instance Methods
UserSettingsSchema.methods.updateSettings = async function (
  this: UserSettingsI,
  newSettings: Record<string, any>,
): Promise<void> {
  // Merge new settings with existing
  for (const [key, value] of Object.entries(newSettings)) {
    if (value === null || value === undefined) {
      this.settings.delete(key);
    } else {
      this.settings.set(key, value);
    }
  }

  this.lastUpdated = new Date();
  await this.save();

  logger.info(`Settings updated for user ${this.email}`, {
    email: this.email,
    updatedKeys: Object.keys(newSettings),
  });
};

UserSettingsSchema.methods.getSettings = function (
  this: UserSettingsI,
): Record<string, any> {
  return Object.fromEntries(this.settings.entries());
};

UserSettingsSchema.methods.getSetting = function (
  this: UserSettingsI,
  key: string,
): any {
  return this.settings.get(key);
};

UserSettingsSchema.methods.setSetting = async function (
  this: UserSettingsI,
  key: string,
  value: any,
): Promise<void> {
  if (value === null || value === undefined) {
    this.settings.delete(key);
  } else {
    this.settings.set(key, value);
  }

  this.lastUpdated = new Date();
  await this.save();
};

UserSettingsSchema.methods.deleteSetting = async function (
  this: UserSettingsI,
  key: string,
): Promise<void> {
  this.settings.delete(key);
  this.lastUpdated = new Date();
  await this.save();
};

export const UserSettings =
  mongoose.models.UserSettings ||
  mongoose.model<UserSettingsI>("UserSettings", UserSettingsSchema);
