/**
 * @fileoverview Core WebSocket service that initializes and manages WebSocket servers.
 * This service handles connection upgrade requests and routes them to the appropriate
 * specialized handlers for glasses clients and TPAs.
 */

import { Server } from 'http';
import WebSocket from 'ws';
import { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import { JwtPayload } from 'jsonwebtoken';
import { CloudToGlassesMessageType, ConnectionError } from '@augmentos/sdk';
import { GlassesWebSocketService } from './websocket-glasses.service';
import { TpaWebSocketService } from './websocket-tpa.service';
import { logger as rootLogger } from '../logging/pino-logger';

const logger = rootLogger.child({ service: 'websocket.service' });

// Environment variables
const AUGMENTOS_AUTH_JWT_SECRET = process.env.AUGMENTOS_AUTH_JWT_SECRET || "";

/**
 * Core WebSocket service that manages WebSocket server instances
 * and routes connections to the appropriate handlers
 */
export class WebSocketService {
  private glassesWss: WebSocket.Server;
  private tpaWss: WebSocket.Server;
  private glassesHandler: GlassesWebSocketService;
  private tpaHandler: TpaWebSocketService;
  private static instance: WebSocketService;

  /**
   * Private constructor to ensure singleton pattern
   */
  private constructor() {
    this.glassesWss = new WebSocket.Server({ noServer: true });
    this.tpaWss = new WebSocket.Server({ noServer: true });
    
    // Specialized handlers will be initialized later
    // when service dependencies are available
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  /**
   * Initialize service with dependencies
   * 
   * @param dependencies Service dependencies including specialized handlers
   */
  public initialize(glassesHandler: GlassesWebSocketService, tpaHandler: TpaWebSocketService): void {
    this.glassesHandler = glassesHandler;
    this.tpaHandler = tpaHandler;
    
    // Set up connection handlers
    this.glassesWss.on('connection', (ws, request) => {
      logger.info('New glasses WebSocket connection established');
      this.glassesHandler.handleConnection(ws, request).catch(error => {
        logger.error({
          error: {
            name: error.name,
            message: error.message,
            stack: error.stack
          }
        }, 'Error handling glasses connection');
      });
    });

    this.tpaWss.on('connection', (ws, request) => {
      logger.info('New TPA WebSocket connection established');
      this.tpaHandler.handleConnection(ws, request).catch(error => {
        logger.error({
          error: {
            name: error.name,
            message: error.message,
            stack: error.stack
          }
        }, 'Error handling TPA connection');
      });
    });
  }

  /**
   * Set up WebSocket servers and attach them to the HTTP server
   * 
   * @param server HTTP/HTTPS server instance
   */
  setupWebSocketServers(server: Server): void {
    server.on('upgrade', (request, socket, head) => {
      try {
        const url = new URL(request.url || '', `http://${request.headers.host}`);

        // Log detailed information about the upgrade request
        logger.debug({
          path: url.pathname,
          headers: {
            host: request.headers.host,
            origin: request.headers.origin,
            upgrade: request.headers.upgrade,
            connection: request.headers.connection,
            secWebSocketKey: request.headers['sec-websocket-key']?.substring(0, 10) + '...',
            secWebSocketVersion: request.headers['sec-websocket-version'],
            authorization: request.headers.authorization ? 'Present' : 'Missing'
          },
          remoteAddress: request.socket.remoteAddress
        }, 'WebSocket upgrade request received');

        // Route to appropriate handler based on path
        if (url.pathname === '/glasses-ws') {
          logger.debug('Processing glasses-ws upgrade request');
          
          try {
            // Extract JWT token from Authorization header for glasses
            const coreToken = request.headers.authorization?.split(' ')[1];
            if (!coreToken) {
              logger.error('No core token provided in request headers');
              socket.write(
                'HTTP/1.1 401 Unauthorized\r\n' +
                'Content-Type: application/json\r\n' +
                '\r\n' +
                JSON.stringify({
                  type: CloudToGlassesMessageType.CONNECTION_ERROR,
                  message: 'No core token provided',
                  timestamp: new Date()
                })
              );
              socket.destroy();
              return;
            }

            // Verify the JWT token
            try {
              const userData = jwt.verify(coreToken, AUGMENTOS_AUTH_JWT_SECRET);
              const userId = (userData as JwtPayload).email;
              if (!userId) {
                throw new Error('User ID is required');
              }

              // Attach the userId to the request for use by the handler
              (request as any).userId = userId;
              
              // If validation successful, proceed with connection
              this.glassesWss.handleUpgrade(request, socket, head, ws => {
                logger.debug('Glasses WebSocket upgrade successful');
                this.glassesWss.emit('connection', ws, request);
              });
            } catch (jwtError) {
              logger.error('Error verifying glasses JWT token:', jwtError);
              socket.write(
                'HTTP/1.1 401 Unauthorized\r\n' +
                'Content-Type: application/json\r\n' +
                '\r\n' +
                JSON.stringify({
                  type: CloudToGlassesMessageType.CONNECTION_ERROR,
                  message: 'Invalid core token',
                  timestamp: new Date()
                })
              );
              socket.destroy();
            }
          } catch (upgradeError) {
            logger.error({
              error: upgradeError
            }, 'Failed to upgrade glasses WebSocket connection');
            socket.destroy();
          }
        } else if (url.pathname === '/tpa-ws') {
          logger.debug('Processing tpa-ws upgrade request');
          
          try {
            // Check for JWT in Authorization header (new approach)
            const authHeader = request.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
              const tpaJwt = authHeader.substring(7);
              
              try {
                // Verify and extract JWT payload
                const payload = jwt.verify(tpaJwt, AUGMENTOS_AUTH_JWT_SECRET) as { 
                  packageName: string;
                  apiKey: string;
                };
                
                // Attach the payload to the request for use by the handler
                (request as any).tpaJwtPayload = payload;
                logger.debug(`TPA JWT authentication successful for ${payload.packageName}`);
              } catch (jwtError) {
                logger.error('Error verifying TPA JWT token:', jwtError);
                // Continue without failing - we'll let the handler deal with authentication
                // This maintains backward compatibility with message-based auth
              }
            }
            
            // Proceed with connection (authentication will be completed in the handler)
            this.tpaWss.handleUpgrade(request, socket, head, ws => {
              logger.debug('TPA WebSocket upgrade successful');
              this.tpaWss.emit('connection', ws, request);
            });
          } catch (upgradeError) {
            logger.error({
              error: upgradeError
            }, 'Failed to upgrade TPA WebSocket connection');
            socket.destroy();
          }
        } else {
          logger.debug({
            path: url.pathname
          }, 'Unknown WebSocket path, destroying socket');
          socket.destroy();
        }
      } catch (error) {
        logger.error({
          error,
          url: request.url
        }, 'Error in WebSocket upgrade handler');
        socket.destroy();
      }
    });
  }
}

// Export singleton instance
export const websocketService = WebSocketService.getInstance();
export default websocketService;