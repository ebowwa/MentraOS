/**
 * Dashboard Manager
 * 
 * Manages dashboard content and layouts across the system.
 * The dashboard provides contextual information to users through various modes:
 * - Main: Full dashboard experience with comprehensive information
 * - Expanded: More space for TPA content while maintaining essential info
 * - Always-on: Persistent minimal dashboard overlay on regular content
 */
import { 
  DashboardMode, 
  Layout, 
  DashboardContentUpdate,
  DashboardModeChange,
  DashboardSystemUpdate,
  TpaToCloudMessageType,
  CloudToGlassesMessageType,
  CloudToTpaMessageType,
  LayoutType,
  ViewType,
  DisplayRequest,
  TpaToCloudMessage,
  UserSession
} from '@augmentos/sdk';
import { logger } from '@augmentos/utils';
import { systemApps } from '../core/system-apps';
import { ExtendedUserSession } from '../core/session.service';

/**
 * Dashboard content from a TPA
 */
interface TpaContent {
  packageName: string;
  content: string | Layout;
  timestamp: Date;
}

/**
 * System dashboard content by section
 */
interface SystemContent {
  topLeft: string;
  topRight: string;
  bottomLeft: string;
  bottomRight: string;
}

/**
 * Dashboard manager configuration
 */
interface DashboardConfig {
  queueSize?: number;
  updateIntervalMs?: number;
  alwaysOnEnabled?: boolean;
}

/**
 * Dashboard manager implementation for a single user session
 */
export class DashboardManager {
  // Dashboard state
  private currentMode: DashboardMode | 'none' = 'none';
  private alwaysOnEnabled: boolean = false;
  
  // Content queues for each mode
  private mainContent: Map<string, TpaContent> = new Map();
  private expandedContent: Map<string, TpaContent> = new Map();
  private alwaysOnContent: Map<string, TpaContent> = new Map();
  
  // System dashboard content (managed by system.augmentos.dashboard TPA)
  private systemContent: SystemContent = {
    topLeft: '',
    topRight: '',
    bottomLeft: '',
    bottomRight: ''
  };
  
  // Configuration
  private queueSize: number;
  private updateIntervalMs: number;
  private updateInterval: NodeJS.Timeout | null = null;
  
  // Reference to the user session this dashboard belongs to
  private userSession: ExtendedUserSession;
  
  /**
   * Create a new DashboardManager for a specific user session
   * @param userSession The user session this dashboard belongs to
   * @param config Dashboard configuration options
   */
  constructor(userSession: ExtendedUserSession, config: DashboardConfig = {}) {
    // Store reference to user session
    this.userSession = userSession;
    
    // Set configuration with defaults
    this.queueSize = config.queueSize || 5;
    this.updateIntervalMs = config.updateIntervalMs || 500;
    this.alwaysOnEnabled = config.alwaysOnEnabled || false;
    
    // Start update interval
    this.startUpdateInterval();
    
    userSession.logger.info(`Dashboard Manager initialized for user ${userSession.userId}`);
  }
  
  /**
   * Start the update interval for dashboard rendering
   */
  private startUpdateInterval(): void {
    // Clear any existing interval
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    
    // Create new interval for periodic updates
    this.updateInterval = setInterval(() => {
      this.updateDashboard();
    }, this.updateIntervalMs);
  }
  
  /**
   * Process TPA message and route to the appropriate handler
   * This function will be called from WebSocketService
   * @param message TPA message
   * @returns True if the message was handled, false otherwise
   */
  public handleTpaMessage(message: TpaToCloudMessage): boolean {
    try {
      switch (message.type) {
        case TpaToCloudMessageType.DASHBOARD_CONTENT_UPDATE:
          this.handleDashboardContentUpdate(message as DashboardContentUpdate);
          return true;
          
        case TpaToCloudMessageType.DASHBOARD_MODE_CHANGE:
          this.handleDashboardModeChange(message as DashboardModeChange);
          return true;
          
        case TpaToCloudMessageType.DASHBOARD_SYSTEM_UPDATE:
          this.handleDashboardSystemUpdate(message as DashboardSystemUpdate);
          return true;
          
        default:
          return false; // Not a dashboard message
      }
    } catch (error) {
      this.userSession.logger.error('Error handling dashboard message', error);
      return false;
    }
  }
  
