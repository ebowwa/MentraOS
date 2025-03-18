// @augmentos/sdk
// packages/sdk/types/src/models.ts - Core models

import { AppSettingType, AppState, Language, TpaType } from './enums';

/**
 * Developer profile information
 */
export interface DeveloperProfile {
  company?: string;
  website?: string;
  contactEmail?: string;
  description?: string;
  logo?: string;
}

/**
 * Base interface for applications
 */
export interface AppI {
  packageName: string;
  name: string;
  webhookURL: string;
  webviewURL?: string;            // URL for phone UI
  logoURL: string;
  tpaType: TpaType;               // Type of app
  appStoreId?: string;            // Which app store registered this app
  developerId?: string;
  
  // Auth
  hashedEndpointSecret?: string;
  hashedApiKey?: string;
  
  // App details
  description?: string;
  version?: string;
  settings?: AppSettings;

  isPublic?: boolean;
  appStoreStatus?: 'DEVELOPMENT' | 'SUBMITTED' | 'REJECTED' | 'PUBLISHED';
}

/**
 * Setting types for applications
 */
export type AppSetting = 
  | { type: AppSettingType.TOGGLE; key: string; label: string; defaultValue: boolean }
  | { type: AppSettingType.TEXT; key: string; label: string; defaultValue?: string }
  | { type: AppSettingType.SELECT; key: string; label: string; options: { label: string; value: string }[]; defaultValue?: string };

export type AppSettings = AppSetting[];

/**
 * Transcript segment for speech processing
 */
export interface TranscriptSegment {
  speakerId?: string;
  resultId: string;
  text: string;
  timestamp: Date;
  isFinal: boolean;
}

/**
 * Complete transcript
 */
export interface TranscriptI {
  segments: TranscriptSegment[];
}