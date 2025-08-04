import { Logger } from "pino";
import WebSocket from "ws";
import crypto from "crypto";
import {
  CloudToGlassesMessageType,
  CloudToAppMessageType,
  ManagedStreamRequest,
  ManagedStreamStopRequest,
  ManagedStreamStatus,
  OutputStatus,
  StartRtmpStream,
  StopRtmpStream,
  KeepRtmpStreamAlive,
  RtmpStreamStatus,
  KeepAliveAck,
  GlassesToCloudMessageType,
} from "@mentra/sdk";
import UserSession from "../session/UserSession";
import { sessionService } from "../session/session.service";
import {
  CloudflareStreamService,
  LiveInputResult,
} from "./CloudflareStreamService";
import {
  StreamStateManager,
  StreamType,
  ManagedStreamState,
} from "./StreamStateManager";

/**
 * Tracks keep-alive state for managed streams
 */
interface ManagedStreamKeepAlive {
  userId: string;
  streamId: string;
  cfLiveInputId: string;
  keepAliveTimer?: NodeJS.Timeout;
  lastKeepAlive: Date;
  pendingAcks: Map<string, { sentAt: Date; timeout: NodeJS.Timeout }>;
  missedAcks: number;
}

// Keep-alive constants matching VideoManager
const KEEP_ALIVE_INTERVAL_MS = 15000; // 15 seconds
const ACK_TIMEOUT_MS = 5000; // 5 seconds to wait for ACK
const MAX_MISSED_ACKS = 3; // Max consecutive missed ACKs

/**
 * Extension to VideoManager that adds managed streaming capabilities
 * Works alongside existing VideoManager without modifying core logic
 */
export class ManagedStreamingExtension {
  private logger: Logger;
  private cloudflareService: CloudflareStreamService;
  private stateManager: StreamStateManager;

  // Keep-alive tracking for managed streams (per user, not per app)
  private managedKeepAlive: Map<string, ManagedStreamKeepAlive> = new Map(); // userId -> keepAlive

  // Polling intervals for URL discovery
  private pollingIntervals: Map<string, NodeJS.Timeout> = new Map(); // userId -> interval

  constructor(logger: Logger) {
    this.logger = logger.child({ service: "ManagedStreamingExtension" });
    this.cloudflareService = new CloudflareStreamService(logger);
    this.stateManager = new StreamStateManager(logger);

    this.logger.info("ManagedStreamingExtension initialized");

    // Schedule periodic cleanup
    setInterval(
      () => {
        this.performCleanup();
      },
      60 * 60 * 1000,
    ); // Every hour
  }

