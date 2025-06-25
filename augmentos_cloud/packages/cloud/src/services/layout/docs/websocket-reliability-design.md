# WebSocket Reliability Design Document

## Overview

This document details the current WebSocket reliability design and App session lifecycle in the MentraOS cloud system. It covers how Apps connect, maintain connections, and recover from disconnections.

## Current App Session Lifecycle

### Session Start Flow
1. **User Request**:
   - User initiates App start request
   - Cloud checks if app is already loading/running
   - If not, adds app to `loadingApps` set

2. **Webhook Trigger**:
   - Cloud triggers App's webhook with session info:
     ```typescript
     {
       type: WebhookRequestType.SESSION_REQUEST,
       sessionId: userSessionId + '-' + packageName,
       userId: userSession.userId,
       timestamp: new Date().toISOString(),
       augmentOSWebsocketUrl: serverUrl
     }
     ```
   - Sets timeout for cleanup if App doesn't connect

3. **App Connection**:
   - App receives webhook and creates `AppSession`
   - App connects to cloud WebSocket
   - Sends `AppConnectionInit` message with:
     - Session ID
     - Package name
     - API key
     - User ID

4. **Connection Validation**:
   - Cloud validates API key and IP
   - Registers App with server registry
   - Moves app from `loadingApps` to `activeAppSessions`
   - Stores WebSocket connection

### Session Management
1. **State Tracking**:
   ```typescript
   interface UserSession {
     sessionId: string;
     userId: string;
     activeAppSessions: string[];
     loadingApps: Set<string>;
     appConnections: Map<string, WebSocket>;
     displayManager: DisplayManager;
   }
   ```

2. **Server Registration**:
   ```typescript
   interface AppServerRegistration {
     registrationId: string;
     packageName: string;
     apiKey: string;
     webhookUrl: string;
     serverUrls: string[];
     activeSessions: string[];
   }
   ```

3. **Health Monitoring**:
   - Cloud tracks connection health via `HealthMonitorService`
   - Monitors last seen timestamps
   - Handles ping/pong for connection liveness
   - Cleans up stale connections

### Session End Flow
1. **User Stop Request**:
   - User requests to stop App
   - Cloud removes app from active sessions
   - Triggers stop webhook to App
   - Closes WebSocket connection
   - Cleans up subscriptions and display state

2. **App Disconnection**:
   - If App disconnects unexpectedly:
     - Cloud marks session as disconnected
     - Keeps session in registry for recovery
     - Cleans up WebSocket and subscriptions
     - Notifies dashboard manager

3. **Session Recovery**:
   - App can reconnect using same session ID
   - Cloud validates reconnection
   - Restores previous state and subscriptions
   - If App server restarts, can recover sessions via registration

### Dashboard Integration
1. **System App**:
   - Dashboard is a special system App
   - Always started when user connects
   - Manages always-on display and notifications
   - Handles layout and content for other Apps

2. **Event Handling**:
   ```typescript
   session.events.on('connected', () => {
     // Subscribe to necessary streams
     session.subscribe(StreamType.PHONE_NOTIFICATION);
     session.subscribe(StreamType.LOCATION_UPDATE);
     session.subscribe(StreamType.HEAD_POSITION);
     session.subscribe(StreamType.GLASSES_BATTERY_UPDATE);
     session.subscribe(StreamType.CALENDAR_EVENT);
   });
   ```

3. **Content Management**:
   - Handles App display requests
   - Manages content sections
   - Coordinates with layout manager
   - Handles App disconnection cleanup

## Current System Operation

### 1. WebSocket Connection Management
- Cloud maintains two WebSocket servers:
  - `glassesWss`: For glasses client connections
  - `appWss`: For App connections

### 2. Connection Health Monitoring
```typescript
class HealthMonitorService {
  private glassesLastSeen: Map<WebSocket, number> = new Map();
  private appLastSeen: Map<WebSocket, number> = new Map();

  registerGlassesConnection(ws: WebSocket): void {
    this.glassesLastSeen.set(ws, Date.now());
    ws.on('pong', () => {
      this.glassesLastSeen.set(ws, Date.now());
    });
  }

  registerAppConnection(ws: WebSocket): void {
    this.appLastSeen.set(ws, Date.now());
    ws.on('pong', () => {
      this.appLastSeen.set(ws, Date.now());
    });
  }
}
```

