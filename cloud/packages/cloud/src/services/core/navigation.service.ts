import { User, UserI } from '../../models/user.model';
import { sessionService } from '../session/session.service';
import UserSession from '../session/UserSession';
import { logger as rootLogger } from '../logging/pino-logger';
import WebSocket from 'ws';
import { 
  CloudToGlassesMessageType, 
  NavigationUpdate, 
  NavigationStatus,
  StartNavigation,
  StopNavigation, 
  UpdateNavigationRoute,
  DataStream,
  CloudToAppMessageType,
  StreamType 
} from '@mentra/sdk';

const logger = rootLogger.child({ service: 'navigation.service' });

// current navigation state for each user session
interface NavigationState {
  status: "idle" | "planning" | "navigating" | "rerouting" | "finished" | "error";
  destination?: string;
  errorMessage?: string;
  startTime?: Date;
  lastUpdate?: Date;
}

/**
 * Navigation Service handles navigation commands from apps and navigation data from mobile devices.
 * Unlike other services, this focuses on real-time state management rather than caching.
 */
class NavigationService {
  private navigationStates = new Map<string, NavigationState>(); // sessionId -> NavigationState
  private pendingCommands = new Map<string, string>(); // requestId -> sessionId for tracking commands

  /**
   * Handle start navigation request from an app
   */
  public async handleStartNavigationRequest(
    userSession: UserSession, 
    packageName: string,
    destination: string,
    mode?: string,
    requestId?: string
  ): Promise<void> {
    const { userId } = userSession;
    const commandRequestId = requestId || this.generateRequestId();
    
    logger.info({ 
      userId, 
      packageName, 
      destination, 
      mode,
      requestId: commandRequestId 
    }, "Handling start navigation request from app");

    // track this command
    this.pendingCommands.set(commandRequestId, userSession.sessionId);

    // update local state to "planning"
    this.updateNavigationState(userSession.sessionId, {
      status: "planning",
      destination,
      startTime: new Date(),
      lastUpdate: new Date()
    });

    // send command to mobile device
    if (userSession.websocket && userSession.websocket.readyState === WebSocket.OPEN) {
      this.sendCommandToDevice(
        userSession.websocket, 
        CloudToGlassesMessageType.START_NAVIGATION,
        {
          destination,
          mode: mode || "driving",
          requestId: commandRequestId
        }
      );
    } else {
      logger.warn({ userId }, "User session or WebSocket not available to send start navigation command");
      
      // update state to error since we can't send the command
      this.updateNavigationState(userSession.sessionId, {
        status: "error",
        errorMessage: "Unable to communicate with device",
        lastUpdate: new Date()
      });
    }
  }

  /**
   * Handle stop navigation request from an app  
   */
  public async handleStopNavigationRequest(
    userSession: UserSession,
    packageName: string,
    requestId?: string
  ): Promise<void> {
    const { userId } = userSession;
    const commandRequestId = requestId || this.generateRequestId();

    logger.info({ 
      userId, 
      packageName,
      requestId: commandRequestId 
    }, "Handling stop navigation request from app");

    // track this command
    this.pendingCommands.set(commandRequestId, userSession.sessionId);

    // send command to mobile device
    if (userSession.websocket && userSession.websocket.readyState === WebSocket.OPEN) {
      this.sendCommandToDevice(
        userSession.websocket,
        CloudToGlassesMessageType.STOP_NAVIGATION,
        { requestId: commandRequestId }
      );
    } else {
      logger.warn({ userId }, "User session or WebSocket not available to send stop navigation command");
    }
  }

  /**
   * Handle update navigation route preferences from an app
   */
  public async handleUpdateNavigationRoute(
    userSession: UserSession,
    packageName: string,
    avoidTolls?: boolean,
    avoidHighways?: boolean,
    requestId?: string
  ): Promise<void> {
    const { userId } = userSession;
    const commandRequestId = requestId || this.generateRequestId();

    logger.info({ 
      userId, 
      packageName,
      avoidTolls,
      avoidHighways,
      requestId: commandRequestId 
    }, "Handling update navigation route request from app");

    // track this command
    this.pendingCommands.set(commandRequestId, userSession.sessionId);

    // send command to mobile device
    if (userSession.websocket && userSession.websocket.readyState === WebSocket.OPEN) {
      this.sendCommandToDevice(
        userSession.websocket,
        CloudToGlassesMessageType.UPDATE_NAVIGATION_ROUTE,
        {
          avoidTolls,
          avoidHighways,
          requestId: commandRequestId
        }
      );
    } else {
      logger.warn({ userId }, "User session or WebSocket not available to send update navigation route command");
    }
  }

  /**
   * Handle incoming navigation update from mobile device
   */
  public async handleDeviceNavigationUpdate(
    userSession: UserSession, 
    navigationUpdate: NavigationUpdate
  ): Promise<void> {
    const { userId } = userSession;

    logger.debug({ 
      userId, 
      instruction: navigationUpdate.instruction,
      distanceRemaining: navigationUpdate.distanceRemaining,
      timeRemaining: navigationUpdate.timeRemaining 
    }, "Received navigation update from device");

    // update our state to show we're actively navigating
    this.updateNavigationState(userSession.sessionId, {
      status: "navigating",
      lastUpdate: new Date()
    });

    // relay to subscribed apps - no need to cache, just stream it
    sessionService.relayMessageToApps(userSession, navigationUpdate);
  }

