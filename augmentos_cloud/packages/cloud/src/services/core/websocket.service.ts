import WebSocket from 'ws';
import { IncomingMessage, Server } from 'http';
import sessionService, { ExtendedUserSession, SequencedAudioChunk } from './session.service';
// SubscriptionManager is used via userSession
import transcriptionService from '../processing/transcription.service';
import appService from './app.service';
import {
  AppStateChange,
  AuthError,
  CalendarEvent,
  CloudToGlassesMessage,
  CloudToGlassesMessageType,
  CloudToTpaMessage,
  CloudToTpaMessageType,
  ConnectionAck,
  ConnectionError,
  DataStream,
  DisplayRequest,
  ExtendedStreamType,
  GlassesConnectionState,
  GlassesToCloudMessage,
  GlassesToCloudMessageType,
  LocationUpdate,
  MicrophoneStateChange,
  StartApp,
  StopApp,
  StreamType, // Import StreamType explicitly
  TpaConnectionAck,
  TpaConnectionError,
  TpaConnectionInit,
  TpaSubscriptionUpdate,
  TpaToCloudMessage,
  UserSession,
  Vad,
  WebhookRequestType,
  parseLanguageStream,
} from '@augmentos/sdk';

import jwt, { JwtPayload } from 'jsonwebtoken';
import { PosthogService } from '../logging/posthog.service';
import { systemApps } from './system-apps';
import { User } from '../../models/user.model';
import { logger } from '@augmentos/utils';
import tpaRegistrationService from './tpa-registration.service';
import healthMonitorService from './health-monitor.service'; // Correct import

// Constants
export const PUBLIC_HOST_NAME = process.env.PUBLIC_HOST_NAME || "dev.augmentos.cloud";
export let LOCAL_HOST_NAME = process.env.CLOUD_HOST_NAME || process.env.PORTER_APP_NAME ? `${process.env.PORTER_APP_NAME}-cloud.default.svc.cluster.local:80` : "cloud"
export const AUGMENTOS_AUTH_JWT_SECRET = process.env.AUGMENTOS_AUTH_JWT_SECRET || "";
const RECONNECT_GRACE_PERIOD_MS = 1000 * 30; // 30 seconds

logger.info(`🔥🔥🔥 [websocket.service]: PUBLIC_HOST_NAME: ${PUBLIC_HOST_NAME}`);
logger.info(`🔥🔥🔥 [websocket.service]: LOCAL_HOST_NAME: ${LOCAL_HOST_NAME}`);

const WebSocketServer = WebSocket.Server || WebSocket.WebSocketServer;

const TPA_SESSION_TIMEOUT_MS = 30000; // 30 seconds
const LOG_AUDIO = false;
type MicrophoneStateChangeDebouncer = { timer: ReturnType<typeof setTimeout> | null; lastState: boolean; lastSentState: boolean };


export class WebSocketService {
  private glassesWss: WebSocket.Server;
  private tpaWss: WebSocket.Server;
  private globalAudioSequence: number = 0;

  constructor() {
    this.glassesWss = new WebSocketServer({ noServer: true });
    this.tpaWss = new WebSocketServer({ noServer: true });
  }

  private addToAudioBuffer(userSession: ExtendedUserSession, chunk: SequencedAudioChunk): void {
    if (!userSession.audioBuffer) {
        userSession.logger.warn("Audio buffer not initialized for session, cannot add chunk.");
        return; // Don't create here, should be done on connection
    }

    // Check again if interval exists (safety net)
    if (!userSession.audioBuffer.bufferProcessingInterval) {
        userSession.logger.warn("Re-initializing buffer processing interval in addToAudioBuffer - This might indicate an issue.");
        userSession.audioBuffer.bufferProcessingInterval = setInterval(() =>
          this.processAudioBuffer(userSession), 100);
    }

    userSession.audioBuffer.expectedNextSequence =
    Math.max(userSession.audioBuffer.expectedNextSequence, chunk.sequenceNumber + 1);
    const index = userSession.audioBuffer.chunks.findIndex(c => c.sequenceNumber > chunk.sequenceNumber);
    if (index === -1) userSession.audioBuffer.chunks.push(chunk);
    else userSession.audioBuffer.chunks.splice(index, 0, chunk);

    if (userSession.audioBuffer.chunks.length > userSession.audioBuffer.bufferSizeLimit) {
        const droppedCount = userSession.audioBuffer.chunks.length - userSession.audioBuffer.bufferSizeLimit;
        userSession.audioBuffer.chunks = userSession.audioBuffer.chunks.slice(droppedCount);
        // userSession.logger.warn(`Audio buffer limit exceeded. Dropped ${droppedCount} oldest chunks.`);
    }
  }

  private async processAudioBuffer(userSession: ExtendedUserSession): Promise<void> {
    // Add extra check for session validity within the processing loop
    const currentSession = sessionService.getSession(userSession.sessionId);
    if (!currentSession || !currentSession.audioBuffer || currentSession.websocket?.readyState !== WebSocket.OPEN) {
        // Stop processing if session ended or websocket closed during processing
        if (userSession.audioBuffer?.bufferProcessingInterval) {
            userSession.logger.warn(`Stopping audio buffer processing for ${userSession.sessionId} due to inactive session/WS.`);
            clearInterval(userSession.audioBuffer.bufferProcessingInterval);
            userSession.audioBuffer.bufferProcessingInterval = null;
        }
        return;
    }
    // Use the potentially updated session reference from here on
    userSession = currentSession;

    if (!userSession.audioBuffer) {
        userSession.logger.warn("Audio buffer not initialized, cannot process.");
        return;
    }

    if (userSession.audioBuffer.chunks.length === 0 || userSession.audioBuffer.processingInProgress) {
        return;
    }
    userSession.audioBuffer.processingInProgress = true;
    try {
        const now = Date.now();
        const chunks = userSession.audioBuffer.chunks;
        if (chunks.length > 0) {
            const oldestChunkTime = chunks[0].receivedAt;
            const bufferTimeElapsed = now - oldestChunkTime > userSession.audioBuffer.bufferTimeWindowMs;
            if (bufferTimeElapsed || chunks.length >= 5) {
                chunks.sort((a, b) => a.sequenceNumber - b.sequenceNumber); // Ensure order
                while (chunks.length > 0) {
                    const nextChunk = chunks[0];
                    const isNextInSequence = nextChunk.sequenceNumber === userSession.audioBuffer.lastProcessedSequence + 1;
                    const hasWaitedLongEnough = now - nextChunk.receivedAt > userSession.audioBuffer.bufferTimeWindowMs;

                    if (isNextInSequence || hasWaitedLongEnough) {
                        if (!isNextInSequence && hasWaitedLongEnough) {
                            // userSession.logger.warn(`Processing out-of-sequence chunk ${nextChunk.sequenceNumber} after timeout. Expected: ${userSession.audioBuffer.lastProcessedSequence + 1}`);
                        }
                        chunks.shift();
                        const processedData = await sessionService.handleAudioData(userSession, nextChunk.data, nextChunk.isLC3, nextChunk.sequenceNumber);
                        userSession.audioBuffer.lastProcessedSequence = nextChunk.sequenceNumber;
                        if (processedData) {
                            this.broadcastToTpaAudio(userSession, processedData);
                        }
                    } else {
                        if (LOG_AUDIO) userSession.logger.debug(`Audio buffer waiting for ${userSession.audioBuffer.lastProcessedSequence + 1}, next is ${nextChunk.sequenceNumber}`);
                        break; // Wait for the correct sequence or timeout
                    }
                }
                if (chunks.length > 0 && LOG_AUDIO) userSession.logger.debug(`Audio buffer has ${chunks.length} chunks remaining after processing.`);
            }
        }
    } catch (error) {
        userSession.logger.error('Error processing audio buffer:', error);
    } finally {
        // Check buffer exists before clearing flag
        if(userSession.audioBuffer) userSession.audioBuffer.processingInProgress = false;
    }
  }