  /**
   * Handle TPA disconnection to clean up dashboard content
   * @param packageName TPA package name
   */
  public handleTpaDisconnected(packageName: string): void {
    // Clean up content when a TPA disconnects
    this.cleanupAppContent(packageName);
    logger.info(`Cleaned up dashboard content for disconnected TPA: ${packageName}`);
  }
  
  /**
   * Handle dashboard content update from a TPA
   * @param message Content update message
   */
  public handleDashboardContentUpdate(message: DashboardContentUpdate): void {
    const { packageName, content, modes, timestamp } = message;
    
    this.userSession.logger.debug(`Dashboard content update from ${packageName}`, { 
      modes,
      timestamp: new Date(timestamp).toISOString()
    });
    
    // Add content to each requested mode's queue
    modes.forEach(mode => {
      switch (mode) {
        case DashboardMode.MAIN:
          this.mainContent.set(packageName, { packageName, content, timestamp });
          break;
        case DashboardMode.EXPANDED:
          this.expandedContent.set(packageName, { packageName, content, timestamp });
          break;
        case DashboardMode.ALWAYS_ON:
          this.alwaysOnContent.set(packageName, { packageName, content, timestamp });
          break;
      }
    });
    
    // Update the dashboard immediately
    this.updateDashboard();
  }
  
  /**
   * Handle dashboard mode change from system dashboard TPA
   * @param message Mode change message
   */
  public handleDashboardModeChange(message: DashboardModeChange): void {
    const { packageName, mode } = message;
    
    // Only allow system dashboard to change mode
    if (packageName !== systemApps.dashboard.packageName) {
      this.userSession.logger.warn(`Unauthorized dashboard mode change from ${packageName}`);
      return;
    }
    
    this.userSession.logger.info(`Dashboard mode changed to ${mode}`);
    
    // Update mode
    this.setDashboardMode(mode);
  }
  
  /**
   * Handle system dashboard content update
   * @param message System dashboard update message
   */
  public handleDashboardSystemUpdate(message: DashboardSystemUpdate): void {
    const { packageName, section, content } = message;
    
    // Only allow system dashboard to update system sections
    if (packageName !== systemApps.dashboard.packageName) {
      this.userSession.logger.warn(`Unauthorized system dashboard update from ${packageName}`);
      return;
    }
    
    this.userSession.logger.debug(`System dashboard update for ${section} from ${packageName}`);
    
    // Update the appropriate section
    this.systemContent[section] = content;
    
    // Update the dashboard
    this.updateDashboard();
  }
  
  /**
   * Update dashboard display based on current mode and content
   */
  private updateDashboard(): void {
    // Skip if mode is none
    if (this.currentMode === 'none') {
      return;
    }
    
    try {
      // Generate layout based on current mode
      let layout: Layout;
      
      switch (this.currentMode) {
        case DashboardMode.MAIN:
          layout = this.generateMainLayout();
          break;
        case DashboardMode.EXPANDED:
          layout = this.generateExpandedLayout();
          break;
        case DashboardMode.ALWAYS_ON:
          layout = this.generateAlwaysOnLayout();
          break;
      }
      
      // Create a display request
      const displayRequest: DisplayRequest = {
        type: TpaToCloudMessageType.DISPLAY_REQUEST,
        packageName: systemApps.dashboard.packageName,
        view: ViewType.DASHBOARD,
        layout,
        timestamp: new Date(),
        // We don't set a durationMs to keep it displayed indefinitely
      };
      
      // Send the display request using the session's DisplayManager
      this.sendDisplayRequest(displayRequest);
    } catch (error) {
      this.userSession.logger.error('Error updating dashboard', error);
    }
  }
  