  /**
   * Handle incoming navigation status from mobile device
   */
  public async handleDeviceNavigationStatus(
    userSession: UserSession,
    navigationStatus: NavigationStatus  
  ): Promise<void> {
    const { userId } = userSession;

    logger.info({ 
      userId, 
      status: navigationStatus.status,
      destination: navigationStatus.destination,
      errorMessage: navigationStatus.errorMessage
    }, "Received navigation status from device");

    // update our internal state
    this.updateNavigationState(userSession.sessionId, {
      status: navigationStatus.status,
      destination: navigationStatus.destination,
      errorMessage: navigationStatus.errorMessage,
      lastUpdate: new Date()
    });

    // relay to subscribed apps
    sessionService.relayMessageToApps(userSession, navigationStatus);
  }

  /**
   * Get current navigation state for a session (for apps that just connected)
   */
  public getCurrentNavigationState(sessionId: string): NavigationState {
    return this.navigationStates.get(sessionId) || { 
      status: "idle",
      lastUpdate: new Date()
    };
  }

  /**
   * Send current navigation state to a specific app (when they subscribe)
   */
  public sendCurrentStateToApp(userSession: UserSession, packageName: string): void {
    const currentState = this.getCurrentNavigationState(userSession.sessionId);
    
    // only send if there's an active navigation session
    if (currentState.status !== "idle") {
      const appWs = userSession.appWebsockets.get(packageName);
      if (appWs && appWs.readyState === WebSocket.OPEN) {
        const statusMessage: DataStream = {
          type: CloudToAppMessageType.DATA_STREAM,
          sessionId: `${userSession.sessionId}-${packageName}`,
          streamType: StreamType.NAVIGATION_STATUS,
          data: {
            type: StreamType.NAVIGATION_STATUS,
            status: currentState.status,
            destination: currentState.destination,
            errorMessage: currentState.errorMessage,
            timestamp: currentState.lastUpdate || new Date()
          },
          timestamp: new Date()
        };
        
        appWs.send(JSON.stringify(statusMessage));
        logger.info({ 
          userId: userSession.userId, 
          packageName, 
          status: currentState.status 
        }, "Sent current navigation state to newly subscribed app");
      }
    }
  }

  /**
   * Clean up navigation state when session ends
   */
  public cleanupNavigationState(sessionId: string): void {
    this.navigationStates.delete(sessionId);
    
    // clean up any pending commands for this session
    for (const [requestId, reqSessionId] of this.pendingCommands.entries()) {
      if (reqSessionId === sessionId) {
        this.pendingCommands.delete(requestId);
      }
    }
    
    logger.info({ sessionId }, "Cleaned up navigation state for session");
  }

  /**
   * Update navigation state for a session
   * @private
   */
  private updateNavigationState(sessionId: string, updates: Partial<NavigationState>): void {
    const currentState = this.navigationStates.get(sessionId) || { status: "idle" };
    const newState = { ...currentState, ...updates };
    this.navigationStates.set(sessionId, newState);
    
    logger.debug({ 
      sessionId, 
      previousStatus: currentState.status, 
      newStatus: newState.status 
    }, "Updated navigation state");
  }

  /**
   * Send command to mobile device
   * @private
   */
  private sendCommandToDevice(
    ws: WebSocket, 
    type: CloudToGlassesMessageType, 
    payload: any
  ): void {
    try {
      let message: StartNavigation | StopNavigation | UpdateNavigationRoute;

      switch (type) {
        case CloudToGlassesMessageType.START_NAVIGATION:
          message = {
            type: CloudToGlassesMessageType.START_NAVIGATION,
            destination: payload.destination,
            mode: payload.mode,
            requestId: payload.requestId,
            timestamp: new Date()
          };
          break;
        case CloudToGlassesMessageType.STOP_NAVIGATION:
          message = {
            type: CloudToGlassesMessageType.STOP_NAVIGATION,
            requestId: payload.requestId,
            timestamp: new Date()
          };
          break;
        case CloudToGlassesMessageType.UPDATE_NAVIGATION_ROUTE:
          message = {
            type: CloudToGlassesMessageType.UPDATE_NAVIGATION_ROUTE,
            avoidTolls: payload.avoidTolls,
            avoidHighways: payload.avoidHighways,
            requestId: payload.requestId,
            timestamp: new Date()
          };
          break;
        default:
          logger.error({ type }, "Attempted to send unknown navigation command type to device");
          return;
      }

      ws.send(JSON.stringify(message));
      logger.info({ type, payload }, "Successfully sent navigation command to device");
    } catch (error) {
      logger.error({ error, type }, "Failed to send navigation command to device");
    }
  }

  /**
   * Generate a unique request ID for tracking commands
   * @private  
   */
  private generateRequestId(): string {
    return `nav_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const navigationService = new NavigationService();
logger.info("Navigation Service initialized.");