  setupWebSocketServers(server: Server): void {
    this.initializeWebSocketServers();
    this.setupUpgradeHandler(server);
  }

  private microphoneStateChangeDebouncers = new Map<string, MicrophoneStateChangeDebouncer>();

  private sendDebouncedMicrophoneStateChange(ws: WebSocket, userSession: ExtendedUserSession, isEnabled: boolean, delay = 1000): void {
    const sessionId = userSession.sessionId;
    let debouncer = this.microphoneStateChangeDebouncers.get(sessionId);

    const createMessage = (enabledState: boolean): MicrophoneStateChange => ({
        type: CloudToGlassesMessageType.MICROPHONE_STATE_CHANGE,
        sessionId: userSession.sessionId,
        userSession: { // Only include essential state for the client
            sessionId: userSession.sessionId,
            userId: userSession.userId,
            startTime: userSession.startTime,
            activeAppSessions: userSession.activeAppSessions,
            loadingApps: userSession.loadingApps, // Might not be needed by client?
            isTranscribing: enabledState, // Reflect the *intended* state
        },
        isMicrophoneEnabled: enabledState,
        timestamp: new Date(),
    });

    if (!debouncer) {
        const message = createMessage(isEnabled);
        userSession.logger.info(`[websocket.service] Sending immediate microphone state: ${isEnabled}`);
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
        else userSession.logger.warn("WS not open, cannot send immediate mic state");

        debouncer = { timer: null, lastState: isEnabled, lastSentState: isEnabled };
        this.microphoneStateChangeDebouncers.set(sessionId, debouncer);

        if (isEnabled) transcriptionService.startTranscription(userSession);
        else transcriptionService.stopTranscription(userSession);

    } else {
        debouncer.lastState = isEnabled;
        if (debouncer.timer) {
            clearTimeout(debouncer.timer);
            userSession.logger.debug(`[websocket.service] Debounce reset for microphone state: ${isEnabled}`);
        } else {
            userSession.logger.debug(`[websocket.service] Debounce initiated for microphone state: ${isEnabled}`);
        }
    }

    debouncer.timer = setTimeout(() => {
        const currentDebouncer = this.microphoneStateChangeDebouncers.get(sessionId);
        // Check if session/ws still valid before acting on timer
        const currentSession = sessionService.getSession(sessionId);
        if (!currentDebouncer || !currentSession || currentSession.websocket?.readyState !== WebSocket.OPEN) {
             this.microphoneStateChangeDebouncers.delete(sessionId); // Clean up if session gone
             return;
        }


        if (currentDebouncer.lastState !== currentDebouncer.lastSentState) {
            userSession.logger.info(`[websocket.service] Sending debounced microphone state: ${currentDebouncer.lastState}`);
            const message = createMessage(currentDebouncer.lastState);
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
            else userSession.logger.warn("WS not open, cannot send debounced mic state");
            currentDebouncer.lastSentState = currentDebouncer.lastState;

             if (currentDebouncer.lastSentState) transcriptionService.startTranscription(userSession);
             else transcriptionService.stopTranscription(userSession);

        } else {
             userSession.logger.info(`[websocket.service] Debounced microphone state unchanged (${currentDebouncer.lastState}), not sending.`);
             // Ensure transcription state matches last sent state
             if (currentDebouncer.lastSentState !== userSession.isTranscribing) {
                 userSession.logger.warn(`[websocket.service] Correcting transcription state mismatch after debounce.`);
                 if (currentDebouncer.lastSentState) transcriptionService.startTranscription(userSession);
                 else transcriptionService.stopTranscription(userSession);
             }
        }
        this.microphoneStateChangeDebouncers.delete(sessionId);
         userSession.logger.debug(`[websocket.service] Debouncer removed for session ${sessionId}`);
    }, delay);
  }


  async generateAppStateStatus(userSession: ExtendedUserSession): Promise<AppStateChange> {
    const activeAppPackageNames = Array.from(new Set(userSession.activeAppSessions));
    const appSubscriptionsMap = new Map<string, ExtendedStreamType[]>();
    const whatToStreamSet = new Set<ExtendedStreamType>();

    const allSubs = userSession.subscriptionManager.getAllSubscriptions();

    for (const packageName of activeAppPackageNames) {
        const subs = allSubs.get(packageName) || [];
        appSubscriptionsMap.set(packageName, subs);
        subs.forEach(sub => whatToStreamSet.add(sub));
    }

    const dashboardPackageName = systemApps.dashboard.packageName;
    const dashboardSubs = allSubs.get(dashboardPackageName) || [];
     if (dashboardSubs.length > 0 || userSession.appConnections.has(dashboardPackageName)) {
         appSubscriptionsMap.set(dashboardPackageName, dashboardSubs);
         dashboardSubs.forEach(sub => whatToStreamSet.add(sub));
         if (!activeAppPackageNames.includes(dashboardPackageName)) {
             activeAppPackageNames.push(dashboardPackageName);
         }
     }


    const userSessionData = {
      sessionId: userSession.sessionId,
      userId: userSession.userId,
      startTime: userSession.startTime,
      installedApps: userSession.installedApps || await appService.getAllApps(userSession.userId),
      appSubscriptions: Object.fromEntries(appSubscriptionsMap),
      activeAppPackageNames: Array.from(new Set(activeAppPackageNames)),
      whatToStream: Array.from(whatToStreamSet),
    };

    const appStateChange: AppStateChange = {
      type: CloudToGlassesMessageType.APP_STATE_CHANGE,
      sessionId: userSession.sessionId,
      userSession: userSessionData,
      timestamp: new Date()
    };

    return appStateChange;
  }