  /**
   * Send display request to the associated user session
   * @param displayRequest Display request to send
   */
  private sendDisplayRequest(displayRequest: DisplayRequest): void {
    try {
      // Use the DisplayManager to send the display request
      this.userSession.displayManager.handleDisplayEvent(displayRequest, this.userSession);
    } catch (error) {
      this.userSession.logger.error(`Error sending dashboard display request`, error);
    }
  }
  
  /**
   * Generate layout for main dashboard mode
   * @returns Layout for main dashboard
   */
  private generateMainLayout(): Layout {
    // Format the top section (combine system info and notifications)
    const topText = this.formatSystemTopSection();
    
    // Format the bottom section (combine system info and TPA content)
    const bottomText = this.formatSystemBottomSection();
    
    // Return a DoubleTextWall layout for compatibility with existing system
    return {
      layoutType: LayoutType.DOUBLE_TEXT_WALL,
      topText,
      bottomText
    };
  }
  
  /**
   * Format the top section of the dashboard (system info and notifications)
   * @returns Formatted top section text
   */
  private formatSystemTopSection(): string {
    // First line: Time and battery status on the same line
    const systemLine = `${this.systemContent.topLeft}, ${this.systemContent.topRight}`;
    
    // If there's notification content, add it after system info
    if (this.systemContent.bottomLeft) {
      return `${systemLine}\n${this.systemContent.bottomLeft}`;
    }
    
    return systemLine;
  }
  
  /**
   * Format the bottom section of the dashboard (system info and TPA content)
   * @returns Formatted bottom section text
   */
  private formatSystemBottomSection(): string {
    // Start with TPA content
    const tpaContent = this.getCombinedTpaContent(this.mainContent);
    
    // If there's system content for the bottom right, add it after TPA content
    if (this.systemContent.bottomRight) {
      return tpaContent ? `${tpaContent}\n\n${this.systemContent.bottomRight}` : this.systemContent.bottomRight;
    }
    
    return tpaContent;
  }
  
  /**
   * Generate layout for expanded dashboard mode
   * @returns Layout for expanded dashboard
   */
  private generateExpandedLayout(): Layout {
    // Format the top section (condensed system info)
    const topText = `${this.systemContent.topLeft} | ${this.systemContent.topRight}`;
    
    // Format the bottom section (TPA content with more space)
    // For expanded mode, we want to give more space to TPA content
    const bottomText = this.getCombinedTpaContent(this.expandedContent);
    
    // Return a DoubleTextWall layout for expanded mode
    return {
      layoutType: LayoutType.DOUBLE_TEXT_WALL,
      topText,
      bottomText
    };
  }
  
  /**
   * Generate layout for always-on dashboard mode
   * @returns Layout for always-on dashboard
   */
  private generateAlwaysOnLayout(): Layout {
    // For always-on mode, we use a dashboard card layout
    // This is more compact and suited for persistent display
    
    // Left side shows essential system info (time)
    const leftText = this.systemContent.topLeft;
    
    // Right side combines battery status and a single TPA content item
    const tpaContent = this.getCombinedTpaContent(this.alwaysOnContent, 1);
    const rightText = tpaContent 
      ? `${this.systemContent.topRight}\n${tpaContent}`
      : this.systemContent.topRight;
    
    return {
      layoutType: LayoutType.DASHBOARD_CARD,
      leftText,
      rightText
    };
  }
  
