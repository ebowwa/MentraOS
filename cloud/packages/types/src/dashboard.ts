// src/dashboard.ts

import { AppToCloudMessageType } from './messages/app-cloud';

/**
 * Dashboard modes supported by the system
 */
export enum DashboardMode {
    MAIN = 'main',           // Full dashboard experience
    EXPANDED = 'expanded',   // More space for App content
    // ALWAYS_ON = 'always_on'  // Persistent minimal dashboard
}

/**
 * Message to update dashboard content
 */
export interface DashboardContentUpdate {
    type: AppToCloudMessageType.DASHBOARD_CONTENT_UPDATE;
    packageName: string;
    sessionId: string;
    content: string;
    modes: DashboardMode[];
    timestamp: Date;
}

/**
 * Message for dashboard mode change
 */
export interface DashboardModeChange {
    type: AppToCloudMessageType.DASHBOARD_MODE_CHANGE;
    packageName: string;
    sessionId: string;
    mode: DashboardMode;
    timestamp: Date;
}

/**
 * Message to update system dashboard content
 */
export interface DashboardSystemUpdate {
    type: AppToCloudMessageType.DASHBOARD_SYSTEM_UPDATE;
    packageName: string;
    sessionId: string;
    section: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';
    content: string;
    timestamp: Date;
}

/**
 * Union type of all dashboard message types
 */
export type DashboardMessage =
    | DashboardContentUpdate
    | DashboardModeChange
    | DashboardSystemUpdate;

/**
 * API for managing dashboard content
 */
export interface DashboardContentAPI {
    update(content: string, modes?: DashboardMode[]): Promise<void>;
    clear(modes?: DashboardMode[]): Promise<void>;
}

/**
 * API for managing system dashboard content
 */
export interface DashboardSystemAPI {
    update(section: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight', content: string): Promise<void>;
    clear(section: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight'): Promise<void>;
}

/**
 * Main Dashboard API interface
 */
export interface DashboardAPI {
    mode: DashboardMode;
    setMode(mode: DashboardMode): Promise<void>;
    content: DashboardContentAPI;
    system?: DashboardSystemAPI;
}