  async startAppSession(userSession: ExtendedUserSession, packageName: string): Promise<string> {
    if (userSession.loadingApps.has(packageName) || userSession.activeAppSessions.includes(packageName)) {
      userSession.logger.info(`[websocket.service] App ${packageName} already loading or running.`);
      return `${userSession.sessionId}-${packageName}`;
    }

    const app = await appService.getApp(packageName);
    if (!app) {
      userSession.logger.error(`[websocket.service] App ${packageName} not found.`);
      throw new Error(`App ${packageName} not found`);
    }

    userSession.logger.info(`[websocket.service] Loading app ${packageName} for user ${userSession.userId}`);
    userSession.loadingApps.add(packageName);

    try {
      let augmentOSWebsocketUrl = '';
       if (app.isSystemApp) {
         if (process.env.CONTAINER_ENVIRONMENT === 'true' || process.env.CLOUD_HOST_NAME === 'cloud' || process.env.PORTER_APP_NAME) {
           augmentOSWebsocketUrl = process.env.PORTER_APP_NAME ?
              `ws://${process.env.PORTER_APP_NAME}-cloud.default.svc.cluster.local:80/tpa-ws` :
              'ws://cloud/tpa-ws';
         } else {
           augmentOSWebsocketUrl = 'ws://localhost:8002/tpa-ws'; // Adjust port if needed
         }
          userSession.logger.info(`Using internal/local URL for system app ${packageName}: ${augmentOSWebsocketUrl}`);
       } else {
         augmentOSWebsocketUrl = `wss://${PUBLIC_HOST_NAME}/tpa-ws`;
          userSession.logger.info(`Using public URL for app ${packageName}: ${augmentOSWebsocketUrl}`);
       }
      userSession.logger.info(`[websocket.service] Triggering webhook for ${packageName} at ${app.publicUrl} with wsUrl: ${augmentOSWebsocketUrl}`);
      const webhookURL = `${app.publicUrl}/webhook`;
      await appService.triggerWebhook(webhookURL, {
        type: WebhookRequestType.SESSION_REQUEST,
        sessionId: `${userSession.sessionId}-${packageName}`,
        userId: userSession.userId,
        timestamp: new Date().toISOString(),
        augmentOSWebsocketUrl,
      });

      userSession.displayManager.handleAppStart(app.packageName, userSession);

      setTimeout(() => {
        if (userSession.loadingApps.has(packageName)) {
          userSession.loadingApps.delete(packageName);
          userSession.logger.info(`[websocket.service] TPA ${packageName} start timeout expired.`);
          userSession.displayManager.handleAppStop(app.packageName, userSession);
           // If it timed out, ensure it's not in active list either
           userSession.activeAppSessions = userSession.activeAppSessions.filter(name => name !== packageName);
           sessionService.triggerAppStateChange(userSession.userId); // Update client state
        }
      }, TPA_SESSION_TIMEOUT_MS);

      if (!userSession.activeAppSessions.includes(packageName)) {
          userSession.activeAppSessions.push(packageName);
      }

      try {
        const user = await User.findByEmail(userSession.userId);
        if (user) await user.addRunningApp(packageName);
      } catch (error) { userSession.logger.error(`Error updating user's running apps:`, error); }

      return `${userSession.sessionId}-${packageName}`;

    } catch (error) {
      userSession.logger.error(`[websocket.service] Error starting app ${packageName}:`, error);
      userSession.loadingApps.delete(packageName);
       userSession.activeAppSessions = userSession.activeAppSessions.filter(name => name !== packageName);
      throw error;
    }
  }


  async stopAppSession(userSession: ExtendedUserSession, packageName: string): Promise<boolean> {
    userSession.logger.info(`[websocket.service] Stopping app ${packageName} for user ${userSession.userId}`);

    const appConnection = userSession.appConnections.get(packageName); // Get connection before removing state

    try {
      if (appConnection && appConnection.readyState === WebSocket.OPEN) {
          userSession.logger.info(`[websocket.service] Closing TPA connection for ${packageName}`);
          appConnection.close(1000, 'App stopped by user');
      }
      userSession.appConnections.delete(packageName);

      userSession.subscriptionManager.removeSubscriptions(packageName);

      userSession.activeAppSessions = userSession.activeAppSessions.filter( name => name !== packageName );
      userSession.loadingApps.delete(packageName); // Ensure removed from loading too

      try {
        const user = await User.findByEmail(userSession.userId);
        if (user) await user.removeRunningApp(packageName);
      } catch (error) { userSession.logger.error(`Error updating user's running apps on stop:`, error); }

      userSession.displayManager.handleAppStop(packageName, userSession);

      if (userSession.websocket && userSession.websocket.readyState === WebSocket.OPEN) {
        const mediaSubscriptions = userSession.subscriptionManager.hasMediaSubscriptions();
        if (!mediaSubscriptions) {
          userSession.logger.info('[websocket.service] No media subscriptions remain after stopping app, disabling microphone.');
          this.sendDebouncedMicrophoneStateChange(userSession.websocket, userSession, false);
        } else {
             userSession.logger.info('[websocket.service] Media subscriptions still exist, microphone state potentially unchanged.');
        }
      }

      userSession.logger.info(`[websocket.service] Successfully stopped app ${packageName}`);
      await sessionService.triggerAppStateChange(userSession.userId); // Notify client of state change
      return true;
    } catch (error) {
      userSession.logger.error(`[websocket.service] Error stopping app ${packageName}:`, error);
      // Ensure cleanup even on error
      userSession.appConnections.delete(packageName);
      userSession.activeAppSessions = userSession.activeAppSessions.filter( name => name !== packageName );
      userSession.loadingApps.delete(packageName);
      throw error;
    }
  }


