/**
 * 🧭 Navigation Module
 * 
 * Provides navigation functionality using Google Maps Navigation SDK.
 * Allows third-party apps to start navigation, update route preferences,
 * and receive real-time navigation updates and status changes.
 */

import { Logger } from "pino";
import { 
  AppNavigationStartRequest,
  AppNavigationStopRequest, 
  AppNavigationRouteUpdateRequest
} from "../../../types/messages/app-to-cloud";
import { AppToCloudMessageType } from "../../../types/message-types";

/**
 * Options for starting navigation
 */
export interface NavigationStartOptions {
  /** Navigation mode (defaults to "driving") */
  mode?: "driving" | "walking" | "cycling" | "transit";
  /** Optional request ID for tracking this navigation request */
  requestId?: string;
}

/**
 * Options for updating navigation route preferences  
 */
export interface NavigationRouteUpdateOptions {
  /** Whether to avoid toll roads */
  avoidTolls?: boolean;
  /** Whether to avoid highways */
  avoidHighways?: boolean;
  /** Optional request ID for tracking this update request */
  requestId?: string;
}

/**
 * Options for stopping navigation
 */
export interface NavigationStopOptions {
  /** Optional request ID for stopping a specific navigation request */
  requestId?: string;
}

/**
 * 🧭 Navigation Manager
 * 
 * Handles navigation commands sent to the mobile device via the cloud.
 * Provides methods for starting navigation, updating route preferences,
 * and stopping navigation.
 * 
 * @example
 * ```typescript
 * // Start navigation
 * await session.navigation.startNavigation("Apple Park, Cupertino", {
 *   mode: "driving",
 *   avoidTolls: true
 * });
 * 
 * // Update route preferences
 * await session.navigation.updateRoutePreferences({
 *   avoidHighways: true
 * });
 * 
 * // Stop navigation
 * await session.navigation.stopNavigation();
 * ```
 */
export class NavigationManager {
  constructor(
    private packageName: string,
    private sessionId: string,
    private sendMessage: (message: any) => void,
    private session: any, // Reference to the parent AppSession
    private logger: Logger,
  ) {}

  /**
   * 🧭 Start navigation to a destination
   * 
   * @param destination - Destination address or location name
   * @param options - Navigation options including mode and request ID
   * @returns Promise that resolves when the navigation start command is sent
   * 
   * @example
   * ```typescript
   * // Basic navigation
   * await session.navigation.startNavigation("123 Main St, San Francisco, CA");
   * 
   * // Navigation with options
   * await session.navigation.startNavigation("Apple Park, Cupertino", {
   *   mode: "driving",
   *   requestId: "nav-001"
   * });
   * ```
   */
  async startNavigation(destination: string, options: NavigationStartOptions = {}): Promise<void> {
    try {
      const requestId = options.requestId || this.generateRequestId();
      
      this.logger.info({
        destination,
        mode: options.mode || "driving",
        requestId
      }, "Starting navigation");

      const message: AppNavigationStartRequest = {
        type: AppToCloudMessageType.NAVIGATION_START_REQUEST,
        packageName: this.packageName,
        destination,
        mode: options.mode || "driving",
        requestId,
        timestamp: new Date(),
      };

      this.sendMessage(message);
      
      this.logger.debug("Navigation start command sent successfully");
    } catch (error) {
      this.logger.error({ error, destination }, "Failed to start navigation");
      throw new Error(`Failed to start navigation: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 🛑 Stop current navigation
   * 
   * @param options - Stop options including optional request ID
   * @returns Promise that resolves when the navigation stop command is sent
   * 
   * @example
   * ```typescript
   * // Stop current navigation
   * await session.navigation.stopNavigation();
   * 
   * // Stop specific navigation by request ID
   * await session.navigation.stopNavigation({ requestId: "nav-001" });
   * ```
   */
  async stopNavigation(options: NavigationStopOptions = {}): Promise<void> {
    try {
      this.logger.info({
        requestId: options.requestId
      }, "Stopping navigation");

      const message: AppNavigationStopRequest = {
        type: AppToCloudMessageType.NAVIGATION_STOP_REQUEST,
        packageName: this.packageName,
        requestId: options.requestId,
        timestamp: new Date(),
      };

      this.sendMessage(message);
      
      this.logger.debug("Navigation stop command sent successfully");
    } catch (error) {
      this.logger.error({ error }, "Failed to stop navigation");
      throw new Error(`Failed to stop navigation: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * ⚙️ Update navigation route preferences
   * 
   * Updates route calculation preferences for the current navigation session.
   * Changes take effect on the next route calculation.
   * 
   * @param options - Route update options including toll/highway preferences
   * @returns Promise that resolves when the route update command is sent
   * 
   * @example
   * ```typescript
   * // Avoid tolls and highways
   * await session.navigation.updateRoutePreferences({
   *   avoidTolls: true,
   *   avoidHighways: true
   * });
   * 
   * // Allow tolls but avoid highways
   * await session.navigation.updateRoutePreferences({
   *   avoidTolls: false,
   *   avoidHighways: true
   * });
   * ```
   */
  async updateRoutePreferences(options: NavigationRouteUpdateOptions): Promise<void> {
    try {
      const requestId = options.requestId || this.generateRequestId();
      
      this.logger.info({
        avoidTolls: options.avoidTolls,
        avoidHighways: options.avoidHighways,
        requestId
      }, "Updating navigation route preferences");

      const message: AppNavigationRouteUpdateRequest = {
        type: AppToCloudMessageType.NAVIGATION_ROUTE_UPDATE_REQUEST,
        packageName: this.packageName,
        avoidTolls: options.avoidTolls,
        avoidHighways: options.avoidHighways,
        requestId,
        timestamp: new Date(),
      };

      this.sendMessage(message);
      
      this.logger.debug("Navigation route update command sent successfully");
    } catch (error) {
      this.logger.error({ error, options }, "Failed to update navigation route preferences");
      throw new Error(`Failed to update route preferences: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 🔄 Update session ID when session changes
   * @internal
   */
  updateSessionId(newSessionId: string): void {
    this.sessionId = newSessionId;
    this.logger.debug({ newSessionId }, "Navigation manager session ID updated");
  }

  /**
   * 🔧 Generate a unique request ID for tracking navigation commands
   * @private
   */
  private generateRequestId(): string {
    return `nav_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}