  /**
   * Start or join a managed stream
   */
  async startManagedStream(
    userSession: UserSession,
    request: ManagedStreamRequest,
  ): Promise<string> {
    const {
      packageName,
      quality,
      enableWebRTC,
      video,
      audio,
      stream: streamOptions,
    } = request;
    const userId = userSession.userId;

    this.logger.info(
      {
        userId,
        packageName,
        quality,
        enableWebRTC,
        hasVideo: !!video,
        hasAudio: !!audio,
      },
      "Starting managed stream request",
    );

    // Validate app is running
    if (!userSession.appManager.isAppRunning(packageName)) {
      throw new Error(`App ${packageName} is not running`);
    }

    // Check WebSocket connection
    if (
      !userSession.websocket ||
      userSession.websocket.readyState !== WebSocket.OPEN
    ) {
      throw new Error("Glasses WebSocket not connected");
    }

    // Check for conflicts
    const conflict = this.stateManager.checkStreamConflict(userId, "managed");
    if (conflict.hasConflict) {
      throw new Error(conflict.message || "Stream conflict detected");
    }

    // Get or create managed stream
    const existingStream = this.stateManager.getStreamState(userId);

    if (existingStream && existingStream.type === "managed") {
      // Add viewer to existing stream
      const managedStream = this.stateManager.createOrJoinManagedStream({
        userId,
        appId: packageName,
        liveInput: {
          liveInputId: existingStream.cfLiveInputId,
          rtmpUrl: existingStream.cfIngestUrl,
          hlsUrl: existingStream.hlsUrl,
          dashUrl: existingStream.dashUrl,
          webrtcUrl: existingStream.webrtcUrl,
        },
      });

      // Send status to new viewer
      await this.sendManagedStreamStatus(
        userSession,
        packageName,
        managedStream.streamId,
        "active",
      );

      return managedStream.streamId;
    }

    // Create new Cloudflare live input
    this.logger.debug(
      { userId, packageName },
      "📡 Creating new Cloudflare live input",
    );

    let liveInput;
    try {
      liveInput = await this.cloudflareService.createLiveInput(userId, {
        quality,
        enableWebRTC,
        enableRecording: false, // Live-only for now
        requireSignedURLs: false, // Public streams
      });

      this.logger.info(
        {
          userId,
          packageName,
          liveInput: JSON.stringify(liveInput, null, 2),
        },
        "✅ Cloudflare live input created successfully",
      );
    } catch (cfError) {
      this.logger.error(
        {
          userId,
          packageName,
          error: {
            message:
              cfError instanceof Error ? cfError.message : "Unknown error",
            stack: cfError instanceof Error ? cfError.stack : undefined,
            fullError: JSON.stringify(cfError, null, 2),
          },
        },
        "❌ Failed to create Cloudflare live input",
      );
      throw cfError;
    }

    // Create managed stream state
    this.logger.debug(
      { userId, packageName },
      "📊 Creating managed stream state",
    );
    const managedStream = this.stateManager.createOrJoinManagedStream({
      userId,
      appId: packageName,
      liveInput,
    });

    // Start keep-alive for this user's managed stream
    this.startKeepAlive(
      userId,
      managedStream.streamId,
      managedStream.cfLiveInputId,
    );

    // Send start command to glasses with Cloudflare RTMP URL
    const startMessage: StartRtmpStream = {
      type: CloudToGlassesMessageType.START_RTMP_STREAM,
      sessionId: userSession.sessionId,
      rtmpUrl: liveInput.rtmpUrl, // Cloudflare ingest URL
      appId: "MANAGED_STREAM", // Special app ID for managed streams
      streamId: managedStream.streamId,
      video: video || {},
      audio: audio || {},
      stream: streamOptions || {},
      timestamp: new Date(),
    };

    try {
      userSession.websocket.send(JSON.stringify(startMessage));

      this.logger.info(
        {
          userId,
          streamId: managedStream.streamId,
          cfLiveInputId: liveInput.liveInputId,
          packageName,
        },
        "Sent START_RTMP_STREAM for managed stream",
      );

      // Send initial status without URLs (they're not ready yet)
      await this.sendManagedStreamStatus(
        userSession,
        packageName,
        managedStream.streamId,
        "initializing",
        "Waiting for stream to start...",
        undefined, // No HLS URL yet
        undefined, // No DASH URL yet
        undefined, // No WebRTC URL yet
      );

      // Start polling for playback URLs
      this.startPlaybackUrlPolling(userId, packageName, managedStream);
    } catch (error) {
      // Cleanup on error
      this.stateManager.removeStream(userId);
      this.stopKeepAlive(userId);
      await this.cloudflareService.deleteLiveInput(liveInput.liveInputId);
      throw error;
    }

    return managedStream.streamId;
  }

  /**
   * Stop managed stream for a specific app
   */
  async stopManagedStream(
    userSession: UserSession,
    request: ManagedStreamStopRequest,
  ): Promise<void> {
    const { packageName } = request;
    const userId = userSession.userId;

    this.logger.info(
      { userId, packageName },
      "Stopping managed stream for app",
    );

    const stream = this.stateManager.getStreamState(userId);
    if (!stream || stream.type !== "managed") {
      this.logger.warn(
        { userId, packageName },
        "No managed stream found to stop",
      );
      return;
    }

    // Remove this app as a viewer
    const shouldCleanup = this.stateManager.removeViewerFromManagedStream(
      userId,
      packageName,
    );

    // Notify app that stream is stopping
    await this.sendManagedStreamStatus(
      userSession,
      packageName,
      stream.streamId,
      "stopped",
    );

    // If no more viewers, stop the stream entirely
    if (shouldCleanup) {
      await this.cleanupManagedStream(userSession, userId, stream);
    }
  }

