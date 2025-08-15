import mongoose, { Schema, Document } from "mongoose";

// Defines a Mongoose model for storing app uptime records including health status, online status, and response time.

export interface AppUptimeI extends Document {
  packageName: string; // e.g. "com.coledermott.pricepal"
  timestamp: Date; // When this uptime record was created
  health: "healthy" | "degraded" | "offline"; // health status of app
  onlineStatus: boolean; // true if online, false if offline
  responseTimeMs: number | null; // response time in milliseconds, or null if offline/unavailable
}

const AppUptimeSchema: Schema = new Schema<AppUptimeI>({
  packageName: { type: String, required: true, index: true },
  timestamp: { type: Date, required: true, index: true, default: Date.now },
  health: {
    type: String,
    enum: ["healthy", "degraded", "offline"],
    required: true,
    default: "healthy",
  },
  onlineStatus: { type: Boolean, required: true, default: true },
  responseTimeMs: { type: Number, default: null },
});

export const AppUptime =
  mongoose.models.AppUptime ||
  mongoose.model<AppUptimeI>("AppUptime", AppUptimeSchema);
