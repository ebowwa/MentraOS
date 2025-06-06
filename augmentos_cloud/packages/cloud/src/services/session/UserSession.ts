/**
 * @fileoverview UserSession class that encapsulates all session-related
 * functionality and state for the server.
 */

import { Logger } from 'pino';
import WebSocket from 'ws';
import { AppI, CloudToGlassesMessageType, ConnectionError, TranscriptSegment } from '@augmentos/sdk';
import { logger as rootLogger } from '../logging/pino-logger';
import AppManager from './AppManager';
import AudioManager from './AudioManager';
import MicrophoneManager from './MicrophoneManager';
import DisplayManager from '../layout/DisplayManager6.1';
import { DashboardManager } from '../dashboard';
// import { HeartbeatManager } from './HeartbeatManager';
import { ASRStreamInstance } from '../processing/transcription.service';
import VideoManager from './VideoManager';
import PhotoManager from './PhotoManager';
import { GlassesErrorCode } from '../websocket/websocket-glasses.service';

// Global session storage (moved from static class property for better debugging)
const globalSessions: Map<string, UserSession> = new Map();

/**
 * Complete user session class that encapsulates all session-related
 * functionality and state for the server.
 */
export class UserSession {

  // Core identification
  public readonly userId: string;
  public readonly startTime: Date = new Date();
  public disconnectedAt: Date | null = null;

  // Logging
  public readonly logger: Logger;

  // WebSocket connection
  public websocket: WebSocket;

  // App state
  public installedApps: Map<string, AppI> = new Map();
  public runningApps: Set<string> = new Set();
  public loadingApps: Set<string> = new Set();
  public appWebsockets: Map<string, WebSocket> = new Map();

  // Transcription
  public isTranscribing: boolean = false;
  public transcript: { segments: TranscriptSegment[]; languageSegments: Map<string, TranscriptSegment[]>; }
    = { segments: [], languageSegments: new Map() };
  public transcriptionStreams: Map<string, ASRStreamInstance> = new Map();
  public lastAudioTimestamp?: number;

  // Audio
  public bufferedAudio: ArrayBufferLike[] = [];
  public recentAudioBuffer: { data: ArrayBufferLike; timestamp: number }[] = [];

  // Cleanup state
  // When disconnected, this will be set to a timer that will clean up the session after the grace period, if user does not reconnect.
  public cleanupTimerId?: NodeJS.Timeout;

  // Managers
  public displayManager: DisplayManager;
  public dashboardManager: DashboardManager;
  public microphoneManager: MicrophoneManager;
  public appManager: AppManager;
  public audioManager: AudioManager;
  // public heartbeatManager: HeartbeatManager;

  public videoManager: VideoManager;
  public photoManager: PhotoManager;

  // Transcription state
  // transcriptionStreams: Map<string, ASRStreamInstance> = new Map();

  // Reconnection
  public _reconnectionTimers: Map<string, NodeJS.Timeout>;

  // Other state
  public userDatetime?: string;

  constructor(userId: string, websocket: WebSocket) {
    this.userId = userId;
    this.websocket = websocket;
    this.logger = rootLogger.child({ userId, service: 'UserSession' });

    // Initialize managers
    this.displayManager = new DisplayManager(this);
    this.dashboardManager = new DashboardManager(this);
    this.microphoneManager = new MicrophoneManager(this);
    this.appManager = new AppManager(this);
    this.audioManager = new AudioManager(this);
    // this.heartbeatManager = new HeartbeatManager(this);
    this.videoManager = new VideoManager(this);
    this.photoManager = new PhotoManager(this);

    this._reconnectionTimers = new Map();

    // Register in global sessions map
    const existingSession = globalSessions.get(userId);
    if (existingSession) {
      this.logger.warn({
        existingSessionStartTime: existingSession.startTime,
        existingSessionDisconnectedAt: existingSession.disconnectedAt,
        newSessionStartTime: this.startTime
      }, `⚠️ RACE CONDITION: Overwriting existing session for ${userId}`);
    }
    
    globalSessions.set(userId, this);
    this.logger.info({
      totalSessions: globalSessions.size,
      allUserIds: Array.from(globalSessions.keys())
    }, `✅ User session created and registered for ${userId}`);
  }

