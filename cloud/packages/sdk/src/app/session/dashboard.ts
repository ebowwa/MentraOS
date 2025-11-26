/**
 * Dashboard API Implementation
 *
 * Provides dashboard functionality for Apps, allowing them to write content
 * to the dashboard and respond to dashboard mode changes.
 */
// import { systemApps } from '../../constants';
import {
  DashboardAPI,
  DashboardContentAPI,
  DashboardMode,
  DashboardSystemAPI,
  DashboardContentUpdate,
  DashboardModeChange,
  DashboardSystemUpdate,
} from "../../types"
import { AppToCloudMessageType } from "../../types"
import { EventManager } from "./events"

// Import AppSession interface for typing
import type { AppSession } from "./index"
import dotenv from "dotenv"
// Load environment variables from .env file
dotenv.config()

const SYSTEM_DASHBOARD_PACKAGE_NAME = process.env.SYSTEM_DASHBOARD_PACKAGE_NAME || "system.augmentos.dashboard"

/**
 * Implementation of DashboardSystemAPI interface for system dashboard App
 */
export class DashboardSystemManager implements DashboardSystemAPI {
  private session: AppSession
  private packageName: string

  constructor(session: AppSession, packageName: string) {
    this.session = session
    this.packageName = packageName
  }

  async update(section: "topLeft" | "topRight" | "bottomLeft" | "bottomRight", content: string): Promise<void> {
    this.updateSystemSection(section, content)
  }

  async clear(section: "topLeft" | "topRight" | "bottomLeft" | "bottomRight"): Promise<void> {
    this.updateSystemSection(section, "")
  }

  setTopLeft(content: string): void {
    this.updateSystemSection("topLeft", content)
  }

  setTopRight(content: string): void {
    this.updateSystemSection("topRight", content)
  }

  setBottomLeft(content: string): void {
    this.updateSystemSection("bottomLeft", content)
  }

  setBottomRight(content: string): void {
    this.updateSystemSection("bottomRight", content)
  }

  setViewMode(mode: DashboardMode): void {
    const message: DashboardModeChange = {
      type: AppToCloudMessageType.DASHBOARD_MODE_CHANGE,
      packageName: this.packageName,
      sessionId: `${this.session.getSessionId()}-${this.packageName}`,
      mode,
      timestamp: new Date(),
    }
    this.session.sendMessage(message)
  }

  private updateSystemSection(section: "topLeft" | "topRight" | "bottomLeft" | "bottomRight", content: string): void {
    const message: DashboardSystemUpdate = {
      type: AppToCloudMessageType.DASHBOARD_SYSTEM_UPDATE,
      packageName: this.packageName,
      sessionId: `${this.session.getSessionId()}-${this.packageName}`,
      section,
      content,
      timestamp: new Date(),
    }
    this.session.sendMessage(message)
  }
}

/**
 * Implementation of DashboardContentAPI interface for all Apps
 */
export class DashboardContentManager implements DashboardContentAPI {
  private session: AppSession
  private packageName: string
  private events: EventManager
  private currentMode: DashboardMode | "none" = "none"
  // private alwaysOnEnabled: boolean = false;

  constructor(session: AppSession, packageName: string, events: EventManager) {
    this.session = session
    this.packageName = packageName
    this.events = events
  }

  async update(content: string, modes: DashboardMode[] = [DashboardMode.MAIN]): Promise<void> {
    this.write(content, modes)
  }

  async clear(modes: DashboardMode[] = [DashboardMode.MAIN]): Promise<void> {
    this.write("", modes)
  }

  write(content: string, targets: DashboardMode[] = [DashboardMode.MAIN]): void {
    const message: DashboardContentUpdate = {
      type: AppToCloudMessageType.DASHBOARD_CONTENT_UPDATE,
      packageName: this.packageName,
      sessionId: `${this.session.getSessionId()}-${this.packageName}`,
      content,
      modes: targets,
      timestamp: new Date(),
    }
    this.session.sendMessage(message)
  }

  writeToMain(content: string): void {
    this.write(content, [DashboardMode.MAIN])
  }

  writeToExpanded(content: string): void {
    const message: DashboardContentUpdate = {
      type: AppToCloudMessageType.DASHBOARD_CONTENT_UPDATE,
      packageName: this.packageName,
      sessionId: `${this.session.getSessionId()}-${this.packageName}`,
      content,
      modes: [DashboardMode.EXPANDED],
      timestamp: new Date(),
    }
    this.session.sendMessage(message)
  }

  // writeToAlwaysOn(content: string): void {
  //   this.write(content, [DashboardMode.ALWAYS_ON]);
  // }

  async getCurrentMode(): Promise<DashboardMode | "none"> {
    return this.currentMode
  }

  // async isAlwaysOnEnabled(): Promise<boolean> {
  //   return this.alwaysOnEnabled;
  // }

  onModeChange(callback: (mode: DashboardMode | "none") => void): () => void {
    return this.events.onDashboardModeChange((data) => {
      this.currentMode = data.mode
      callback(data.mode)
    })
  }

  // onAlwaysOnChange(callback: (enabled: boolean) => void): () => void {
  //   return this.events.onDashboardAlwaysOnChange((data) => {
  //     this.alwaysOnEnabled = data.enabled;
  //     callback(data.enabled);
  //   });
  // }

  // Internal methods to update state
  setCurrentMode(mode: DashboardMode | "none"): void {
    this.currentMode = mode
    this.events.emit("dashboard_mode_change", { mode })
  }

  // setAlwaysOnEnabled(enabled: boolean): void {
  //   this.alwaysOnEnabled = enabled;
  //   this.events.emit('dashboard_always_on_change', { enabled });
  // }
}

/**
 * Dashboard Manager - Main class that manages dashboard functionality
 * Each AppSession instance gets its own DashboardManager instance
 */
export class DashboardManager implements DashboardAPI {
  public content: DashboardContentAPI
  public system?: DashboardSystemAPI
  public mode: DashboardMode = DashboardMode.MAIN // Default mode

  constructor(session: AppSession) {
    const packageName = session.getPackageName()
    const events = session.events

    // Create content API (available to all Apps)
    this.content = new DashboardContentManager(session, packageName, events)

    // Add system API if this is the system dashboard App
    if (packageName === SYSTEM_DASHBOARD_PACKAGE_NAME) {
      session.logger.info({ service: "SDK:DashboardManager" }, "Initializing system dashboard manager")
      this.system = new DashboardSystemManager(session, packageName)
    } else {
      session.logger.info({ service: "SDK:DashboardManager" }, `Not the system dashboard: ${packageName}`)
    }
  }

  async setMode(mode: DashboardMode): Promise<void> {
    this.mode = mode
    // If we had a way to request mode change from cloud, we'd do it here
    // For now, this just updates local state
    // If this is the system dashboard, it can actually change the mode
    if (this.system) {
      // Cast to DashboardSystemManager to access setViewMode
      (this.system as any).setViewMode(mode)
    }
  }
}