  broadcastToTpa(userSession: ExtendedUserSession, streamType: StreamType, data: CloudToTpaMessage | any): void {
    if (!userSession) {
      logger.error(`[websocket.service] Attempted broadcast with invalid userSession.`);
      return;
    }

    let effectiveSubscription: ExtendedStreamType = streamType;
    const langInfo = parseLanguageStream(data?.type as string);
    const dataLang = (data as any).transcribeLanguage;
    const targetLang = (data as any).translateLanguage;

    if (streamType === StreamType.TRANSLATION && dataLang && targetLang) {
        effectiveSubscription = `${StreamType.TRANSLATION}:${dataLang}-to-${targetLang}`;
    } else if (streamType === StreamType.TRANSCRIPTION && dataLang) {
        effectiveSubscription = `${StreamType.TRANSCRIPTION}:${dataLang}`;
    } else if (langInfo) {
        effectiveSubscription = data.type;
    }
    // Add default only if specifically needed and not handled by TPA subscription request
    // else if (streamType === StreamType.TRANSCRIPTION && !dataLang) {
    //    effectiveSubscription = `${StreamType.TRANSCRIPTION}:en-US`; // Be careful with defaults
    // }

    userSession.logger.debug(`[websocket.service] Broadcasting ${streamType}, effective subscription: ${effectiveSubscription}`);

    const subscribedApps = userSession.subscriptionManager.getSubscribedApps(effectiveSubscription);

    if (subscribedApps.length === 0) {
      userSession.logger.debug(`[websocket.service] No TPAs subscribed to ${effectiveSubscription}, skipping broadcast.`);
      return;
    }

    userSession.logger.debug(`[websocket.service] Broadcasting ${effectiveSubscription} to apps:`, subscribedApps);

    subscribedApps.forEach(packageName => {
      const tpaSessionId = `${userSession.sessionId}-${packageName}`;
      const websocket = userSession.appConnections.get(packageName);

      if (websocket && websocket.readyState === WebSocket.OPEN) {
        const dataStream: DataStream = {
          type: CloudToTpaMessageType.DATA_STREAM,
          sessionId: tpaSessionId,
          streamType,
          data,
          timestamp: new Date()
        };
        try {
            websocket.send(JSON.stringify(dataStream));
        } catch(err) {
             userSession.logger.error(`[websocket.service] Error sending to TPA ${packageName}:`, err);
        }
      } else {
        if (websocket && websocket.readyState !== WebSocket.CONNECTING) {
             userSession.logger.warn(`[websocket.service] TPA ${packageName} not connected or ready (state: ${websocket?.readyState}), cannot send ${effectiveSubscription}.`);
        }
      }
    });
  }

  broadcastToTpaAudio(userSession: ExtendedUserSession, arrayBuffer: ArrayBufferLike): void {
    const subscribedApps = userSession.subscriptionManager.getSubscribedApps(StreamType.AUDIO_CHUNK);

    if (subscribedApps.length === 0) return;

    for (const packageName of subscribedApps) {
      const websocket = userSession.appConnections.get(packageName);
      if (websocket && websocket.readyState === WebSocket.OPEN) {
         try {
             websocket.send(arrayBuffer);
         } catch(err) {
              userSession.logger.error(`[websocket.service] Error sending audio chunk to TPA ${packageName}:`, err);
         }
      } else {
         if (websocket && websocket.readyState !== WebSocket.CONNECTING) {
            userSession.logger.debug(`[websocket.service] TPA ${packageName} not ready for audio chunk (state: ${websocket?.readyState}).`); // Use debug
         }
      }
    }
  }


  private initializeWebSocketServers(): void {
    this.glassesWss.on('connection', this.handleGlassesConnection.bind(this));
    this.tpaWss.on('connection', this.handleTpaConnection.bind(this));
  }

