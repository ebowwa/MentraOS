import axios, { AxiosInstance, AxiosError } from 'axios';
import { Logger } from 'pino';

/**
 * Cloudflare Live Input response structure
 */
interface CloudflareLiveInput {
  uid: string;
  rtmps: {
    url: string;
    streamKey: string;
  };
  rtmpsPlayback?: {
    url: string;
    streamKey: string;
  };
  srt?: {
    url: string;
    streamId: string;
    passphrase: string;
  };
  srtPlayback?: {
    url: string;
    streamId: string;
    passphrase: string;
  };
  webRTC?: {
    url: string;
  };
  webRTCPlayback?: {
    url: string;
  };
  created: string;
  modified: string;
  meta: Record<string, any>;
  status: {
    current: {
      state: 'connected' | 'disconnected' | null;
      connectedAt?: string;
      disconnectedAt?: string;
    };
  };
  recording: {
    mode: 'automatic' | 'off';
    requireSignedURLs: boolean;
    allowedOrigins?: string[];
  };
  playback: {
    hls: string;
    dash: string;
  };
}

/**
 * Configuration options for creating a live input
 */
export interface CreateLiveInputConfig {
  quality?: '720p' | '1080p';
  enableWebRTC?: boolean;
  enableRecording?: boolean;
  requireSignedURLs?: boolean;
}

/**
 * Result of creating a live input
 */
export interface LiveInputResult {
  liveInputId: string;
  rtmpUrl: string;
  hlsUrl: string;
  dashUrl: string;
  webrtcUrl?: string;
}

/**
 * Live input status information
 */
export interface LiveInputStatus {
  isConnected: boolean;
  connectedAt?: Date;
  disconnectedAt?: Date;
  viewerCount?: number;
}

/**
 * Live input info for listing/monitoring
 */
export interface LiveInputInfo {
  id: string;
  userId: string;
  createdAt: Date;
  isConnected: boolean;
  quality?: string;
}

/**
 * Service for interacting with Cloudflare Stream Live API
 * Handles creation, deletion, and monitoring of live RTMP inputs
 */
export class CloudflareStreamService {
  private api!: AxiosInstance;
  private logger: Logger;
  private accountId!: string;
  private enabled: boolean = true;

  constructor(logger: Logger) {
    this.logger = logger.child({ service: 'CloudflareStreamService' });
    
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    
    if (!accountId || !apiToken) {
      this.logger.error('Cloudflare credentials not configured - managed streaming disabled');
      this.enabled = false;
      return;
    }
    
    this.accountId = accountId;
    
    this.api = axios.create({
      baseURL: `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream`,
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000 // 10 second timeout
    });
    
    // Add response interceptor for logging
    this.api.interceptors.response.use(
      response => {
        this.logger.debug({
          method: response.config.method,
          url: response.config.url,
          status: response.status
        }, 'Cloudflare API request successful');
        return response;
      },
      error => {
        this.logger.error({
          method: error.config?.method,
          url: error.config?.url,
          status: error.response?.status,
          error: error.response?.data
        }, 'Cloudflare API request failed');
        return Promise.reject(error);
      }
    );
  }

  /**
   * Create a new live input for streaming
   * Cloudflare is input-agnostic, so it will accept any bitrate/resolution from Mentra Live glasses
   */
  async createLiveInput(userId: string, config: CreateLiveInputConfig = {}): Promise<LiveInputResult> {
    if (!this.enabled) {
      throw new Error('Managed streaming is not configured');
    }
    
    try {
      const response = await this.withRetry(async () => {
        return await this.api.post('/live_inputs', {
          meta: {
            userId,
            createdAt: new Date().toISOString(),
            mentraOS: true,
            quality: config.quality || '720p'
          },
          recording: {
            mode: config.enableRecording ? 'automatic' : 'off',
            requireSignedURLs: config.requireSignedURLs || false
          }
          // No input constraints - Cloudflare is input-agnostic
          // Perfect for Mentra Live's dynamic bitrate/resolution
        });
      });
      
      const liveInput: CloudflareLiveInput = response.data.result;
      
      const result: LiveInputResult = {
        liveInputId: liveInput.uid,
        rtmpUrl: `${liveInput.rtmps.url}/${liveInput.rtmps.streamKey}`,
        hlsUrl: liveInput.playback.hls,
        dashUrl: liveInput.playback.dash,
        webrtcUrl: liveInput.webRTC?.url
      };
      
      this.logger.info({ 
        userId, 
        liveInputId: result.liveInputId,
        quality: config.quality 
      }, 'Created Cloudflare live input');
      
      return result;
    } catch (error) {
      this.logger.error({ error, userId }, 'Failed to create Cloudflare live input');
      throw this.wrapError(error, 'Failed to create live stream');
    }
  }

  /**
   * Delete a live input
   * Best effort - logs errors but doesn't throw
   */
  async deleteLiveInput(liveInputId: string): Promise<void> {
    try {
      await this.api.delete(`/live_inputs/${liveInputId}`);
      this.logger.info({ liveInputId }, 'Deleted Cloudflare live input');
    } catch (error) {
      // Log but don't throw - cleanup should be best effort
      this.logger.error({ error, liveInputId }, 'Failed to delete live input');
    }
  }

