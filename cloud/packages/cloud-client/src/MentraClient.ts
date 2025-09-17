/**
 * MentraClient - Main client class for connecting to AugmentOS cloud
 *
 * This is a pure TypeScript SDK that provides a clean, production-ready interface
 * for interacting with the AugmentOS cloud platform. It mirrors the cloud architecture
 * with internal managers handling specific domains.
 */

import { EventEmitter } from "events";
import type {
  ClientConfig,
  AudioStream,
  DisplayEvent,
  AppStateChange,
  ConnectionAck,
  SettingsUpdate,
  MicrophoneStateChange,
} from "./types";
import type { DisplayRequest } from "./types/sdk-types";
import { WebSocketManager } from "./managers/WebSocketManager";
import { AudioManager } from "./managers/AudioManager";
import { AppManager } from "./managers/AppManager";
import { LocationManager } from "./managers/LocationManager";
import { DisplayManager } from "./managers/DisplayManager";

/**
 * Main client class providing clean public API for AugmentOS cloud interaction
 */
export class MentraClient extends EventEmitter {
  private config: ClientConfig;
  private wsManager: WebSocketManager;
  private audioManager: AudioManager;
  private appManager: AppManager;
  private locationManager: LocationManager;
  private displayManager: DisplayManager;
  private connected = false;
  private coreToken?: string;

  constructor(config: ClientConfig) {
    super();

    // Store config with defaults
    this.config = {
      ...config,
      audio: {
        format: "pcm16",
        sampleRate: 16000,
        chunkSize: 1600, // 100ms at 16kHz
        ...config.audio,
      },
      device: {
        model: "Even Realities G1",
        batteryLevel: 85,
        brightness: 50,
        ...config.device,
      },
      behavior: {
        statusUpdateInterval: 10000,
        locationUpdateInterval: 5000,
        reconnectOnDisconnect: true,
        disableStatusUpdates: false,
        ...config.behavior,
      },
      debug: {
        logLevel: "info",
        saveMetrics: false,
        logWebSocketMessages: false,
        ...config.debug,
      },
    };

    // Initialize managers
    this.wsManager = new WebSocketManager(this.config);
    this.audioManager = new AudioManager(this.config.audio!);
    this.appManager = new AppManager();
    this.locationManager = new LocationManager(this.config.behavior!);
    this.displayManager = new DisplayManager();

    // Setup event forwarding from managers
    this.setupEventForwarding();
  }

  //===========================================================
  // Connection Management
  //===========================================================

  /**
   * Connect to the AugmentOS cloud server
   */
  async connect(serverUrl?: string): Promise<void> {
    const url = serverUrl || this.config.serverUrl;

    try {
      await this.wsManager.connect(
        url,
        this.config.email,
        this.config.coreToken,
      );
      this.connected = true;
      this.coreToken = this.config.coreToken;

      // Start background services
      this.locationManager.start();

      if (this.config.debug?.logLevel === "debug") {
        console.log(`[MentraClient] Connected to ${url}`);
      }
    } catch (error) {
      this.connected = false;
      throw new Error(`Failed to connect to ${url}: ${error}`);
    }
  }

  /**
   * Disconnect from the server and cleanup resources
   */
  async disconnect(): Promise<void> {
    if (!this.connected) return;

    try {
      // Stop background services
      this.locationManager.stop();
      this.audioManager.stopSpeaking();

      // Close WebSocket connection
      await this.wsManager.disconnect();
      this.connected = false;

      if (this.config.debug?.logLevel === "debug") {
        console.log("[MentraClient] Disconnected");
      }
    } catch (error) {
      throw new Error(`Failed to disconnect: ${error}`);
    }
  }

  /**
   * Check if client is connected
   */
  isConnected(): boolean {
    return this.connected && this.wsManager.isConnected();
  }

  //===========================================================
  // Audio & Voice Methods
  //===========================================================

  /**
   * Stream audio from a file in real-time
   * The method waits for the entire file to finish streaming before resolving
   */
  async startSpeakingFromFile(
    filePath: string,
    sendVad: boolean = true,
  ): Promise<void> {
    this.ensureConnected();

    if (sendVad) {
      // Send VAD true signal first
      this.wsManager.sendVad(true);
    }

    // Stream the file and wait for completion
    await this.audioManager.streamAudioFile(filePath, (chunk) => {
      this.wsManager.sendAudioChunk(chunk);
    });

    if (sendVad) {
      // VAD false signal will be sent when file streaming completes
      this.wsManager.sendVad(false);
    }
  }

  /**
   * Stream audio from a provided audio stream
   * Works with any stream-like object (microphone, file stream, etc.)
   */
  startSpeakingFromStream(stream: AudioStream): void {
    this.ensureConnected();

    // Send VAD true signal
    this.wsManager.sendVad(true);

    // Start streaming audio chunks
    this.audioManager.streamFromSource(stream, (chunk) => {
      this.wsManager.sendAudioChunk(chunk);
    });
  }

  /**
   * Send VAD (Voice Activity Detection) signal only, without audio chunks
   * Useful for testing VAD behavior without actual audio
   */
  startSpeaking(): void {
    this.ensureConnected();
    this.wsManager.sendVad(true);
  }

