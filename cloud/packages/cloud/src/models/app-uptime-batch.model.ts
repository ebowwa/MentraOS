// import mongoose, { Schema, Document } from 'mongoose';

// interface TimestampEntry {
//   timestamp: Date;
//   health: string;
//   onlineStatus: boolean;
//   responseTimeMs: number;
// }

// interface AppEntry {
//   packageName: string;
//   timestamps: TimestampEntry[];
// }

// export interface AppUptimeBatch extends Document {
//   startTS: Date;
//   endTS: Date;
//   apps: AppEntry[];
//   createdAt: Date;
// }

// const TimestampEntrySchema = new Schema({
//   timestamp: { type: Date, required: true },
//   health: { type: String, required: true },
//   onlineStatus: { type: Boolean, required: true },
//   responseTimeMs: { type: Number, required: true }
// }, { _id: false });

// const AppEntrySchema = new Schema({
//   packageName: { type: String, required: true },
//   timestamps: [TimestampEntrySchema]
// }, { _id: false });

// const AppUptimeBatchSchema = new Schema({
//   startTS: { type: Date, required: true },
//   endTS: { type: Date, required: true },
//   apps: [AppEntrySchema],
//   createdAt: { type: Date, default: Date.now }
// });

// AppUptimeBatchSchema.index({ startTS: 1, endTS: 1 });
// AppUptimeBatchSchema.index({ 'apps.packageName': 1 });

// export const AppUptimeBatch = mongoose.model<AppUptimeBatch>('AppUptimeBatch', AppUptimeBatchSchema);