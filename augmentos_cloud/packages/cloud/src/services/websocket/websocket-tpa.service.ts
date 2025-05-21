/**
 * @fileoverview TPA WebSocket service that handles WebSocket connections from Third-Party Applications.
 * This service manages TPA authentication, message processing, and session management.
 */

import WebSocket from 'ws';
import { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import { 
  TpaConnectionInit, 
  TpaConnectionAck,
  TpaConnectionError,
  TpaToCloudMessage,
  TpaToCloudMessageType,
  CloudToTpaMessageType
} from '@augmentos/sdk';
import { ExtendedUserSession } from '../core/session.service';
import { SessionService } from '../core/session.service';
import appService from '../core/app.service';
import { tpaRegistrationService } from '../core/tpa-registration.service';
import { subscriptionService } from '../core/subscription.service';
import { logger as rootLogger } from '../logging/pino-logger';

const logger = rootLogger.child({ service: 'websocket-tpa.service' });

// Constants
const AUGMENTOS_AUTH_JWT_SECRET = process.env.AUGMENTOS_AUTH_JWT_SECRET || "";
const TPA_SESSION_TIMEOUT_MS = 5000;  // 5 seconds

/**
 * Error codes for TPA connection issues
 */
export enum TpaErrorCode {
  INVALID_JWT = 'INVALID_JWT',
  JWT_SIGNATURE_FAILED = 'JWT_SIGNATURE_FAILED',
  PACKAGE_NOT_FOUND = 'PACKAGE_NOT_FOUND',
  INVALID_API_KEY = 'INVALID_API_KEY',
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  MALFORMED_MESSAGE = 'MALFORMED_MESSAGE',
  INTERNAL_ERROR = 'INTERNAL_ERROR'
}

/**
 * JWT payload structure for TPA authentication
 */
interface TpaJwtPayload {
  packageName: string;
  apiKey: string;
}

/**
 * Service that handles TPA WebSocket connections
 */
export class TpaWebSocketService {
  private sessionService: SessionService;

  constructor(sessionService: SessionService) {
    this.sessionService = sessionService;
  }

  /**
   * Handle new TPA WebSocket connection
   * 
   * @param ws WebSocket connection
   * @param request HTTP request for the WebSocket upgrade
   */
  async handleConnection(ws: WebSocket, request: IncomingMessage): Promise<void> {
    logger.info({
      msg: 'New TPA attempting to connect...',
      headers: {
        origin: request.headers.origin,
        host: request.headers.host,
        userAgent: request.headers['user-agent']
      },
      remoteAddress: request.socket.remoteAddress
    });

    let currentAppSession: string | null = null;
    const setCurrentSessionId = (appSessionId: string) => {
      currentAppSession = appSessionId;
      logger.debug({ msg: 'TPA session ID set', sessionId: appSessionId });
    };
    let userSessionId = '';
    let userSession: ExtendedUserSession | null = null;

    // Add error handler to catch WebSocket errors
    ws.on('error', (wsError) => {
      logger.error({
        msg: 'WebSocket error in TPA connection',
        error: {
          name: wsError.name,
          message: wsError.message,
          stack: wsError.stack
        },
        sessionId: currentAppSession,
        userSessionId
      });
    });

    // Add close handler to track connection closures
    ws.on('close', (code, reason) => {
      logger.info({
        msg: 'TPA WebSocket connection closed',
        code,
        reason: reason.toString(),
        sessionId: currentAppSession,
        userSessionId
      });
    });

    // Handle JWT authentication here when we implement it
    // For now, we'll wait for the TpaConnectionInit message

    // Handle incoming messages
    ws.on('message', async (data: Buffer | string, isBinary: boolean) => {
      // Update activity timestamp if we have a user session
      if (userSession) {
        userSession.heartbeatManager.updateTpaActivity(ws);
      }

      if (isBinary) {
        logger.warn({
          binaryLength: data instanceof Buffer ? data.length : 'unknown',
          userSessionId,
          currentAppSession
        }, 'Received unexpected binary message from TPA');
        return;
      }

      try {
        // Log the raw message for debugging (truncated for safety)
        const messageStr = data.toString();
        logger.debug({
          dataLength: messageStr.length,
          dataSample: messageStr.length > 100 ? messageStr.substring(0, 100) + '...' : messageStr,
          userSessionId,
          currentAppSession
        }, 'Received TPA message data');

        let message: TpaToCloudMessage;
        try {
          message = JSON.parse(messageStr) as TpaToCloudMessage;
        } catch (parseError) {
          logger.error('Failed to parse TPA message', parseError);
          this.sendError(ws, TpaErrorCode.MALFORMED_MESSAGE, 'Failed to parse message JSON');
          return;
        }

        logger.debug({
          messageType: message.type,
          packageName: 'packageName' in message ? message.packageName : undefined,
          sessionId: message.sessionId
        }, 'Parsed TPA message');

        if (message.sessionId) {
          userSessionId = message.sessionId.split('-')[0];
          logger.debug({ userSessionId }, 'Extracted user session ID');

          userSession = this.sessionService.getSession(userSessionId);

          if (userSession) {
            logger.debug({
              userId: userSession.userId,
              sessionId: userSession.sessionId
            }, 'Retrieved user session');
          } else {
            logger.warn({
              userSessionId,
              messageSessionId: message.sessionId
            }, 'User session not found');
          }
        }

        // Handle TPA messages
        try {
          switch (message.type) {
            case TpaToCloudMessageType.CONNECTION_INIT:
              const initMessage = message as TpaConnectionInit;
              logger.info({
                msg: 'TPA connection initialization received',
                packageName: initMessage.packageName,
                sessionId: initMessage.sessionId
              });

              try {
                await this.handleTpaInit(ws, initMessage, setCurrentSessionId);
                logger.info({
                  msg: 'TPA connection initialized successfully',
                  packageName: initMessage.packageName,
                  sessionId: initMessage.sessionId
                });
              } catch (initError) {
                logger.error({
                  msg: 'Failed to initialize TPA connection',
                  error: initError,
                  packageName: initMessage.packageName,
                  sessionId: initMessage.sessionId
                });
                throw initError; // Re-throw to propagate to client
              }
              break;

            case TpaToCloudMessageType.SUBSCRIPTION_UPDATE:
              if (!userSession || !userSessionId) {
                logger.error(`User session not found for ${userSessionId}`);
                this.sendError(ws, TpaErrorCode.SESSION_NOT_FOUND, 'No active session');
                return;
              }

              // Handle subscription update
              // This would call the subscription service
              break;

            // ... other message type handlers would go here ...
            
            default:
              logger.warn(`Unhandled TPA message type: ${message.type}`);
              break;
          }
        } catch (error) {
          logger.error('Error handling TPA message', error);
          // Decide how to handle the error based on message type
          if (message.type === TpaToCloudMessageType.CONNECTION_INIT) {
            // For connection init, we close the connection with appropriate error
            this.sendError(ws, TpaErrorCode.INTERNAL_ERROR, 'Error processing connection request');
          }
        }
      } catch (error) {
        logger.error('Unexpected error processing TPA message', error);
        // General error handling when we can't even parse the message
        ws.close(1011, 'Internal server error');
      }
    });
  }

  /**
   * Handle TPA connection initialization
   * 
   * @param ws WebSocket connection
   * @param initMessage Connection initialization message
   * @param setSessionId Callback to set the session ID
   */
  private async handleTpaInit(
    ws: WebSocket, 
    initMessage: TpaConnectionInit,
    setSessionId: (sessionId: string) => void
  ): Promise<void> {
    logger.info(`TPA connection init: ${initMessage.packageName}`);
    
    // Parse session ID to get user session ID
    const sessionParts = initMessage.sessionId.split('-');
    if (sessionParts.length !== 2) {
      logger.error(`Invalid session ID format: ${initMessage.sessionId}`);
      ws.close(1008, 'Invalid session ID format');
      return;
    }
    
    const userSessionId = sessionParts[0];
    const packageName = initMessage.packageName;
    
    // Get user session
    const userSession = this.sessionService.getSession(userSessionId);
    if (!userSession) {
      logger.error(`User session not found: ${userSessionId}`);
      this.sendError(ws, TpaErrorCode.SESSION_NOT_FOUND, 'Session not found');
      return;
    }
    
    // Check if app is in loading state
    if (!userSession.loadingApps.has(packageName) && !userSession.activeAppSessions.includes(packageName)) {
      logger.error(`App ${packageName} not in loading or active state for session ${userSessionId}`);
      ws.close(1008, 'App not started for this session');
      return;
    }
    
    // Get client IP address for system app validation
    const clientIp = (ws as any)._socket?.remoteAddress || '';
    userSession.logger.info(`TPA connection from IP: ${clientIp}`);
    
    // Validate API key with IP check for system apps
    const isValidKey = await appService.validateApiKey(
      initMessage.packageName,
      initMessage.apiKey,
      clientIp
    );
    
    if (!isValidKey) {
      userSession.logger.error(`Invalid API key for package: ${packageName}`);
      this.sendError(ws, TpaErrorCode.INVALID_API_KEY, 'Invalid API key');
      return;
    }
    
    // Store the connection in the user session
    userSession.appConnections.set(packageName, ws);
    setSessionId(initMessage.sessionId);
    
    // Register this session with the TPA server registry if available
    tpaRegistrationService.handleTpaSessionStart(initMessage);
    
    // Send acknowledgment with settings
    const settings = await this.sessionService.getAppSettings(userSession.userId, packageName);
    const ackMessage: TpaConnectionAck = {
      type: CloudToTpaMessageType.CONNECTION_ACK,
      settings,
      timestamp: new Date()
    };
    ws.send(JSON.stringify(ackMessage));
    
    // Remove from loading apps if it's there
    userSession.loadingApps.delete(packageName);
    userSession.logger.info(`TPA connection established for ${packageName}`);
  }

  /**
   * Send an error response to the TPA client
   * 
   * @param ws WebSocket connection
   * @param code Error code
   * @param message Error message
   */
  private sendError(ws: WebSocket, code: TpaErrorCode, message: string): void {
    try {
      const errorResponse: TpaConnectionError = {
        type: CloudToTpaMessageType.CONNECTION_ERROR,
        code: code,
        message: message,
        timestamp: new Date()
      };
      ws.send(JSON.stringify(errorResponse));
      // Close the connection with an appropriate code
      ws.close(1008, message);
    } catch (error) {
      logger.error('Failed to send error response', error);
      // Try to close the connection anyway
      try {
        ws.close(1011, 'Internal server error');
      } catch (closeError) {
        logger.error('Failed to close WebSocket connection', closeError);
      }
    }
  }

  /**
   * Validate a JWT token for TPA authentication
   * This will be used when JWT authentication is implemented
   * 
   * @param token JWT token
   * @returns Decoded JWT payload if valid
   * @throws Error if token is invalid
   */
  private validateJwtToken(token: string): TpaJwtPayload {
    try {
      // Verify the token
      const payload = jwt.verify(token, AUGMENTOS_AUTH_JWT_SECRET) as TpaJwtPayload;
      
      // Validate required fields
      if (!payload.packageName || !payload.apiKey) {
        throw new Error('Missing required fields in JWT payload');
      }
      
      return payload;
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw new Error(`JWT validation failed: ${error.message}`);
      }
      throw error;
    }
  }
}