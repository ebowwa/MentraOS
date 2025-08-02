import mongoose, { Schema, Document } from 'mongoose';

export interface AppUptimeI extends Document {
  timestamp: Date;
  packageName: string;
}

const AppUptimeSchema: Schema = new Schema<AppUptimeI>({
  packageName: { type: String, required: true, index: true },
  timestamp: { type: Date, default: Date.now, index: true },
});

export const AppUptime = mongoose.models.AppUptime || mongoose.model<AppUptimeI>('AppUptime', AppUptimeSchema);