  /**
   * Handle RTMP stream status from glasses
   * @returns true if handled by managed streaming, false otherwise
   */
  async handleStreamStatus(
    userSession: UserSession,
    status: RtmpStreamStatus,
  ): Promise<boolean> {
    const { streamId, status: glassesStatus } = status;

    // Check if this is a managed stream by stream ID
    if (!streamId) {
      return false; // No streamId, cannot be a managed stream
    }

    const stream = this.stateManager.getStreamByStreamId(streamId);
    if (!stream || stream.type !== "managed") {
      return false; // Let VideoManager handle unmanaged streams
    }

    this.logger.info(
      {
        streamId,
        glassesStatus,
        userId: stream.userId,
      },
      "Received managed stream status from glasses",
    );

    // Update last activity
    this.stateManager.updateLastActivity(stream.userId);

    // Map glasses status to our status
    let mappedStatus: ManagedStreamStatus["status"] = "active";
    switch (glassesStatus) {
      case "initializing":
      case "connecting":
        mappedStatus = "initializing";
        break;
      case "active":
      case "streaming":
        mappedStatus = "active";
        break;
      case "stopping":
        mappedStatus = "stopping";
        break;
      case "stopped":
        mappedStatus = "stopped";
        break;
      case "error":
        mappedStatus = "error";
        break;
    }

    // Send status to all viewers
    for (const appId of stream.activeViewers) {
      await this.sendManagedStreamStatus(
        userSession,
        appId,
        stream.streamId,
        mappedStatus,
      );
    }

    // If stream stopped or errored, cleanup
    if (mappedStatus === "stopped" || mappedStatus === "error") {
      await this.cleanupManagedStream(userSession, stream.userId, stream);
    }

    return true; // Handled by managed streaming
  }

  /**
   * Handle keep-alive ACK from glasses
   */
  handleKeepAliveAck(userId: string, ack: KeepAliveAck): void {
    const keepAlive = this.managedKeepAlive.get(userId);
    if (!keepAlive) return;

    const ackInfo = keepAlive.pendingAcks.get(ack.ackId);
    if (ackInfo) {
      clearTimeout(ackInfo.timeout);
      keepAlive.pendingAcks.delete(ack.ackId);
      keepAlive.missedAcks = 0; // Reset on successful ACK
      keepAlive.lastKeepAlive = new Date();

      this.logger.debug(
        {
          userId,
          ackId: ack.ackId,
          streamId: keepAlive.streamId,
        },
        "Received keep-alive ACK for managed stream",
      );
    }
  }

  /**
   * Check for stream conflicts before starting unmanaged stream
   */
  checkUnmanagedStreamConflict(userId: string): boolean {
    const conflict = this.stateManager.checkStreamConflict(userId, "unmanaged");
    return conflict.hasConflict;
  }

  /**
   * Get stream statistics
   */
  getStats() {
    return this.stateManager.getStats();
  }

  /**
   * Start polling for playback URLs after stream creation
   */
  private startPlaybackUrlPolling(
    userId: string,
    packageName: string,
    managedStream: ManagedStreamState,
  ): void {
    const pollInterval = setInterval(async () => {
      try {
        // Check if stream is still active
        const currentStream = this.stateManager.getStreamState(userId);
        if (
          !currentStream ||
          currentStream.type !== "managed" ||
          currentStream.streamId !== managedStream.streamId
        ) {
          clearInterval(pollInterval);
          return;
        }

        // Check if URLs are already discovered
        if (managedStream.hlsUrl && managedStream.dashUrl) {
          clearInterval(pollInterval);
          return;
        }

        this.logger.debug(
          {
            userId,
            streamId: managedStream.streamId,
            cfLiveInputId: managedStream.cfLiveInputId,
          },
          "🔍 Polling for stream live status",
        );

        // Check if stream is live
        const isLive = await this.cloudflareService.waitForStreamLive(
          managedStream.cfLiveInputId,
          1, // Only one attempt per poll
          0, // No delay, we handle it ourselves
        );

        if (isLive) {
          this.logger.info(
            {
              userId,
              streamId: managedStream.streamId,
            },
            "🎉 Stream is live! Sending playback URLs to apps",
          );

          // Get user session to send updates
          const userSession = this.getUserSession(userId);
          if (!userSession) {
            clearInterval(pollInterval);
            return;
          }

          // Send status update to all apps viewing this stream
          for (const appId of managedStream.activeViewers) {
            await this.sendManagedStreamStatus(
              userSession,
              appId,
              managedStream.streamId,
              "active",
              "Stream is now live",
              managedStream.hlsUrl,
              managedStream.dashUrl,
              managedStream.webrtcUrl,
            );
          }

          // Stop polling
          clearInterval(pollInterval);
        }
      } catch (error) {
        this.logger.error(
          {
            userId,
            streamId: managedStream.streamId,
            error,
          },
          "Error polling for playback URLs",
        );
      }
    }, 2000); // Poll every 2 seconds

    // Store interval for cleanup
    const existingInterval = this.pollingIntervals.get(userId);
    if (existingInterval) {
      clearInterval(existingInterval);
    }
    this.pollingIntervals.set(userId, pollInterval);

    // Set timeout to stop polling after 60 seconds
    setTimeout(() => {
      if (this.pollingIntervals.get(userId) === pollInterval) {
        clearInterval(pollInterval);
        this.pollingIntervals.delete(userId);
        this.logger.warn(
          {
            userId,
            streamId: managedStream.streamId,
          },
          "⏱️ Stopped polling for playback URLs after timeout",
        );
      }
    }, 60000);
  }