  /**
   * Stop voice activity and audio streaming
   */
  stopSpeaking(): void {
    if (!this.connected) return;

    this.audioManager.stopSpeaking();
    this.wsManager.sendVad(false);
  }

  //===========================================================
  // Head Position & Display Methods
  //===========================================================

  /**
   * Send head position "up" event (switch to dashboard view)
   */
  lookUp(): void {
    this.ensureConnected();
    this.displayManager.setHeadPosition("up");
    this.wsManager.sendHeadPosition("up");
  }

  /**
   * Send head position "down" event (switch to main view)
   */
  lookDown(): void {
    this.ensureConnected();
    this.displayManager.setHeadPosition("down");
    this.wsManager.sendHeadPosition("down");
  }

  /**
   * Get currently visible display content based on head position and dashboard state
   */
  getVisibleContent(): DisplayRequest | null {
    return this.displayManager.getVisibleContent();
  }

  //===========================================================
  // App Management Methods
  //===========================================================

  /**
   * Request to start an app with the specified package name
   */
  async startApp(packageName: string): Promise<void> {
    this.ensureConnected();

    // Check if app is already running
    if (this.appManager.isAppRunning(packageName)) {
      console.log(`[MentraClient] App ${packageName} is already running`);
      return;
    }

    this.appManager.setAppLoading(packageName);
    this.wsManager.sendStopApp(packageName);
    this.wsManager.sendStartApp(packageName);

    // Wait for app to start (implementation depends on app state change events)
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`App ${packageName} failed to start within timeout`));
      }, 10000);

      const onAppStateChange = (state: AppStateChange) => {
        if (state.userSession.activeAppSessions.includes(packageName)) {
          clearTimeout(timeout);
          this.off("app_state_change", onAppStateChange);
          resolve();
        }
      };

      this.on("app_state_change", onAppStateChange);
    });
  }

  /**
   * Request to stop an app with the specified package name
   */
  async stopApp(packageName: string): Promise<void> {
    this.ensureConnected();

    // Check if app is already stopped
    if (!this.appManager.isAppRunning(packageName)) {
      console.log(`[MentraClient] App ${packageName} is already stopped`);
      return;
    }

    this.wsManager.sendStopApp(packageName);

    // Wait for app to stop
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`App ${packageName} failed to stop within timeout`));
      }, 5000);

      const onAppStateChange = (state: AppStateChange) => {
        if (!state.userSession.activeAppSessions.includes(packageName)) {
          clearTimeout(timeout);
          this.off("app_state_change", onAppStateChange);
          resolve();
        }
      };

      this.on("app_state_change", onAppStateChange);
    });
  }

  /**
   * Get list of currently running app package names
   */
  getRunningApps(): string[] {
    return this.appManager.getRunningApps();
  }

  /**
   * Install an app using the REST API
   */
  async installApp(packageName: string): Promise<void> {
    this.ensureConnected();

    const serverUrl = this.config.serverUrl.replace(/^ws/, "http");
    const response = await fetch(`${serverUrl}/apps/install/${packageName}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.coreToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to install app ${packageName}: ${response.status} ${errorText}`,
      );
    }
  }

  /**
   * Uninstall an app using the REST API
   */
  async uninstallApp(packageName: string): Promise<void> {
    this.ensureConnected();

    const serverUrl = this.config.serverUrl.replace(/^ws/, "http");
    const response = await fetch(`${serverUrl}/apps/uninstall/${packageName}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.coreToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to uninstall app ${packageName}: ${response.status} ${errorText}`,
      );
    }
  }

  //===========================================================
  // Location Methods
  //===========================================================

  /**
   * Send a location update with the specified coordinates
   */
  updateLocation(lat: number, lng: number): void {
    this.ensureConnected();
    this.locationManager.updateLocation(lat, lng);
    this.wsManager.sendLocationUpdate(lat, lng);
  }

  //===========================================================
  // Private Methods
  //===========================================================

  private ensureConnected(): void {
    if (!this.connected) {
      throw new Error("Client is not connected. Call connect() first.");
    }
  }

  private setupEventForwarding(): void {
    // Forward events from WebSocketManager
    this.wsManager.on("connection_ack", (data: ConnectionAck) => {
      this.emit("connection_ack", data);
    });

    this.wsManager.on("display_event", (data: DisplayEvent) => {
      this.displayManager.updateDisplay(data.layout);
      this.emit("display_event", data);
    });

    this.wsManager.on("app_state_change", (data: AppStateChange) => {
      this.appManager.updateAppState(data.userSession);
      this.emit("app_state_change", data);
    });

    this.wsManager.on("settings_update", (data: SettingsUpdate) => {
      this.emit("settings_update", data);
    });

    this.wsManager.on(
      "microphone_state_change",
      (data: MicrophoneStateChange) => {
        this.emit("microphone_state_change", data);
      },
    );

    this.wsManager.on("error", (error: Error) => {
      this.emit("error", error);
    });

    // Forward location updates from LocationManager
    this.locationManager.on("location_update", (lat: number, lng: number) => {
      if (this.connected) {
        this.wsManager.sendLocationUpdate(lat, lng);
      }
    });
  }
}
