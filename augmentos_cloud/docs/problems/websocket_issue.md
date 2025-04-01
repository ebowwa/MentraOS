Based on my research, I'll create a design document for the WebSocket ping/pong heartbeat mechanism. Let me organize the information.

  WebSocket Connection Heartbeat System: Design Document

  1. Current Implementation

  1.1 Overview

  AugmentOS Cloud currently implements a Connection Health Monitoring system that uses WebSocket ping/pong messages to verify connection liveness
   between:
  - Cloud ↔ Smart glasses clients
  - Cloud ↔ TPA (Third-Party App) servers

  1.2 Key Components

  1. Health Monitor Service
    - Maintains registries of active connections
    - Sends periodic ping frames (every 15 seconds)
    - Tracks last activity timestamps for each connection
    - Terminates connections that don't show activity for 45 seconds
  2. WebSocket Integration
    - Registers new connections with the health monitor
    - Updates activity timestamps on any message or pong event
    - WebSocket connections have event handlers for ping/pong events
  3. Configuration Parameters
    - HEARTBEAT_INTERVAL_MS: 15000ms (15 seconds)
    - CONNECTION_TIMEOUT_MS: 45000ms (45 seconds)
    - STATS_INTERVAL_MS: 60000ms (60 seconds)

  1.3 Current Process Flow

  1. When a new WebSocket connection is established:
    - It is registered with the health monitor service
    - Ping/pong event handlers are set up
    - Initial activity timestamp is recorded
  2. Periodically (every 15 seconds):
    - Health monitor sends ping frames to all connections
    - Connections respond with pong frames (WebSocket protocol)
    - Activity timestamps are updated when pongs are received
  3. During normal operation:
    - Any message activity updates the last seen timestamp
    - Pong responses update the last seen timestamp
  4. Timeout detection (every 15 seconds):
    - Check if any connection hasn't had activity for 45 seconds
    - Terminate connections that exceed the timeout threshold

  2. Problem Statement

  While the current system handles connections between Cloud and clients (smart glasses and TPAs), the following issues remain:

  1. Unidirectional Monitoring: The current system only monitors connections from the cloud server's perspective. It doesn't ensure that the TPA
  server knows if the cloud connection is still alive.
  2. Passive Client Detection: TPAs only learn about disconnections passively when they try to send messages and fail, rather than proactively
  detecting stale connections.
  3. No Application-Level Heartbeat: The current system relies only on WebSocket protocol-level ping/pong. There's no application-level heartbeat
   message that carries additional context.
  4. Timeout Too Long: The current 45-second timeout might allow zombie connections to persist too long, leading to resource wastage and
  unexpected behavior.
  5. No Explicit Reconnection: TPAs that lose connection have no standardized way to know when and how to reconnect.
  6. Limited TPA Status Feedback: The cloud has limited visibility into TPA server operational health beyond the WebSocket connection state.

  3. Proposed Solution

  3.1 Enhanced Bidirectional Heartbeat System

  We propose enhancing the existing Connection Health Monitoring system with the following key improvements:

  1. Bidirectional Application-Level Heartbeat
    - Implement application-level heartbeat messages between Cloud and TPAs
    - Add explicit PING/PONG message types to TPA message protocol
    - Include timestamps and operational metadata in heartbeat messages
  2. Explicit Client-Side Monitoring
    - TPAs proactively monitor connection health and detect stale connections
    - Client-side heartbeat timers detect when the server hasn't responded
    - Structured reconnection logic for TPA clients
  3. Optimized Timing Parameters
    - Reduce timeout threshold to 60 seconds (instead of current 45 seconds for WebSocket-level timeout)
    - Ensure heartbeat interval of 15 seconds to balance responsiveness and overhead
  4. Enhanced Status Reporting
    - Include operational metrics in heartbeat messages
    - Report TPA processing status back to the cloud
    - Allow cloud to flag connection quality issues to TPAs

  3.2 Message Types

  Add new message types to the protocol:

  1. Cloud to TPA:
  // New message type for Cloud → TPA
  export enum CloudToTpaMessageType {
    // Existing types...

    // New heartbeat types
    HEARTBEAT_PING = 'heartbeat_ping',
    HEARTBEAT_PONG = 'heartbeat_pong',
  }

  // Heartbeat ping message format
  interface HeartbeatPing {
    type: CloudToTpaMessageType.HEARTBEAT_PING;
    timestamp: Date;
    sessionId: string;
    // Optional status information
    serverStatus?: {
      load: number;           // Server load indicator (0-1)
      activeConnections: number;  // Number of active connections
    };
  }

  // Heartbeat pong message format
  interface HeartbeatPong {
    type: CloudToTpaMessageType.HEARTBEAT_PONG;
    timestamp: Date;
    sessionId: string;
    // Response to ping
    respondingTo: Date;  // Timestamp of the ping being responded to
  }

  2. TPA to Cloud:
  // New message type for TPA → Cloud
  export enum TpaToCloudMessageType {
    // Existing types...

    // New heartbeat types
    HEARTBEAT_PING = 'heartbeat_ping',
    HEARTBEAT_PONG = 'heartbeat_pong',
  }

  // Heartbeat ping message format (from TPA to Cloud)
  interface TpaHeartbeatPing {
    type: TpaToCloudMessageType.HEARTBEAT_PING;
    timestamp: Date;
    sessionId: string;
    packageName: string;
    // Optional status information
    clientStatus?: {
      processing: boolean;      // Whether the TPA is actively processing data
      subscriptionCount: number; // Number of active subscriptions
    };
  }

  // Heartbeat pong message format (from TPA to Cloud)
  interface TpaHeartbeatPong {
    type: TpaToCloudMessageType.HEARTBEAT_PONG;
    timestamp: Date;
    sessionId: string;
    packageName: string;
    // Response to ping
    respondingTo: Date;  // Timestamp of the ping being responded to
  }

  3.3 Implementation Details

  3.3.1 Cloud Server Implementation

  1. Enhanced Health Monitor Service:
  // Configuration parameters
  const HEARTBEAT_INTERVAL_MS = 15000;      // 15 seconds
  const APP_LEVEL_PING_INTERVAL_MS = 30000; // 30 seconds
  const CONNECTION_TIMEOUT_MS = 60000;      // 60 seconds
  const STATS_INTERVAL_MS = 60000;          // 1 minute

  class HealthMonitorService {
    // Existing WebSocket-level tracking
    private glassesLastSeen: Map<WebSocket, number> = new Map();
    private tpaLastSeen: Map<WebSocket, number> = new Map();

    // New application-level ping tracking
    private tpaAppHeartbeatSent: Map<string, number> = new Map(); // TPA sessionId -> timestamp
    private tpaAppHeartbeatReceived: Map<string, number> = new Map(); // TPA sessionId -> timestamp

    // Start application-level heartbeat
    startAppHeartbeats(): void {
      setInterval(() => {
        this.sendApplicationHeartbeats();
        this.checkApplicationTimeouts();
      }, APP_LEVEL_PING_INTERVAL_MS);
    }

    // Send application-level heartbeats to all TPA connections
    private sendApplicationHeartbeats(): void {
      const now = Date.now();

      // Get all active TPA sessions
      const sessions = sessionService.getAllSessions();

      for (const session of sessions) {
        // For each TPA connected to this session
        for (const [packageName, ws] of session.appConnections.entries()) {
          if (ws.readyState === WebSocket.OPEN) {
            try {
              const tpaSessionId = `${session.sessionId}-${packageName}`;
              const heartbeatPing: HeartbeatPing = {
                type: CloudToTpaMessageType.HEARTBEAT_PING,
                timestamp: new Date(),
                sessionId: tpaSessionId,
                serverStatus: {
                  load: this.calculateServerLoad(),
                  activeConnections: this.tpaLastSeen.size + this.glassesLastSeen.size
                }
              };

              ws.send(JSON.stringify(heartbeatPing));
              this.tpaAppHeartbeatSent.set(tpaSessionId, now);
            } catch (error) {
              logger.error('[health-monitor.service] Error sending app heartbeat:', error);
            }
          }
        }
      }
    }

    // Check for application-level timeouts
    private checkApplicationTimeouts(): void {
      const now = Date.now();
      const timeoutThreshold = now - CONNECTION_TIMEOUT_MS;

      // For each TPA we've sent a heartbeat to
      for (const [tpaSessionId, lastSent] of this.tpaAppHeartbeatSent.entries()) {
        // Get the last received heartbeat
        const lastReceived = this.tpaAppHeartbeatReceived.get(tpaSessionId) || 0;

        // If we've sent a heartbeat but haven't received a response within timeout
        if (lastSent > lastReceived && lastSent < timeoutThreshold) {
          logger.warn(`[health-monitor.service] TPA ${tpaSessionId} missed heartbeat, closing`);

          // Parse the session ID to get user session and package name
          const [userSessionId, packageName] = tpaSessionId.split('-');
          const userSession = sessionService.getSession(userSessionId);

          if (userSession && userSession.appConnections.has(packageName)) {
            const ws = userSession.appConnections.get(packageName)!;

            try {
              // Close the connection
              ws.terminate();
              userSession.appConnections.delete(packageName);

              // Clean up heartbeat tracking
              this.tpaAppHeartbeatSent.delete(tpaSessionId);
              this.tpaAppHeartbeatReceived.delete(tpaSessionId);

              // Notify TPA session ended
              tpaRegistrationService.handleTpaSessionEnd(tpaSessionId);
            } catch (error) {
              logger.error(`[health-monitor.service] Error terminating TPA connection:`, error);
            }
          }
        }
      }
    }

    // Record TPA application heartbeat response
    recordTpaHeartbeatResponse(tpaSessionId: string): void {
      this.tpaAppHeartbeatReceived.set(tpaSessionId, Date.now());
    }
  }

  2. WebSocket Service Integration:
  // In WebSocket service, handle the new message types
  private handleTpaMessage(ws: WebSocket, message: TpaToCloudMessage): void {
    // Update the last seen timestamp
    healthMonitorService.updateTpaActivity(ws);

    // Handle different message types
    switch (message.type) {
      // Existing message handlers...

      // New handlers for heartbeat messages
      case TpaToCloudMessageType.HEARTBEAT_PING:
        const pingMessage = message as TpaHeartbeatPing;
        const pongResponse: HeartbeatPong = {
          type: CloudToTpaMessageType.HEARTBEAT_PONG,
          timestamp: new Date(),
          sessionId: pingMessage.sessionId,
          respondingTo: pingMessage.timestamp
        };
        ws.send(JSON.stringify(pongResponse));
        break;

      case TpaToCloudMessageType.HEARTBEAT_PONG:
        const pongMessage = message as TpaHeartbeatPong;
        // Record the heartbeat response
        healthMonitorService.recordTpaHeartbeatResponse(pongMessage.sessionId);
        break;
    }
  }

  3.3.2 TPA Client Implementation

  // TPA Session WebSocket monitoring enhancements
  export class TpaSession {
    // Existing code...

    // New properties for connection monitoring
    private heartbeatInterval: NodeJS.Timeout | null = null;
    private lastHeartbeatReceived: number = 0;
    private heartbeatsPending: Map<string, Date> = new Map(); // Timestamp -> sent Date

    // Configurations
    private readonly HEARTBEAT_INTERVAL_MS = 30000; // 30 seconds
    private readonly HEARTBEAT_TIMEOUT_MS = 60000;  // 60 seconds
    private readonly MAX_MISSED_HEARTBEATS = 2;     // How many missed heartbeats before reconnect

    // Start heartbeat monitoring
    private startHeartbeatMonitoring(): void {
      // Clear any existing interval
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
      }

      // Reset tracking
      this.lastHeartbeatReceived = Date.now();
      this.heartbeatsPending.clear();

      // Set up new interval
      this.heartbeatInterval = setInterval(() => {
        this.sendHeartbeat();
        this.checkHeartbeatTimeout();
      }, this.HEARTBEAT_INTERVAL_MS);

      // Track for cleanup
      this.resources.track(() => {
        if (this.heartbeatInterval) {
          clearInterval(this.heartbeatInterval);
          this.heartbeatInterval = null;
        }
      });
    }

    // Send a heartbeat ping
    private sendHeartbeat(): void {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return;
      }

      try {
        const now = new Date();
        const pingMessage: TpaHeartbeatPing = {
          type: TpaToCloudMessageType.HEARTBEAT_PING,
          timestamp: now,
          sessionId: this.sessionId!,
          packageName: this.config.packageName,
          clientStatus: {
            processing: true, // Set based on TPA state
            subscriptionCount: this.subscriptions.size
          }
        };

        this.send(pingMessage);

        // Track this heartbeat
        const nowStr = now.toISOString();
        this.heartbeatsPending.set(nowStr, now);

        // Cleanup old pending heartbeats
        const cutoff = Date.now() - this.HEARTBEAT_TIMEOUT_MS * 2;
        for (const [key, timestamp] of this.heartbeatsPending.entries()) {
          if (timestamp.getTime() < cutoff) {
            this.heartbeatsPending.delete(key);
          }
        }
      } catch (error) {
        console.error('Error sending heartbeat:', error);
      }
    }

    // Check if we've timed out waiting for heartbeats
    private checkHeartbeatTimeout(): void {
      const now = Date.now();

      // If we've received a heartbeat recently, we're good
      if (now - this.lastHeartbeatReceived < this.HEARTBEAT_TIMEOUT_MS) {
        return;
      }

      // Count missed heartbeats
      const missedHeartbeats = this.heartbeatsPending.size;

      if (missedHeartbeats >= this.MAX_MISSED_HEARTBEATS) {
        console.warn(`Missed ${missedHeartbeats} heartbeats, reconnecting...`);

        // Force reconnection
        this.reconnect();
      }
    }

    // Handle heartbeat messages from the server
    private handleHeartbeatMessage(message: CloudToTpaMessage): void {
      if (message.type === CloudToTpaMessageType.HEARTBEAT_PING) {
        // Respond to ping
        const pingMessage = message as HeartbeatPing;
        const pongResponse: TpaHeartbeatPong = {
          type: TpaToCloudMessageType.HEARTBEAT_PONG,
          timestamp: new Date(),
          sessionId: this.sessionId!,
          packageName: this.config.packageName,
          respondingTo: pingMessage.timestamp
        };

        this.send(pongResponse);
        this.lastHeartbeatReceived = Date.now();
      }
      else if (message.type === CloudToTpaMessageType.HEARTBEAT_PONG) {
        // Process pong
        const pongMessage = message as HeartbeatPong;

        // Find the corresponding ping
        const pingTimestamp = pongMessage.respondingTo.toISOString();
        if (this.heartbeatsPending.has(pingTimestamp)) {
          this.heartbeatsPending.delete(pingTimestamp);
          this.lastHeartbeatReceived = Date.now();
        }
      }
    }

    // Force reconnection
    private reconnect(): void {
      // Only attempt if we have a session ID
      if (!this.sessionId) {
        return;
      }

      console.log('Forcing reconnection due to heartbeat timeout');

      // Close existing connection if it exists
      if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
        try {
          this.ws.close();
        } catch (error) {
          console.error('Error closing existing connection:', error);
        }
      }

      // Attempt to reconnect
      this.connect(this.sessionId)
        .then(() => console.log('Reconnection successful'))
        .catch(error => console.error('Reconnection failed:', error));
    }

    // Modify existing handleMessage to process heartbeat messages
    private handleMessage(message: CloudToTpaMessage): void {
      // Existing code...

      // Handle heartbeat messages
      if (message.type === CloudToTpaMessageType.HEARTBEAT_PING ||
          message.type === CloudToTpaMessageType.HEARTBEAT_PONG) {
        this.handleHeartbeatMessage(message);
        return;
      }

      // Existing message handling...
    }

    // Modify connect method to start heartbeat monitoring
    async connect(sessionId: string): Promise<void> {
      // Existing connection code...

      return new Promise((resolve, reject) => {
        // Existing promise setup...

        this.ws.on('open', () => {
          // Existing open handler...

          // Start heartbeat monitoring after successful connection
          this.startHeartbeatMonitoring();
        });

        // Existing handlers...
      });
    }
  }

  3.4 Error Handling and Recovery

  1. Graduated Reconnection Strategy:
    - First attempt: immediate reconnection
    - Subsequent attempts: exponential backoff (1s, 2s, 4s, 8s, etc.)
    - Maximum backoff: 30 seconds
    - Maximum total attempts: configurable, default 10
  2. Session State Preservation:
    - TPA saves relevant state before reconnection
    - Cloud maintains session state during short disconnections
    - Session recovery logic uses the TPA Server Registration system
  3. Error Logging and Notification:
    - Log all connection issues on both sides
    - Metrics tracking for connection health
    - Dashboard alerts for persistent connection issues

  3.5 Configuration Parameters

  4. Benefits and Outcomes

  4.1 Immediate Benefits

  1. Improved Connection Reliability:
    - Faster detection of stale connections
    - Proactive connection health monitoring from both sides
    - Reduced silent failures and zombie connections
  2. Better Error Recovery:
    - Structured reconnection protocol
    - Clear health status indicators
    - Graduated reconnection strategy
  3. Enhanced Operational Visibility:
    - Status information in heartbeat messages
    - Connection quality metrics
    - Clearer diagnostic information

  4.2 Long-term Benefits

  1. Increased System Stability:
    - Fewer orphaned sessions
    - More predictable connection behavior
    - Better resource utilization
  2. Improved User Experience:
    - Faster recovery from network disruptions
    - Less manual intervention required
    - More reliable application performance
  3. Better Scalability:
    - More efficient connection management
    - Earlier cleanup of stale connections
    - Reduced unnecessary resource consumption

  5. Implementation Plan

  5.1 Phase 1: Core Infrastructure

  1. Update message protocol with new heartbeat message types
  2. Implement application-level heartbeat in health-monitor.service.ts
  3. Extend WebSocket service to handle the new message types
  4. Add heartbeat messaging to TPA SDK

  5.2 Phase 2: Client-Side Implementation

  1. Implement TPA-side heartbeat generation and monitoring
  2. Add reconnection strategies to TPA client
  3. Enhance error handling and reporting
  4. Add developer documentation

  5.3 Phase 3: Testing and Optimization

  1. Implement integration tests for heartbeat system
  2. Test reconnection scenarios
  3. Optimize timing parameters based on real-world testing
  4. Add metrics collection for heartbeat performance

  6. Conclusion

  The proposed bidirectional heartbeat system enhances the existing WebSocket connection monitoring with application-level messages that provide
  better visibility, faster failure detection, and more robust recovery. By implementing this system, we'll address the limitations of the
  current implementation and provide a more reliable connection management system for TPAs, improving both developer and end-user experience.