  private setupUpgradeHandler(server: Server): void {
    server.on('upgrade', (request, socket, head) => {
      const { url } = request;
      if (url === '/glasses-ws') {
        this.glassesWss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
          this.glassesWss.emit('connection', ws, request);
        });
      } else if (url === '/tpa-ws') {
        this.tpaWss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
          this.tpaWss.emit('connection', ws, request);
        });
      } else {
        logger.warn(`[websocket.service] Rejecting upgrade request for unknown path: ${url}`);
        socket.destroy();
      }
    });
  }

  private async handleGlassesConnection(ws: WebSocket, request: IncomingMessage): Promise<void> {
    logger.info(`[websocket.service] Handling new glasses connection request...`);
    const coreToken = request.headers.authorization?.split(' ')[1];
    let userId = '';

    if (!coreToken) {
        logger.error('[websocket.service] No core token provided');
        const errorMessage: ConnectionError = { type: CloudToGlassesMessageType.CONNECTION_ERROR, message: 'No auth token provided', timestamp: new Date() };
        ws.send(JSON.stringify(errorMessage));
        ws.close(1008); return;
    }
    try {
        const userData = jwt.verify(coreToken, AUGMENTOS_AUTH_JWT_SECRET);
        userId = (userData as JwtPayload).email;
        if (!userId) throw new Error('User email not found in token');
    } catch (error) {
        logger.error('[websocket.service] Invalid core token:', error);
        const errorMessage: ConnectionError = { type: CloudToGlassesMessageType.CONNECTION_ERROR, message: 'Invalid auth token', timestamp: new Date() };
        ws.send(JSON.stringify(errorMessage));
        ws.close(1008); return;
    }

    logger.info(`[websocket.service] Auth successful for user: ${userId}`);
    const startTimestamp = new Date();
    let userSession: ExtendedUserSession;

    try {
        userSession = await sessionService.createSession(ws, userId);
        healthMonitorService.registerGlassesConnection(ws);
    } catch (sessionError) {
         logger.error(`[websocket.service] Failed to create session for ${userId}:`, sessionError);
         const errorMessage: ConnectionError = { type: CloudToGlassesMessageType.CONNECTION_ERROR, message: 'Failed to initialize user session', timestamp: new Date() };
         ws.send(JSON.stringify(errorMessage));
         ws.close(1011); return;
    }

    if (userSession.audioBuffer) {
        if (userSession.audioBuffer.bufferProcessingInterval) {
            clearInterval(userSession.audioBuffer.bufferProcessingInterval);
            userSession.logger.info(`Cleared existing audio buffer interval on new connection.`);
        }
        userSession.audioBuffer.bufferProcessingInterval = setInterval(() => {
             const currentSession = sessionService.getSession(userSession.sessionId);
             if (currentSession && currentSession.websocket === ws && ws.readyState === WebSocket.OPEN) {
                 this.processAudioBuffer(currentSession);
             } else if (userSession.audioBuffer?.bufferProcessingInterval) { // Check interval exists before clearing
                 userSession.logger.warn(`Stopping audio buffer interval for session ${userSession.sessionId} due to state mismatch.`);
                 clearInterval(userSession.audioBuffer.bufferProcessingInterval);
                 userSession.audioBuffer.bufferProcessingInterval = null; // Set to null
             }
        }, 100);
        userSession.logger.info(`✅ Audio buffer processing interval started for session ${userSession.sessionId}`);
    }


    ws.on('message', async (message: Buffer | string, isBinary: boolean) => {
       const currentSession = sessionService.getSession(userSession.sessionId);
       if (!currentSession || currentSession.websocket !== ws) {
            // Use the initial userSession logger as currentSession might be null
            userSession.logger.warn(`Received message on stale websocket for session ${userSession.sessionId}. Ignoring.`);
            return;
       }
      try {
        if (Buffer.isBuffer(message) && isBinary) {
           const _buffer = message as Buffer;
           const arrayBuf: ArrayBufferLike = _buffer.buffer.slice(_buffer.byteOffset, _buffer.byteOffset + _buffer.byteLength);
           const sequenceNumber = this.globalAudioSequence++;
           const now = Date.now();
           const chunk: SequencedAudioChunk = { sequenceNumber, timestamp: now, data: arrayBuf, isLC3: true, receivedAt: now };
           this.addToAudioBuffer(currentSession, chunk);
          return;
        }

        healthMonitorService.updateGlassesActivity(ws);
        currentSession.logger.debug("Received message from glasses:", message.toString()); // Use currentSession logger

        const parsedMessage = JSON.parse(message.toString()) as GlassesToCloudMessage;
        await this.handleGlassesMessage(currentSession, ws, parsedMessage);
      } catch (error) {
        // Use currentSession logger if available, else initial logger
        (currentSession || userSession).logger.error(`[websocket.service] Error handling glasses message:`, error);
        this.sendError(ws, { type: CloudToGlassesMessageType.CONNECTION_ERROR, message: 'Error processing message', timestamp: new Date() });
      }
    });

    ws.on('ping', () => {
      healthMonitorService.updateGlassesActivity(ws);
      try { ws.pong(); } catch (error) { userSession.logger.error('[websocket.service] Error sending pong:', error); }
    });

    ws.on('close', () => {
      userSession.logger.info(`[websocket.service] Glasses WebSocket disconnected: ${userSession.sessionId} (ws instance closing)`);

      if (userSession.audioBuffer && userSession.audioBuffer.bufferProcessingInterval) {
          clearInterval(userSession.audioBuffer.bufferProcessingInterval);
          userSession.audioBuffer.bufferProcessingInterval = null;
          userSession.logger.info(`Stopped audio buffer interval for session ${userSession.sessionId} on WS close.`);
      }

      sessionService.markSessionDisconnected(userSession);

      if (this.microphoneStateChangeDebouncers.has(userSession.sessionId)) {
           const debouncer = this.microphoneStateChangeDebouncers.get(userSession.sessionId);
           if (debouncer?.timer) clearTimeout(debouncer.timer);
           this.microphoneStateChangeDebouncers.delete(userSession.sessionId);
           userSession.logger.info(`Cleared microphone debouncer for session ${userSession.sessionId} on WS close.`);
      }

       userSession.logger.info(`[websocket.service] Scheduling final cleanup check for ${userSession.sessionId} in ${RECONNECT_GRACE_PERIOD_MS}ms`);
       if(userSession.cleanupTimerId) clearTimeout(userSession.cleanupTimerId);
       userSession.cleanupTimerId = setTimeout(() => {
            const sessionToCheck = sessionService.getSession(userSession.sessionId);
            if (sessionToCheck && sessionToCheck.disconnectedAt !== null) {
                 if (!sessionToCheck.websocket || sessionToCheck.websocket.readyState === WebSocket.CLOSED || sessionToCheck.websocket.readyState === WebSocket.CLOSING) {
                    userSession.logger.info(`[websocket.service] Grace period expired, cleaning up session: ${userSession.sessionId}`);
                    sessionService.endSession(sessionToCheck);
                 } else {
                     userSession.logger.info(`[websocket.service] Session ${userSession.sessionId} reconnected, cleanup cancelled.`);
                 }
            } else if (!sessionToCheck) {
                 userSession.logger.info(`[websocket.service] Session ${userSession.sessionId} already ended, cleanup timer ignored.`);
            } else {
                userSession.logger.info(`[websocket.service] Session ${userSession.sessionId} is connected, cleanup cancelled.`);
            }
            // Avoid accessing potentially ended session here
            // if (sessionToCheck) sessionToCheck.cleanupTimerId = undefined; // Cleared in endSession or on reconnect

       }, RECONNECT_GRACE_PERIOD_MS);

      const endTimestamp = new Date();
      const connectionDuration = endTimestamp.getTime() - startTimestamp.getTime();
      PosthogService.trackEvent('disconnected', userSession.userId, { /* ... duration ... */ });
    });

    ws.on('error', (error) => {
      userSession.logger.error(`[websocket.service] Glasses WebSocket error for session ${userSession.sessionId}:`, error);

       if (userSession.audioBuffer && userSession.audioBuffer.bufferProcessingInterval) {
           clearInterval(userSession.audioBuffer.bufferProcessingInterval);
           userSession.audioBuffer.bufferProcessingInterval = null;
           userSession.logger.info(`Stopped audio buffer interval for session ${userSession.sessionId} on WS error.`);
       }

      sessionService.endSession(userSession);
      try { ws.close(); } catch(e) { /* ignore */ }
    });

     // --- Initial setup after successful connection ---
     try {
        const ackMessage: ConnectionAck = {
            type: CloudToGlassesMessageType.CONNECTION_ACK,
            sessionId: userSession.sessionId,
            userSession: await sessionService.transformUserSessionForClient(userSession),
            timestamp: new Date()
        };
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(ackMessage));
        else userSession.logger.warn("WS closed before ACK could be sent");

        userSession.logger.info(`[websocket.service] Sent CONNECTION_ACK to ${userSession.userId}`);
        PosthogService.trackEvent('connected', userSession.userId, { sessionId: userSession.sessionId, timestamp: new Date().toISOString() });
     } catch (err) {
        userSession.logger.error(`[websocket.service] Failed to send CONNECTION_ACK:`, err);
     }

    try {
        await this.startAppSession(userSession, systemApps.dashboard.packageName);
    } catch (error) { userSession.logger.error(`[websocket.service] Error auto-starting dashboard app:`, error); }
    try {
        const user = await User.findOrCreateUser(userSession.userId);
        userSession.logger.info(`[websocket.service] Auto-starting ${user.runningApps.length} apps for ${userSession.userId}: [${user.runningApps.join(", ")}]`);
        for (const packageName of user.runningApps) {
            if(packageName === systemApps.dashboard.packageName) continue;
            try {
                await this.startAppSession(userSession, packageName);
                userSession.logger.info(`[websocket.service] ✅ Auto-started app ${packageName}`);
            } catch (error) {
                userSession.logger.error(`[websocket.service] Error auto-starting app ${packageName}:`, error);
            }
        }
         await sessionService.triggerAppStateChange(userSession.userId);
    } catch (error) { userSession.logger.error(`[websocket.service] Error retrieving/starting user apps:`, error); }

    const initialMediaSubs = userSession.subscriptionManager.hasMediaSubscriptions();
    this.sendDebouncedMicrophoneStateChange(ws, userSession, initialMediaSubs, 0);
  }


  private async handleGlassesMessage(userSession: ExtendedUserSession, ws: WebSocket, message: GlassesToCloudMessage): Promise<void> {
     userSession.logger.debug(`Handling glasses message type: ${message.type}`);
     PosthogService.trackEvent(message.type, userSession.userId, { sessionId: userSession.sessionId, eventType: message.type, timestamp: new Date().toISOString() });

    try {
      switch (message.type) {
        case GlassesToCloudMessageType.START_APP: {
          const startMessage = message as StartApp;
          userSession.logger.info(`[websocket.service] Received start_app request for ${startMessage.packageName}`);
          try {
            await this.startAppSession(userSession, startMessage.packageName);
            await sessionService.triggerAppStateChange(userSession.userId);
            PosthogService.trackEvent(`start_app:${startMessage.packageName}`, userSession.userId, { sessionId: userSession.sessionId, eventType: message.type, timestamp: new Date().toISOString() });
          } catch (error) {
            userSession.logger.error(`[websocket.service] Error processing start_app for ${startMessage.packageName}:`, error);
             this.sendError(ws, { type: CloudToGlassesMessageType.CONNECTION_ERROR, message: `Failed to start app: ${startMessage.packageName}`, timestamp: new Date() });
          }
          break;
        }

        case GlassesToCloudMessageType.STOP_APP: {
          const stopMessage = message as StopApp;
           userSession.logger.info(`[websocket.service] Received stop_app request for ${stopMessage.packageName}`);
          try {
            PosthogService.trackEvent(`stop_app:${stopMessage.packageName}`, userSession.userId, { sessionId: userSession.sessionId, eventType: message.type, timestamp: new Date().toISOString() });
            await this.stopAppSession(userSession, stopMessage.packageName);
          } catch (error) {
            userSession.logger.error(`[websocket.service] Error processing stop_app for ${stopMessage.packageName}:`, error);
             this.sendError(ws, { type: CloudToGlassesMessageType.CONNECTION_ERROR, message: `Failed to stop app: ${stopMessage.packageName}`, timestamp: new Date() });
          }
          break;
        }

        case GlassesToCloudMessageType.GLASSES_CONNECTION_STATE: {
          const stateMessage = message as GlassesConnectionState;
          userSession.logger.info(`Glasses connection state updated: ${stateMessage.status}`);
           PosthogService.trackEvent(message.type, userSession.userId, { sessionId: userSession.sessionId, connectionState: stateMessage, timestamp: new Date().toISOString() });
           if (stateMessage.status === 'CONNECTED') {
               PosthogService.trackEvent("modelName", userSession.userId, { sessionId: userSession.sessionId, modelName: stateMessage.modelName, timestamp: new Date().toISOString() });
           }
          break;
        }

        case GlassesToCloudMessageType.VAD: {
          const vadMessage = message as Vad;
          const isSpeaking = vadMessage.status === true || vadMessage.status === 'true';
          userSession.logger.info(`VAD status received: ${isSpeaking}`);
          this.sendDebouncedMicrophoneStateChange(ws, userSession, isSpeaking);
          if(Object.values(StreamType).includes(StreamType.VAD)){
              this.broadcastToTpa(userSession, StreamType.VAD, vadMessage);
          } else { userSession.logger.warn(`StreamType.VAD not defined.`); }
          break;
        }

        case GlassesToCloudMessageType.LOCATION_UPDATE: {
          const locationUpdate = message as LocationUpdate;
          userSession.logger.info(`Location update received: ${locationUpdate.lat}, ${locationUpdate.lng}`);
           try { const user = await User.findByEmail(userSession.userId); if (user) await user.setLocation(locationUpdate); }
           catch (error) { userSession.logger.error(`[websocket.service] Error updating user location:`, error); }
           if(Object.values(StreamType).includes(StreamType.LOCATION_UPDATE)){
               this.broadcastToTpa(userSession, StreamType.LOCATION_UPDATE, locationUpdate);
           } else { userSession.logger.warn(`StreamType.LOCATION_UPDATE not defined.`); }
          break;
        }

        case GlassesToCloudMessageType.CALENDAR_EVENT: {
            const calendarEvent = message as CalendarEvent;
            userSession.logger.info('Calendar event received:', calendarEvent.title);
             if(Object.values(StreamType).includes(StreamType.CALENDAR_EVENT)){
                  this.broadcastToTpa(userSession, StreamType.CALENDAR_EVENT, calendarEvent);
             } else { userSession.logger.warn(`StreamType.CALENDAR_EVENT not defined.`); }
            break;
        }

        default: {
            const streamTypeToBroadcast = message.type as StreamType;
            if (Object.values(StreamType).includes(streamTypeToBroadcast)) {
                 userSession.logger.debug(`Broadcasting message type (as StreamType): ${streamTypeToBroadcast} to TPAs`);
                 this.broadcastToTpa(userSession, streamTypeToBroadcast, message as any);
            } else {
                 userSession.logger.warn(`Received glasses message type '${message.type}' which does not directly map to a broadcastable StreamType.`);
            }
        }
      }
    } catch (error) {
      userSession.logger.error(`[websocket.service] Unhandled error in handleGlassesMessage:`, error);
      this.sendError(ws, { type: CloudToGlassesMessageType.CONNECTION_ERROR, message: 'Internal server error handling message', timestamp: new Date() });
       PosthogService.trackEvent("error-handleGlassesMessage", userSession.userId, { sessionId: userSession.sessionId, error: error, timestamp: new Date().toISOString() });
    }
  }

  private handleTpaConnection(ws: WebSocket, request: IncomingMessage): void {
    logger.info('New TPA attempting to connect...');
    const xForwardedFor = request.headers['x-forwarded-for'];
    const firstXForwardedFor = Array.isArray(xForwardedFor) ? xForwardedFor[0] : xForwardedFor;
    const remoteAddress = request.socket.remoteAddress || firstXForwardedFor || 'unknown';
    logger.info(`TPA Connection from address: ${remoteAddress}`);

    let currentAppSessionId: string | null = null;
    let userSession: ExtendedUserSession | null = null; // Cached after init

    const setAppSessionInfo = (appSessionId: string, session: ExtendedUserSession) => {
      currentAppSessionId = appSessionId;
      userSession = session;
      logger.info(`TPA connection associated with appSessionId: ${appSessionId}`);
       healthMonitorService.registerTpaConnection(ws); // Pass ID
    };

    ws.on('message', async (data: Buffer | string, isBinary: boolean) => {
       if (!currentAppSessionId || !userSession) {
           // Allow init message to proceed
           if (!data.toString().includes('"type":"tpa_connection_init"')) {
                logger.warn(`[websocket.service] Received TPA message before initialization. Ignoring.`);
                return;
           }
       } else {
            healthMonitorService.updateTpaActivity(ws);
       }

      if (isBinary) {
        logger.warn(`[${currentAppSessionId || 'TPA'}] Received unexpected binary message.`);
        return;
      }

      let message: TpaToCloudMessage;
      try {
          message = JSON.parse(data.toString()) as TpaToCloudMessage;
          if (currentAppSessionId && message.sessionId !== currentAppSessionId && message.type !== 'tpa_connection_init') {
              logger.error(`[${currentAppSessionId}] Received message with mismatched sessionId: ${message.sessionId}. Closing.`);
              ws.close(1008, 'Session ID mismatch'); return;
          }
          logger.debug(`[${currentAppSessionId || 'TPA'}] Received message type: ${message.type}`);
      } catch (error) {
        logger.error(`[${currentAppSessionId || 'TPA'}] Error parsing TPA message:`, error);
        this.sendError(ws, { type: CloudToTpaMessageType.CONNECTION_ERROR, message: 'Invalid JSON message', timestamp: new Date() });
        return;
      }

       try {
           switch (message.type) {
                case 'tpa_connection_init': {
                    const initMessage = message as TpaConnectionInit;
                    await this.handleTpaInit(ws, initMessage, remoteAddress, setAppSessionInfo);
                    break;
                }

                case 'subscription_update': {
                    // Re-fetch session in case it was updated elsewhere, using the established ID
                    const currentSession = currentAppSessionId ? sessionService.getSession(currentAppSessionId.split('-')[0]) : null;
                    if (!currentSession || !currentAppSessionId) {
                        logger.error(`[${message.sessionId || 'TPA'}] Received subscription_update on invalid session. Closing.`);
                        ws.close(1008, 'Session not initialized'); return;
                    }
                    userSession = currentSession; // Update local reference

                    const subMessage = message as TpaSubscriptionUpdate;
                    const expectedPackageName = currentAppSessionId.split('-').slice(1).join('-');
                    if (message.packageName !== expectedPackageName) {
                         logger.error(`[${currentAppSessionId}] Received subscription_update with mismatched package name: ${message.packageName}. Closing.`);
                         ws.close(1008, 'Package name mismatch'); return;
                    }

                    userSession.logger.info(`[websocket.service] Received subscription_update from ${message.packageName}`);
                    const previousLangSubs = userSession.subscriptionManager.getMinimalLanguageSubscriptions();
                    userSession.subscriptionManager.updateSubscriptions(message.packageName, subMessage.subscriptions);
                    const newLangSubs = userSession.subscriptionManager.getMinimalLanguageSubscriptions();
                    const languageSubsChanged = previousLangSubs.length !== newLangSubs.length || !previousLangSubs.every(sub => newLangSubs.includes(sub));

                    if (languageSubsChanged) {
                        userSession.logger.info(`Language subscriptions changed. Previous: [${previousLangSubs.join(', ')}], New: [${newLangSubs.join(', ')}]. Updating ASR streams.`);
                        transcriptionService.updateTranscriptionStreams(userSession, newLangSubs);
                    } else {
                        userSession.logger.info(`Language subscriptions unchanged.`);
                    }
                    // Always check mic state after any sub update
                    const mediaSubs = userSession.subscriptionManager.hasMediaSubscriptions();
                    userSession.logger.info(`Media subscriptions after update: ${mediaSubs}. Updating microphone if needed.`);
                    this.sendDebouncedMicrophoneStateChange(userSession.websocket, userSession, mediaSubs);

                    await sessionService.triggerAppStateChange(userSession.userId);
                    break;
                }

                case 'display_event': {
                    const currentSession = currentAppSessionId ? sessionService.getSession(currentAppSessionId.split('-')[0]) : null;
                    if (!currentSession) { ws.close(1008, 'No active session'); return; }
                    const displayMessage = message as DisplayRequest;
                    userSession = currentSession; // Update local reference
                    userSession.logger.info(`[websocket.service] Received display_event from ${message.packageName}`);
                    sessionService.updateDisplay(userSession.sessionId, displayMessage);
                    break;
                }

                default: {
                    logger.warn(`[${currentAppSessionId}] Received unhandled TPA message type: ${message.type}`);
                }
           }
       } catch (error) {
            const sessionForLog = userSession || (currentAppSessionId ? sessionService.getSession(currentAppSessionId.split('-')[0]) : null);
            logger.error(`[${currentAppSessionId || 'TPA'}] Error processing TPA message type ${message?.type}:`, error);
            this.sendError(ws, { type: CloudToTpaMessageType.CONNECTION_ERROR, message: `Error processing message type ${message?.type}`, timestamp: new Date() });
            PosthogService.trackEvent("error-handleTpaMessage", sessionForLog?.userId || "unknown", { sessionId: sessionForLog?.sessionId, error: error, timestamp: new Date().toISOString() });
       }
    });

    ws.on('ping', () => {
      if(currentAppSessionId) healthMonitorService.updateTpaActivity(ws);
      try { ws.pong(); } catch (error) { logger.error(`[${currentAppSessionId || 'TPA'}] Error sending pong:`, error); }
    });

    ws.on('close', () => {
      logger.info(`[websocket.service] TPA WebSocket disconnected: ${currentAppSessionId || remoteAddress}`);

      const sessionOnClose = userSession; // Capture current value
      if (currentAppSessionId && sessionOnClose) {
        const packageName = currentAppSessionId.split('-').slice(1).join('-');
        sessionOnClose.appConnections.delete(packageName);
        sessionOnClose.logger.info(`Removed TPA connection reference for ${packageName}.`);

        const mediaSubscriptions = sessionOnClose.subscriptionManager.hasMediaSubscriptions();
        if (!mediaSubscriptions && sessionOnClose.isTranscribing) {
           sessionOnClose.logger.info(`[websocket.service] Last TPA with media subscription (${packageName}) disconnected, disabling microphone.`);
           this.sendDebouncedMicrophoneStateChange(sessionOnClose.websocket, sessionOnClose, false);
        }
        tpaRegistrationService.handleTpaSessionEnd(currentAppSessionId);
         sessionService.triggerAppStateChange(sessionOnClose.userId);
      } else {
          logger.warn(`[websocket.service] TPA disconnected before initialization was complete or session was lost.`);
      }
    });

    ws.on('error', (error) => {
      logger.error(`[websocket.service] TPA WebSocket error: ${currentAppSessionId || remoteAddress}`, error);

      const sessionOnError = userSession; // Capture current value
      if (currentAppSessionId && sessionOnError) {
          const packageName = currentAppSessionId.split('-').slice(1).join('-');
          sessionOnError.appConnections.delete(packageName);
           sessionOnError.logger.info(`Cleaned up TPA connection reference for ${packageName} on error.`);
           sessionService.triggerAppStateChange(sessionOnError.userId);
           const mediaSubscriptions = sessionOnError.subscriptionManager.hasMediaSubscriptions();
            if (!mediaSubscriptions && sessionOnError.isTranscribing) {
                this.sendDebouncedMicrophoneStateChange(sessionOnError.websocket, sessionOnError, false);
            }
      }
      try { ws.close(); } catch(e) { /* Ignore */ }
    });
  }


  private async handleTpaInit(
    ws: WebSocket,
    initMessage: TpaConnectionInit,
    remoteAddress: string,
    setAppSessionInfo: (appSessionId: string, session: ExtendedUserSession) => void
  ): Promise<void> {

    const { sessionId: tpaSessionId, packageName, apiKey } = initMessage;
    logger.info(`[websocket.service] Handling TPA init for ${packageName}, requested session: ${tpaSessionId}`);

    if (!tpaSessionId || !tpaSessionId.includes('-')) {
        logger.error(`[websocket.service] Invalid TPA sessionId format: ${tpaSessionId}`);
        this.sendError(ws, { type: CloudToTpaMessageType.CONNECTION_ERROR, message: 'Invalid session ID format', timestamp: new Date() });
        ws.close(1008, 'Invalid session ID'); return;
    }

    const userSessionId = tpaSessionId.split('-')[0];
    const expectedPackageName = tpaSessionId.split('-').slice(1).join('-');

    if (packageName !== expectedPackageName) {
         logger.error(`[websocket.service] Mismatched packageName in init message ('${packageName}') vs sessionId ('${expectedPackageName}').`);
         this.sendError(ws, { type: CloudToTpaMessageType.CONNECTION_ERROR, message: 'Package name mismatch', timestamp: new Date() });
         ws.close(1008, 'Package name mismatch'); return;
    }

    const userSession = sessionService.getSession(userSessionId);

    if (!userSession) {
      logger.error(`[websocket.service] User session not found for ${userSessionId} during TPA init.`);
       this.sendError(ws, { type: CloudToTpaMessageType.CONNECTION_ERROR, message: 'User session not found', timestamp: new Date() });
      ws.close(1008, 'User session not found'); return;
    }

    // --- Validation ---
    const isValidKey = await appService.validateApiKey(packageName, apiKey, remoteAddress);
    if (!isValidKey) {
      userSession.logger.error(`[websocket.service] Invalid API key for TPA: ${packageName}`);
       this.sendError(ws, { type: CloudToTpaMessageType.CONNECTION_ERROR, message: 'Invalid API key', timestamp: new Date() });
      ws.close(1008, 'Invalid API key'); return;
    }
    userSession.logger.info(`[websocket.service] API Key validated for ${packageName}.`);

    const isSystemApp = Object.values(systemApps).some(app => app.packageName === packageName);
    if (!isSystemApp) {
        const isValidTpa = tpaRegistrationService.handleTpaSessionStart(initMessage);
        if (!isValidTpa) { userSession.logger.warn(`[websocket.service] Unregistered TPA attempting to connect: ${packageName}. Allowing for now.`); }
        else { userSession.logger.info(`[websocket.service] TPA registration validated for ${packageName}.`); }
    }

    const isLoading = userSession.loadingApps.has(packageName);
    const isActive = userSession.activeAppSessions.includes(packageName);
    if (!isSystemApp && !isLoading && !isActive) {
      userSession.logger.warn(`[websocket.service] TPA ${packageName} connected but was not in loading or active state.`);
    }

    // --- Validation Passed ---
    userSession.logger.info(`[websocket.service] TPA initialization validated for ${packageName} (Session: ${tpaSessionId})`);
    userSession.appConnections.set(packageName, ws);
    setAppSessionInfo(tpaSessionId, userSession); // Associate session info *after* validation

    if (isLoading) {
      userSession.loadingApps.delete(packageName);
       if (!userSession.activeAppSessions.includes(packageName)) {
          userSession.activeAppSessions.push(packageName);
       }
      userSession.logger.info(`[websocket.service] App ${packageName} moved from loading to active.`);
      userSession.displayManager.handleAppStop(packageName, userSession);
    }

    const ackMessage: TpaConnectionAck = {
      type: CloudToTpaMessageType.CONNECTION_ACK, sessionId: tpaSessionId, timestamp: new Date() };
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(ackMessage));
    else userSession.logger.warn("WS closed before TPA ACK could be sent");
    userSession.logger.info(`[websocket.service] Sent CONNECTION_ACK to TPA ${packageName}`);

    if (packageName === systemApps.dashboard.packageName) {
        try {
            const user = await User.findByEmail(userSession.userId);
            if (user?.location) {
                const locationData = { lat: user.location.lat, lng: user.location.lng }; // Ensure structure matches LocationUpdate data if needed
                const locationUpdate: LocationUpdate = {
                    type: GlassesToCloudMessageType.LOCATION_UPDATE, // Use correct type from SDK
                    sessionId: userSessionId, // Use user session ID for the data payload
                    lat: locationData.lat,
                    lng: locationData.lng,
                    timestamp: new Date() // Timestamp of sending cached data
                };
                 // Broadcast using LOCATION_UPDATE StreamType
                 if (Object.values(StreamType).includes(StreamType.LOCATION_UPDATE)) {
                    this.broadcastToTpa(userSession, StreamType.LOCATION_UPDATE, locationUpdate);
                    userSession.logger.info(`Sent cached location to dashboard ${packageName}`);
                 } else { userSession.logger.warn(`StreamType.LOCATION_UPDATE not defined.`); }
            }
        } catch (error) { userSession.logger.error(`Error sending cached data to dashboard:`, error); }
    }

    await sessionService.triggerAppStateChange(userSession.userId);

    const currentMediaSubs = userSession.subscriptionManager.hasMediaSubscriptions();
    this.sendDebouncedMicrophoneStateChange(userSession.websocket, userSession, currentMediaSubs);
  }


  private sendError(ws: WebSocket, error: ConnectionError | AuthError | TpaConnectionError): void {
    if(ws.readyState === WebSocket.OPEN){
        const messageType = 'type' in error && (error.type === CloudToTpaMessageType.CONNECTION_ERROR || error.type === CloudToGlassesMessageType.CONNECTION_ERROR)
                            ? error.type
                            : CloudToGlassesMessageType.CONNECTION_ERROR; // Default to glasses error type
        const errorMessage = {
          type: messageType,
          message: error.message || 'An unknown error occurred',
          timestamp: error.timestamp || new Date()
        };
       try{
            ws.send(JSON.stringify(errorMessage));
       } catch(e){
            logger.error(`[websocket.service] Failed to send error message:`, e)
       }
    } else {
         logger.warn(`[websocket.service] Tried to send error on non-open websocket (state: ${ws.readyState})`)
    }
  }
}

export const webSocketService = new WebSocketService();
logger.info('✅ WebSocket Service Initialized');
export default webSocketService;