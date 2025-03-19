// cloud/server/src/models/app.model.ts
import mongoose, { Schema, Document, Types } from 'mongoose';
import { AppI as _AppI, TpaType } from '@augmentos/sdk';

export type AppStoreStatus = 'DEVELOPMENT' | 'SUBMITTED' | 'REJECTED' | 'PUBLISHED';

// Extend the AppI interface for our MongoDB document
export interface AppI extends _AppI, Document {
  createdAt: Date;
  updatedAt: Date;
  isPublic: boolean;
  hashedApiKey: string;
  hashedEndpointSecret?: string;
  appStoreStatus: AppStoreStatus;
  reviewNotes?: string;
  reviewedBy?: string;
  reviewedAt?: Date;
}

// Using existing schema with flexible access
const AppSchema = new Schema({
  appStoreStatus: {
    type: String,
    enum: ['DEVELOPMENT', 'SUBMITTED', 'REJECTED', 'PUBLISHED'],
    default: 'DEVELOPMENT'
  },
  reviewNotes: {
    type: String,
    default: ''
  },
  reviewedBy: {
    type: String
  },
  reviewedAt: {
    type: Date
  }
}, { 
  strict: false,
  timestamps: true 
});

export default mongoose.model<AppI>('App', AppSchema, 'apps');