  /**
   * Combine TPA content from a queue into a single string
   * @param contentQueue Queue of TPA content
   * @param limit Optional limit on number of items to include
   * @returns Combined content string
   */
  private getCombinedTpaContent(contentQueue: Map<string, TpaContent>, limit?: number): string {
    // Sort by timestamp (newest first)
    const sortedContent = Array.from(contentQueue.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit || this.queueSize);
    
    // If no content, return empty string
    if (sortedContent.length === 0) {
      return '';
    }
    
    // Join content with separator
    return sortedContent
      .map(item => {
        if (typeof item.content === 'string') {
          return item.content;
        } else {
          // For Layout content, extract the text based on the layout type
          switch (item.content.layoutType) {
            case LayoutType.TEXT_WALL:
              return item.content.text || '';
            case LayoutType.DOUBLE_TEXT_WALL:
              return [item.content.topText, item.content.bottomText]
                .filter(Boolean)
                .join('\n');
            case LayoutType.DASHBOARD_CARD:
              return [item.content.leftText, item.content.rightText]
                .filter(Boolean)
                .join(' | ');
            default:
              return ''; 
          }
        }
      })
      .join('\n\n');
  }
  
  /**
   * Clean up content from a specific TPA
   * @param packageName TPA package name
   */
  public cleanupAppContent(packageName: string): void {
    // Remove from all content queues
    this.mainContent.delete(packageName);
    this.expandedContent.delete(packageName);
    this.alwaysOnContent.delete(packageName);
    
    // Update the dashboard for all users
    this.updateDashboard();
  }
  
  /**
   * Set the current dashboard mode and notify clients
   * @param mode New dashboard mode
   */
  private setDashboardMode(mode: DashboardMode): void {
    // Update current mode
    this.currentMode = mode;
    
    // Notify TPAs of mode change
    const modeChangeMessage = {
      type: CloudToTpaMessageType.DASHBOARD_MODE_CHANGED,
      mode,
      timestamp: new Date()
    };
    
    // Broadcast mode change to all connected TPAs
    this.broadcastToAllTpas(modeChangeMessage);
    
    // Update the dashboard
    this.updateDashboard();
  }
  
  /**
   * Set the always-on dashboard state
   * @param enabled Whether always-on dashboard is enabled
   */
  public setAlwaysOnEnabled(enabled: boolean): void {
    // Update state
    this.alwaysOnEnabled = enabled;
    
    // Notify TPAs of state change
    const alwaysOnMessage = {
      type: CloudToTpaMessageType.DASHBOARD_ALWAYS_ON_CHANGED,
      enabled,
      timestamp: new Date()
    };
    
    // Broadcast always-on state change to all connected TPAs
    this.broadcastToAllTpas(alwaysOnMessage);
    
    // Update the dashboard
    this.updateDashboard();
  }
  
  /**
   * Broadcast a message to all TPAs connected to this user session
   * @param message Message to broadcast
   */
  private broadcastToAllTpas(message: any): void {
    try {
      // Use the appConnections map to send to all connected TPAs
      this.userSession.appConnections.forEach((ws, packageName) => {
        try {
          if (ws && ws.readyState === WebSocket.OPEN) {
            const tpaMessage = {
              ...message,
              sessionId: `${this.userSession.sessionId}-${packageName}`
            };
            ws.send(JSON.stringify(tpaMessage));
          }
        } catch (error) {
          this.userSession.logger.error(`Error sending dashboard message to TPA ${packageName}`, error);
        }
      });
    } catch (error) {
      this.userSession.logger.error(`Error broadcasting dashboard message`, error);
    }
  }
  
  /**
   * Get the current dashboard mode
   * @returns Current dashboard mode
   */
  public getCurrentMode(): DashboardMode | 'none' {
    return this.currentMode;
  }
  
  /**
   * Check if always-on dashboard is enabled
   * @returns Always-on dashboard state
   */
  public isAlwaysOnEnabled(): boolean {
    return this.alwaysOnEnabled;
  }
  
  /**
   * Clean up resources when shutting down
   */
  public dispose(): void {
    // Clear update interval
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    
    // Clear all content
    this.mainContent.clear();
    this.expandedContent.clear();
    this.alwaysOnContent.clear();
    
    logger.info('Dashboard Manager disposed');
  }
}