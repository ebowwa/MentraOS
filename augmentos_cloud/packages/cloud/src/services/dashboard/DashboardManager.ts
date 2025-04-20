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
  systemApps,
  DashboardContentUpdate,
  DashboardModeChange,
  DashboardSystemUpdate,
  TpaToCloudMessageType,
  CloudToGlassesMessageType,
  CloudToTpaMessageType,
  LayoutType,
  ViewType
} from '@augmentos/sdk';
import { logger } from '@augmentos/utils';
import { DisplayManager } from '../display/DisplayManager';
import { WebSocketService } from '../core/websocket.service';

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
 * Dashboard manager implementation
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
  
  /**
   * Create a new DashboardManager
   * @param wsService WebSocketService for message passing
   * @param displayManager DisplayManager for rendering layouts
   * @param config Dashboard configuration options
   */
  constructor(
    private wsService: WebSocketService,
    private displayManager: DisplayManager,
    config: DashboardConfig = {}
  ) {
    // Set configuration with defaults
    this.queueSize = config.queueSize || 5;
    this.updateIntervalMs = config.updateIntervalMs || 500;
    this.alwaysOnEnabled = config.alwaysOnEnabled || false;
    
    // Start update interval
    this.startUpdateInterval();
    
    // Register message handlers
    this.registerMessageHandlers();
    
    logger.info('Dashboard Manager initialized');
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
   * Register handlers for dashboard-related messages
   */
  private registerMessageHandlers(): void {
    // Register TPA message handler
    this.wsService.registerTpaMessageHandler(
      TpaToCloudMessageType.DASHBOARD_CONTENT_UPDATE,
      this.handleDashboardContentUpdate.bind(this)
    );
    
    this.wsService.registerTpaMessageHandler(
      TpaToCloudMessageType.DASHBOARD_MODE_CHANGE,
      this.handleDashboardModeChange.bind(this)
    );
    
    this.wsService.registerTpaMessageHandler(
      TpaToCloudMessageType.DASHBOARD_SYSTEM_UPDATE,
      this.handleDashboardSystemUpdate.bind(this)
    );
    
    // Handle app stop events to clean up dashboard content
    this.wsService.onTpaDisconnected((packageName: string) => {
      this.cleanupAppContent(packageName);
    });
  }
  
  /**
   * Handle dashboard content update from a TPA
   * @param message Content update message
   */
  private handleDashboardContentUpdate(message: DashboardContentUpdate): void {
    const { packageName, content, modes, timestamp } = message;
    
    logger.debug(`Dashboard content update from ${packageName}`, { 
      modes,
      timestamp: timestamp.toISOString()
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
    
    // Update the dashboard
    this.updateDashboard();
  }
  
  /**
   * Handle dashboard mode change from system dashboard TPA
   * @param message Mode change message
   */
  private handleDashboardModeChange(message: DashboardModeChange): void {
    const { packageName, mode } = message;
    
    // Only allow system dashboard to change mode
    if (packageName !== systemApps.dashboard.packageName) {
      logger.warn(`Unauthorized dashboard mode change from ${packageName}`);
      return;
    }
    
    logger.info(`Dashboard mode changed to ${mode}`);
    
    // Update mode
    this.setDashboardMode(mode);
  }
  
  /**
   * Handle system dashboard content update
   * @param message System dashboard update message
   */
  private handleDashboardSystemUpdate(message: DashboardSystemUpdate): void {
    const { packageName, section, content } = message;
    
    // Only allow system dashboard to update system sections
    if (packageName !== systemApps.dashboard.packageName) {
      logger.warn(`Unauthorized system dashboard update from ${packageName}`);
      return;
    }
    
    logger.debug(`System dashboard update for ${section}`);
    
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
      
      // Send layout to display manager
      // Use ViewType.DASHBOARD to ensure it appears in the dashboard area
      this.displayManager.show(
        systemApps.dashboard.packageName, 
        layout, 
        { view: ViewType.DASHBOARD }
      );
      
      // Notes on always-on functionality:
      // Since the current DisplayManager might not support overlay functionality,
      // we're not implementing the always-on overlay here.
      // The system dashboard TPA will need to toggle between modes instead.
      // For future enhancement: implement overlay capability in DisplayManager
    } catch (error) {
      logger.error('Error updating dashboard', error);
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
          // For more complex layouts, we would need a better conversion strategy
          // For now, just extract text from layout sections
          return Object.values(item.content.sections || {}).join(' | ');
        }
      })
      .join('\n\n');
  }
  
  /**
   * Clean up content from a specific TPA
   * @param packageName TPA package name
   */
  private cleanupAppContent(packageName: string): void {
    // Remove from all content queues
    this.mainContent.delete(packageName);
    this.expandedContent.delete(packageName);
    this.alwaysOnContent.delete(packageName);
    
    // Update the dashboard
    this.updateDashboard();
  }
  
  /**
   * Set the current dashboard mode and notify clients
   * @param mode New dashboard mode
   */
  private setDashboardMode(mode: DashboardMode): void {
    // Update current mode
    this.currentMode = mode;
    
    // Notify glasses of mode change
    this.wsService.broadcastToGlasses({
      type: CloudToGlassesMessageType.DASHBOARD_MODE_CHANGE,
      mode,
      timestamp: new Date()
    });
    
    // Notify TPAs of mode change
    this.wsService.broadcastToTpas({
      type: CloudToTpaMessageType.DASHBOARD_MODE_CHANGED,
      mode,
      timestamp: new Date()
    });
    
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
    
    // Notify glasses of state change
    this.wsService.broadcastToGlasses({
      type: CloudToGlassesMessageType.DASHBOARD_ALWAYS_ON_CHANGE,
      enabled,
      timestamp: new Date()
    });
    
    // Notify TPAs of state change
    this.wsService.broadcastToTpas({
      type: CloudToTpaMessageType.DASHBOARD_ALWAYS_ON_CHANGED,
      enabled,
      timestamp: new Date()
    });
    
    // Update the dashboard
    this.updateDashboard();
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