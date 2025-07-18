/**
 * DisplayManager - Tracks dashboard/main view state and display content
 */

import { Layout, ViewType, DisplayRequest } from '../types/sdk-types';

export class DisplayManager {
  private headPosition: 'up' | 'down' = 'down';
  private dashboardEnabled = true; // Assume dashboard is enabled by default
  private mainViewContent: Layout | null = null;
  private dashboardViewContent: Layout | null = null;

  /**
   * Update head position
   */
  setHeadPosition(position: 'up' | 'down'): void {
    this.headPosition = position;
  }

  /**
   * Get current head position
   */
  getHeadPosition(): 'up' | 'down' {
    return this.headPosition;
  }

  /**
   * Update display content from cloud
   */
  updateDisplay(layout: Layout, view?: ViewType): void {
    // Determine which view this content is for
    // If view is specified, use that; otherwise use current head position
    const targetView = view || (this.headPosition === 'up' && this.dashboardEnabled ? 'dashboard' : 'main');
    
    if (targetView === 'dashboard') {
      this.dashboardViewContent = layout;
    } else {
      this.mainViewContent = layout;
    }
  }

  /**
   * Get currently visible content based on head position and dashboard state
   */
  getVisibleContent(): DisplayRequest | null {
    const currentView = this.getCurrentView();
    
    if (currentView === 'dashboard' && this.dashboardViewContent) {
      return {
        type: 'display_event',
        packageName: 'system.dashboard',
        view: ViewType.DASHBOARD,
        layout: this.dashboardViewContent
      };
    } else if (currentView === 'main' && this.mainViewContent) {
      return {
        type: 'display_event',
        packageName: 'unknown',
        view: ViewType.MAIN,
        layout: this.mainViewContent
      };
    }
    
    return null;
  }

  /**
   * Get the current view based on head position and dashboard state
   */
  getCurrentView(): ViewType {
    if (this.dashboardEnabled && this.headPosition === 'up' && this.dashboardViewContent) {
      return ViewType.DASHBOARD;
    } else if (this.mainViewContent) {
      return ViewType.MAIN;
    } else {
      return ViewType.MAIN; // Default fallback
    }
  }

  /**
   * Get main view content
   */
  getMainViewContent(): Layout | null {
    return this.mainViewContent;
  }

  /**
   * Get dashboard view content
   */
  getDashboardViewContent(): Layout | null {
    return this.dashboardViewContent;
  }

  /**
   * Check if dashboard is enabled
   */
  isDashboardEnabled(): boolean {
    return this.dashboardEnabled;
  }

  /**
   * Enable or disable dashboard
   */
  setDashboardEnabled(enabled: boolean): void {
    this.dashboardEnabled = enabled;
  }

  /**
   * Clear all display content
   */
  clearDisplays(): void {
    this.mainViewContent = null;
    this.dashboardViewContent = null;
  }

  /**
   * Get display state summary
   */
  getDisplayState(): {
    currentView: ViewType;
    headPosition: 'up' | 'down';
    dashboardEnabled: boolean;
    hasMainContent: boolean;
    hasDashboardContent: boolean;
    visibleContent: DisplayRequest | null;
  } {
    return {
      currentView: this.getCurrentView(),
      headPosition: this.headPosition,
      dashboardEnabled: this.dashboardEnabled,
      hasMainContent: this.mainViewContent !== null,
      hasDashboardContent: this.dashboardViewContent !== null,
      visibleContent: this.getVisibleContent()
    };
  }
}