### 3. Session Recovery
```typescript
class AppRegistrationService {
  async handleAppServerRestart(registrationId: string): Promise<number> {
    const registration = this.getRegistration(registrationId);
    if (!registration) return 0;

    let recoveredCount = 0;
    for (const appSessionId of registration.activeSessions) {
      try {
        const [userSessionId, packageName] = appSessionId.split('-');
        const userSession = sessionService.getSession(userSessionId);

        if (!userSession || !userSession.activeAppSessions.includes(packageName)) {
          continue;
        }

        // Trigger App's webhook to restart session
        await appService.triggerWebhook(registration.webhookUrl, {
          type: WebhookRequestType.SESSION_REQUEST,
          sessionId: appSessionId,
          userId: userSession.userId,
          timestamp: new Date().toISOString(),
          augmentOSWebsocketUrl: this.determineServerUrl(registration, userSession),
        });

        recoveredCount++;
      } catch (error) {
        logger.error(`Error recovering session ${appSessionId}:`, error);
      }
    }

    return recoveredCount;
  }
}
```

### 4. Error Handling
```typescript
ws.on('error', (error) => {
  logger.error('[websocket.service]: App WebSocket error:', error);
  if (currentAppSession) {
    const userSessionId = currentAppSession.split('-')[0];
    const packageName = currentAppSession.split('-')[1];
    const userSession = sessionService.getSession(userSessionId);

    if (userSession) {
      // Clean up connection
      userSession.appConnections.delete(packageName);
      subscriptionService.removeSubscriptions(userSession, packageName);

      // Clean up dashboard content
      dashboardService.handleAppDisconnected(packageName, userSession);

      userSession.logger.info(`[websocket.service]: App session ${currentAppSession} disconnected`);
    }
  }
  ws.close();
});
```

## Core Services

### 1. WebSocket Service
```typescript
class WebSocketService {
  private glassesWss: WebSocketServer;
  private appWss: WebSocketServer;
  private healthMonitor: HealthMonitorService;

  constructor() {
    this.glassesWss = new WebSocketServer({ port: GLASSES_WS_PORT });
    this.appWss = new WebSocketServer({ port: APP_WS_PORT });
    this.healthMonitor = new HealthMonitorService();

    this.setupGlassesServer();
    this.setupAppServer();
  }

  private setupGlassesServer(): void {
    this.glassesWss.on('connection', (ws: WebSocket) => {
      this.healthMonitor.registerGlassesConnection(ws);

      ws.on('message', (data: string) => {
        const message = JSON.parse(data);
        this.handleGlassesMessage(ws, message);
      });

      ws.on('close', () => {
        this.handleGlassesDisconnect(ws);
      });
    });
  }

  private setupAppServer(): void {
    this.appWss.on('connection', (ws: WebSocket) => {
      this.healthMonitor.registerAppConnection(ws);

      ws.on('message', (data: string) => {
        const message = JSON.parse(data);
        this.handleAppMessage(ws, message);
      });

      ws.on('close', () => {
        this.handleAppDisconnect(ws);
      });
    });
  }
}
```

### 2. Session Service
```typescript
class SessionService {
  private sessions: Map<string, UserSession> = new Map();

  createSession(userId: string): UserSession {
    const sessionId = generateSessionId();
    const session = new UserSession(sessionId, userId);
    this.sessions.set(sessionId, session);
    return session;
  }

  getSession(sessionId: string): UserSession | undefined {
    return this.sessions.get(sessionId);
  }

  removeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      // Clean up all App connections
      for (const [packageName, ws] of session.appConnections) {
        ws.close();
        session.appConnections.delete(packageName);
      }

      // Clean up subscriptions
      subscriptionService.removeAllSubscriptions(session);

      // Remove session
      this.sessions.delete(sessionId);
    }
  }
}
```

## User Session States