  /**
   * Send managed stream status to app
   */
  private async sendManagedStreamStatus(
    userSession: UserSession,
    packageName: string,
    streamId: string,
    status: ManagedStreamStatus["status"],
    message?: string,
    hlsUrl?: string,
    dashUrl?: string,
    webrtcUrl?: string,
  ): Promise<void> {
    const stream = this.stateManager.getStreamByStreamId(streamId);
    if (!stream || stream.type !== "managed") return;

    const appWs = userSession.appWebsockets.get(packageName);
    if (!appWs || appWs.readyState !== WebSocket.OPEN) {
      this.logger.warn(
        { packageName },
        "App WebSocket not available for status update",
      );
      return;
    }

    // Convert CloudflareOutput to OutputStatus format
    let outputs: OutputStatus[] | undefined;
    if (stream.outputs && stream.outputs.length > 0) {
      outputs = stream.outputs.map((output) => ({
        url: output.url,
        name: undefined, // Cloudflare doesn't store names, would need to track separately
        status:
          output.status?.current?.state === "connected"
            ? ("active" as const)
            : output.status?.current?.state === "error"
              ? ("error" as const)
              : ("stopped" as const),
        error: output.status?.current?.lastError,
      }));
    }

    const statusMessage: ManagedStreamStatus = {
      type: CloudToAppMessageType.MANAGED_STREAM_STATUS,
      status,
      hlsUrl: hlsUrl !== undefined ? hlsUrl : stream.hlsUrl,
      dashUrl: dashUrl !== undefined ? dashUrl : stream.dashUrl,
      webrtcUrl: webrtcUrl !== undefined ? webrtcUrl : stream.webrtcUrl,
      streamId,
      message,
      outputs,
    };

    appWs.send(JSON.stringify(statusMessage));

    this.logger.debug(
      {
        packageName,
        status,
        streamId,
        hasHls: !!statusMessage.hlsUrl,
        hasDash: !!statusMessage.dashUrl,
        message,
      },
      "Sent managed stream status to app",
    );
  }

  /**
   * Start keep-alive timer for managed stream
   */
  private startKeepAlive(
    userId: string,
    streamId: string,
    cfLiveInputId: string,
  ): void {
    // Clear any existing keep-alive
    this.stopKeepAlive(userId);

    const keepAlive: ManagedStreamKeepAlive = {
      userId,
      streamId,
      cfLiveInputId,
      lastKeepAlive: new Date(),
      pendingAcks: new Map(),
      missedAcks: 0,
    };

    // Schedule periodic keep-alive
    keepAlive.keepAliveTimer = setInterval(() => {
      this.sendKeepAlive(userId);
    }, KEEP_ALIVE_INTERVAL_MS);

    this.managedKeepAlive.set(userId, keepAlive);
  }