  /**
   * Get the current status of a live input
   */
  async getLiveInputStatus(liveInputId: string): Promise<LiveInputStatus> {
    if (!this.enabled) {
      return { isConnected: false };
    }
    
    try {
      const response = await this.api.get(`/live_inputs/${liveInputId}`);
      const liveInput: CloudflareLiveInput = response.data.result;
      
      return {
        isConnected: liveInput.status.current.state === 'connected',
        connectedAt: liveInput.status.current.connectedAt 
          ? new Date(liveInput.status.current.connectedAt)
          : undefined,
        disconnectedAt: liveInput.status.current.disconnectedAt
          ? new Date(liveInput.status.current.disconnectedAt)
          : undefined
      };
    } catch (error) {
      this.logger.error({ error, liveInputId }, 'Failed to get live input status');
      return { isConnected: false };
    }
  }

  /**
   * Update live input settings
   */
  async updateLiveInput(liveInputId: string, config: Partial<CreateLiveInputConfig>): Promise<void> {
    try {
      await this.api.put(`/live_inputs/${liveInputId}`, {
        recording: {
          mode: config.enableRecording ? 'automatic' : 'off',
          requireSignedURLs: config.requireSignedURLs || false
        }
      });
      
      this.logger.info({ liveInputId, config }, 'Updated live input configuration');
    } catch (error) {
      this.logger.error({ error, liveInputId }, 'Failed to update live input');
      throw this.wrapError(error, 'Failed to update stream configuration');
    }
  }

  /**
   * List all live inputs for monitoring/cleanup
   */
  async listLiveInputs(): Promise<LiveInputInfo[]> {
    try {
      const response = await this.api.get('/live_inputs', {
        params: {
          per_page: 100 // Max allowed by CF
        }
      });
      
      const liveInputs: CloudflareLiveInput[] = response.data.result;
      
      return liveInputs
        .filter(input => input.meta?.mentraOS === true)
        .map(input => ({
          id: input.uid,
          userId: input.meta.userId || 'unknown',
          createdAt: new Date(input.created),
          isConnected: input.status.current.state === 'connected',
          quality: input.meta.quality
        }));
    } catch (error) {
      this.logger.error({ error }, 'Failed to list live inputs');
      return [];
    }
  }

  /**
   * Clean up orphaned streams that are no longer active
   */
  async cleanupOrphanedStreams(activeStreamIds: Set<string>): Promise<number> {
    let cleanedCount = 0;
    
    try {
      const allStreams = await this.listLiveInputs();
      
      for (const stream of allStreams) {
        if (!activeStreamIds.has(stream.id) && !stream.isConnected) {
          // Stream is not in our active set and not connected
          const ageHours = (Date.now() - stream.createdAt.getTime()) / (1000 * 60 * 60);
          
          if (ageHours > 1) { // Older than 1 hour
            await this.deleteLiveInput(stream.id);
            cleanedCount++;
          }
        }
      }
      
      if (cleanedCount > 0) {
        this.logger.info({ cleanedCount }, 'Cleaned up orphaned Cloudflare streams');
      }
    } catch (error) {
      this.logger.error({ error }, 'Error during stream cleanup');
    }
    
    return cleanedCount;
  }

  /**
   * Retry logic for transient failures
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    retries = 3,
    delay = 1000
  ): Promise<T> {
    for (let i = 0; i < retries; i++) {
      try {
        return await operation();
      } catch (error: any) {
        if (i === retries - 1) throw error;
        
        // Check if retryable
        if (error.response?.status === 429) { // Rate limited
          const retryAfter = parseInt(error.response.headers['retry-after'] || '1');
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        } else if (
          error.code === 'ECONNABORTED' || 
          error.code === 'ETIMEDOUT' ||
          error.response?.status >= 500
        ) {
          // Network or server errors - exponential backoff
          await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
        } else {
          throw error; // Not retryable
        }
        
        this.logger.warn({ 
          attempt: i + 1, 
          retries, 
          error: error.message 
        }, 'Retrying Cloudflare API request');
      }
    }
    throw new Error('Max retries exceeded');
  }

  /**
   * Wrap errors in a more user-friendly format
   */
  private wrapError(error: any, message: string): Error {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      if (axiosError.response?.data) {
        const cfError = axiosError.response.data as any;
        return new Error(`${message}: ${cfError.errors?.[0]?.message || cfError.message || 'Unknown error'}`);
      }
    }
    return new Error(`${message}: ${error.message || 'Unknown error'}`);
  }

  /**
   * Test connection to Cloudflare API
   */
  async testConnection(): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }
    
    try {
      await this.api.get('/live_inputs', { params: { per_page: 1 } });
      this.logger.info('Cloudflare Stream API connection successful');
      return true;
    } catch (error) {
      this.logger.error({ error }, 'Cloudflare Stream API connection failed');
      return false;
    }
  }
}