/**
 * Dashboard API Implementation
 * 
 * Provides dashboard functionality for TPAs, allowing them to write content
 * to the dashboard and respond to dashboard mode changes.
 */
import { systemApps } from '../../constants';
import { 
  DashboardAPI, 
  DashboardContentAPI, 
  DashboardMode, 
  DashboardSystemAPI,
  DashboardContentUpdate,
  DashboardModeChange,
  DashboardSystemUpdate
} from '../../types/dashboard';
import { TpaToCloudMessageType } from '../../types/message-types';
import { Layout } from '../../types/layouts';
import { EventManager } from './events';

/**
 * Mock implementation of TpaSession needed for sessionId
 */
class TpaSession {
  private static sessionId: string = '';
  
  /**
   * Get the current TPA session ID
   * This is a workaround to avoid circular dependencies
   */
  public static getSessionId(): string {
    return TpaSession.sessionId || 'unknown-session-id';
  }
  
  /**
   * Set the TPA session ID - called from index.ts
   */
  public static setSessionId(id: string): void {
    TpaSession.sessionId = id;
  }
}

/**
 * Implementation of DashboardSystemAPI interface for system dashboard TPA
 */
class DashboardSystemManager implements DashboardSystemAPI {
  constructor(
    private packageName: string,
    private send: (message: any) => void
  ) {}

  setTopLeft(content: string): void {
    this.updateSystemSection('topLeft', content);
  }

  setTopRight(content: string): void {
    this.updateSystemSection('topRight', content);
  }

  setBottomLeft(content: string): void {
    this.updateSystemSection('bottomLeft', content);
  }

  setBottomRight(content: string): void {
    this.updateSystemSection('bottomRight', content);
  }

  setViewMode(mode: DashboardMode): void {
    const message: DashboardModeChange = {
      type: TpaToCloudMessageType.DASHBOARD_MODE_CHANGE,
      packageName: this.packageName,
      sessionId: `${TpaSession.getSessionId()}-${this.packageName}`,
      mode,
      timestamp: new Date()
    };
    this.send(message);
  }

  private updateSystemSection(section: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight', content: string): void {
    const message: DashboardSystemUpdate = {
      type: TpaToCloudMessageType.DASHBOARD_SYSTEM_UPDATE,
      packageName: this.packageName,
      sessionId: `${TpaSession.getSessionId()}-${this.packageName}`,
      section,
      content,
      timestamp: new Date()
    };
    this.send(message);
  }
}

/**
 * Implementation of DashboardContentAPI interface for all TPAs
 */
class DashboardContentManager implements DashboardContentAPI {
  private currentMode: DashboardMode | 'none' = 'none';
  private alwaysOnEnabled: boolean = false;
  
  constructor(
    private packageName: string,
    private send: (message: any) => void,
    private events: EventManager
  ) {}

  write(content: string, targets: DashboardMode[] = [DashboardMode.MAIN]): void {
    const message: DashboardContentUpdate = {
      type: TpaToCloudMessageType.DASHBOARD_CONTENT_UPDATE,
      packageName: this.packageName,
      sessionId: `${TpaSession.getSessionId()}-${this.packageName}`,
      content,
      modes: targets,
      timestamp: new Date()
    };
    this.send(message);
  }

  writeToMain(content: string): void {
    this.write(content, [DashboardMode.MAIN]);
  }

  writeToExpanded(content: string): void {
    const message: DashboardContentUpdate = {
      type: TpaToCloudMessageType.DASHBOARD_CONTENT_UPDATE,
      packageName: this.packageName,
      sessionId: `${TpaSession.getSessionId()}-${this.packageName}`,
      content,
      modes: [DashboardMode.EXPANDED],
      timestamp: new Date()
    };
    this.send(message);
  }

  writeToAlwaysOn(content: string): void {
    this.write(content, [DashboardMode.ALWAYS_ON]);
  }

  async getCurrentMode(): Promise<DashboardMode | 'none'> {
    return this.currentMode;
  }

  async isAlwaysOnEnabled(): Promise<boolean> {
    return this.alwaysOnEnabled;
  }

  onModeChange(callback: (mode: DashboardMode | 'none') => void): () => void {
    return this.events.onDashboardModeChange((data) => {
      this.currentMode = data.mode;
      callback(data.mode);
    });
  }
  
  onAlwaysOnChange(callback: (enabled: boolean) => void): () => void {
    return this.events.onDashboardAlwaysOnChange((data) => {
      this.alwaysOnEnabled = data.enabled;
      callback(data.enabled);
    });
  }

  // Internal methods to update state
  setCurrentMode(mode: DashboardMode | 'none'): void {
    this.currentMode = mode;
    this.events.emit('dashboard_mode_change', { mode });
  }

  setAlwaysOnEnabled(enabled: boolean): void {
    this.alwaysOnEnabled = enabled;
    this.events.emit('dashboard_always_on_change', { enabled });
  }
}

/**
 * Creates a Dashboard API instance based on the TPA package name
 * @param packageName TPA package name
 * @param send Function to send messages to the cloud
 * @param events EventManager instance to handle event subscriptions
 * @returns Dashboard API instance
 */
export function createDashboardAPI(
  packageName: string,
  send: (message: any) => void,
  events: EventManager
): DashboardAPI {
  // Create content API (available to all TPAs)
  const content = new DashboardContentManager(packageName, send, events);
  
  // Check if this is the system dashboard TPA
  const isSystemDashboard = packageName === systemApps.dashboard.packageName;
  
  // Create API based on TPA type
  const api: DashboardAPI = {
    content
  };
  
  // Add system API if this is the system dashboard TPA
  if (isSystemDashboard) {
    api.system = new DashboardSystemManager(packageName, send);
  }
  
  return api;
}

// Export TpaSession class for sessionId management
export { TpaSession };