  /**
   * Send keep-alive message to glasses
   */
  private async sendKeepAlive(userId: string): Promise<void> {
    const keepAlive = this.managedKeepAlive.get(userId);
    if (!keepAlive) return;

    const userSession = this.getUserSession(userId);
    if (!userSession || userSession.websocket?.readyState !== WebSocket.OPEN) {
      this.logger.warn(
        { userId },
        "Cannot send keep-alive - WebSocket not connected",
      );
      return;
    }

    // Short ACK ID for BLE efficiency
    const ackId = `a${Date.now().toString(36).slice(-5)}`;
    const message: KeepRtmpStreamAlive = {
      type: CloudToGlassesMessageType.KEEP_RTMP_STREAM_ALIVE,
      streamId: keepAlive.streamId,
      ackId,
    };

    // Set up ACK timeout
    const timeout = setTimeout(() => {
      keepAlive.pendingAcks.delete(ackId);
      keepAlive.missedAcks++;

      this.logger.warn(
        {
          userId,
          ackId,
          missedAcks: keepAlive.missedAcks,
        },
        "Keep-alive ACK timeout for managed stream",
      );

      if (keepAlive.missedAcks >= MAX_MISSED_ACKS) {
        this.logger.error(
          { userId },
          "Max missed ACKs reached - cleaning up dead stream",
        );

        // Get user session and clean up the stream
        const userSession = this.getUserSession(userId);
        const stream = this.stateManager.getStreamState(userId);

        if (userSession && stream && stream.type === "managed") {
          // Clean up the stream (this will stop keep-alive)
          this.cleanupManagedStream(userSession, userId, stream).catch(
            (err) => {
              this.logger.error(
                { userId, error: err },
                "Error cleaning up stream after max missed ACKs",
              );
            },
          );
        }
      }
    }, ACK_TIMEOUT_MS);

    keepAlive.pendingAcks.set(ackId, {
      sentAt: new Date(),
      timeout,
    });

    userSession.websocket.send(JSON.stringify(message));
  }

  /**
   * Stop keep-alive timer
   */
  private stopKeepAlive(userId: string): void {
    const keepAlive = this.managedKeepAlive.get(userId);
    if (!keepAlive) return;

    if (keepAlive.keepAliveTimer) {
      clearInterval(keepAlive.keepAliveTimer);
    }

    // Clear pending ACKs
    for (const [, ackInfo] of keepAlive.pendingAcks) {
      clearTimeout(ackInfo.timeout);
    }

    this.managedKeepAlive.delete(userId);
  }

  /**
   * Clean up managed stream completely
   */
  private async cleanupManagedStream(
    userSession: UserSession,
    userId: string,
    stream: any,
  ): Promise<void> {
    this.logger.info(
      { userId, streamId: stream.streamId },
      "Cleaning up managed stream",
    );

    // Stop keep-alive
    this.stopKeepAlive(userId);

    // Stop polling for URLs if still active
    const pollInterval = this.pollingIntervals.get(userId);
    if (pollInterval) {
      clearInterval(pollInterval);
      this.pollingIntervals.delete(userId);
    }

    // Send stop command to glasses
    if (userSession.websocket?.readyState === WebSocket.OPEN) {
      const stopMessage: StopRtmpStream = {
        type: CloudToGlassesMessageType.STOP_RTMP_STREAM,
        sessionId: userSession.sessionId,
        appId: "MANAGED_STREAM", // Same special app ID used when starting
        streamId: stream.streamId,
        timestamp: new Date(),
      };
      userSession.websocket.send(JSON.stringify(stopMessage));
    }

    // Remove from state manager
    this.stateManager.removeStream(userId);

    // No Cloudflare cleanup needed
  }

  /**
   * Get user session by userId
   */
  private getUserSession(userId: string): UserSession | undefined {
    return sessionService.getSessionByUserId(userId) || undefined;
  }

  /**
   * Perform periodic cleanup
   */
  private async performCleanup(): Promise<void> {
    try {
      // Clean up inactive streams
      const removedUsers = this.stateManager.cleanupInactiveStreams(60);

      // No Cloudflare cleanup needed

      this.logger.info(
        {
          removedStreams: removedUsers.length,
        },
        "Performed periodic cleanup",
      );
    } catch (error) {
      this.logger.error({ error }, "Error during periodic cleanup");
    }
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    // Stop all keep-alive timers
    for (const userId of this.managedKeepAlive.keys()) {
      this.stopKeepAlive(userId);
    }

    // Stop all polling intervals
    for (const [userId, interval] of this.pollingIntervals) {
      clearInterval(interval);
    }
    this.pollingIntervals.clear();

    this.logger.info("ManagedStreamingExtension disposed");
  }
}