### 1. Session Lifecycle States
```typescript
enum SessionState {
  INITIALIZING = 'INITIALIZING',    // Session being created
  CONNECTING = 'CONNECTING',        // Glasses client connecting
  CONNECTED = 'CONNECTED',          // Glasses client connected
  DISCONNECTING = 'DISCONNECTING',  // Graceful shutdown
  DISCONNECTED = 'DISCONNECTED',    // Session ended
  ERROR = 'ERROR'                   // Error state
}
```

### 2. App States
```typescript
enum AppState {
  LOADING = 'LOADING',           // App being started
  CONNECTING = 'CONNECTING',     // App connecting to cloud
  CONNECTED = 'CONNECTED',       // App connected and running
  DISCONNECTED = 'DISCONNECTED', // App disconnected
  ERROR = 'ERROR'                // App in error state
}
```

### 3. User Session Data Structure
```typescript
interface UserSession {
  // Core session data
  sessionId: string;
  userId: string;
  state: SessionState;
  createdAt: Date;
  lastActive: Date;

  // Connection tracking
  glassesConnection?: WebSocket;
  appConnections: Map<string, WebSocket>;

  // App state tracking
  activeAppSessions: string[];      // List of running Apps
  loadingApps: Set<string>;         // Apps in loading state
  appStates: Map<string, AppState>; // Current state of each App

  // Subscription management
  subscriptions: Map<string, Set<StreamType>>;

  // Display management
  displayManager: DisplayManager;

  // Logging
  logger: Logger;
}
```

### 4. State Transitions

#### Glasses Client States
1. **INITIALIZING → CONNECTING**
   - When glasses client initiates connection
   - Cloud creates new session
   - Starts dashboard App

2. **CONNECTING → CONNECTED**
   - Glasses client successfully connects
   - WebSocket connection established
   - Dashboard App ready

3. **CONNECTED → DISCONNECTING**
   - User logs out or connection closing
   - Clean up all App connections
   - Stop all active Apps

4. **DISCONNECTING → DISCONNECTED**
   - All cleanup complete
   - Session removed from registry
   - Resources released

#### App States
1. **LOADING → CONNECTING**
   - App start requested
   - Added to loadingApps
   - Webhook triggered

2. **CONNECTING → CONNECTED**
   - App connects to cloud
   - Validates connection
   - Added to activeAppSessions

3. **CONNECTED → DISCONNECTED**
   - Connection lost
   - Clean up resources
   - Update dashboard

4. **Any State → ERROR**
   - Error occurs
   - Log error
   - Attempt recovery

### 5. State Recovery
```typescript
class SessionRecoveryService {
  async recoverSession(sessionId: string): Promise<boolean> {
    const session = sessionService.getSession(sessionId);
    if (!session) return false;

    // Recover glasses connection
    if (session.state === SessionState.DISCONNECTED) {
      await this.recoverGlassesConnection(session);
    }

    // Recover App connections
    for (const packageName of session.activeAppSessions) {
      const appState = session.appStates.get(packageName);
      if (appState === AppState.DISCONNECTED) {
        await this.recoverAppConnection(session, packageName);
      }
    }

    return true;
  }
}
```

## Current Challenges

1. **Connection Stability**:
   - WebSocket connections can drop unexpectedly
   - Need better reconnection handling
   - Session state recovery can be incomplete

2. **Session Management**:
   - Complex state tracking across multiple services
   - Potential race conditions in session recovery
   - Incomplete cleanup on disconnection

3. **Error Handling**:
   - Some error cases not properly handled
   - Inconsistent error recovery
   - Missing error logging in some cases

4. **Health Monitoring**:
   - Basic ping/pong mechanism
   - No proactive connection health checks
   - Limited monitoring metrics

## Next Steps

1. **Connection Reliability**:
   - Implement robust reconnection logic
   - Add connection state tracking
   - Improve session recovery

2. **Error Handling**:
   - Standardize error handling
   - Add comprehensive error logging
   - Implement better recovery mechanisms

3. **Monitoring**:
   - Add detailed connection metrics
   - Implement proactive health checks
   - Improve monitoring dashboard

4. **Testing**:
   - Add connection reliability tests
   - Test session recovery scenarios
   - Verify error handling