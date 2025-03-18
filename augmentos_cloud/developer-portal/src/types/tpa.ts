import { TpaType } from '@augmentos/sdk';

export interface TPA {
  id: string;
  packageName: string;
  name: string;
  description: string;
  webhookURL: string;
  logoURL: string;
  webviewURL?: string;
  isPublic: boolean;
  appStoreStatus?: 'DEVELOPMENT' | 'SUBMITTED' | 'REJECTED' | 'PUBLISHED';
  tpaType: TpaType;
  createdAt?: string; // For compatibility with AppResponse
  updatedAt?: string; // For compatibility with AppResponse
}