  /**
   * Get a user session by ID
   */
  static getById(userId: string): UserSession | undefined {
    const session = globalSessions.get(userId);
    const allUserIds = Array.from(globalSessions.keys());
    
    // Debug logging to track session lookups
    rootLogger.debug({
      service: 'UserSession.getById',
      lookupUserId: userId,
      sessionFound: !!session,
      totalSessions: globalSessions.size,
      allSessionUserIds: allUserIds,
      userIdType: typeof userId,
      userIdLength: userId?.length || 0,
      exactMatches: allUserIds.filter(id => id === userId),
      similarMatches: allUserIds.filter(id => id.toLowerCase() === userId.toLowerCase()),
      containsMatches: allUserIds.filter(id => id.includes(userId) || userId.includes(id))
    }, `Session lookup: ${userId} -> ${session ? 'FOUND' : 'NOT FOUND'}`);
    
    return session;
  }

  /**
   * Get all active user sessions
   */
  static getAllSessions(): UserSession[] {
    return Array.from(globalSessions.values());
  }

  /**
   * Transform session data for client consumption
   */
  async toClientFormat(): Promise<any> {
    // Return only what the client needs
    return {
      userId: this.userId,
      startTime: this.startTime,
      activeAppSessions: Array.from(this.runningApps),
      loadingApps: Array.from(this.loadingApps),
      isTranscribing: this.isTranscribing,
      // Other client-relevant data
    };
  }

  /**
   * Send error message to glasses
   * 
   * @param code Error code
   * @param message Error message
   */
  public sendError(code: GlassesErrorCode, message: string): void {
    try {
      const errorMessage: ConnectionError = {
        type: CloudToGlassesMessageType.CONNECTION_ERROR,
        code,
        message,
        timestamp: new Date()
      };

      this.websocket.send(JSON.stringify(errorMessage));
      // this.websocket.close(1008, message);
    } catch (error) {
      this.logger.error('Error sending error message to glasses:', error);

      // try {
      //   this.websocket.close(1011, 'Internal server error');
      // } catch (closeError) {
      //   this.logger.error('Error closing WebSocket connection:', closeError);
      // }
    }
  }

  /**
   * Dispose of all resources and remove from sessions map
   */
  dispose(): void {
    this.logger.info(`Disposing user session for ${this.userId}`);

    // Clean up all resources
    if (this.appManager) this.appManager.dispose();
    if (this.audioManager) this.audioManager.dispose();
    if (this.microphoneManager) this.microphoneManager.dispose();
    if (this.displayManager) this.displayManager.dispose();
    if (this.dashboardManager) this.dashboardManager.dispose();
    // if (this.heartbeatManager) this.heartbeatManager.dispose();
    if (this.videoManager) this.videoManager.dispose();
    if (this.photoManager) this.photoManager.dispose();

    // Clear any timers
    if (this.cleanupTimerId) {
      clearTimeout(this.cleanupTimerId);
      this.cleanupTimerId = undefined;
    }

    if (this._reconnectionTimers) {
      for (const timer of this._reconnectionTimers.values()) {
        clearTimeout(timer);
      }
      this._reconnectionTimers.clear();
    }

    // Clear collections
    this.appWebsockets.clear();
    this.runningApps.clear();
    this.loadingApps.clear();
    this.bufferedAudio = [];
    this.recentAudioBuffer = [];

    // Remove from global sessions map
    const wasInMap = globalSessions.has(this.userId);
    globalSessions.delete(this.userId);
    
    this.logger.info({
      wasInMap,
      totalSessionsAfter: globalSessions.size,
      remainingUserIds: Array.from(globalSessions.keys()),
      disposalReason: this.disconnectedAt ? 'grace_period_timeout' : 'explicit_disposal'
    }, `🗑️ Session disposed and removed from map for ${this.userId}`);
  }

  /**
   * Mark session as disconnected
   */
  markDisconnected(): void {
    this.disconnectedAt = new Date();
    this.logger.info(`User session marked as disconnected for ${this.userId}`);
  }

  /**
   * Get the session ID (for backward compatibility)
   */
  get sessionId(): string {
    return this.userId;
  }
}

export default UserSession;