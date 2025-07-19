/**
 * AppManager - Tracks app lifecycle and state
 */

export class AppManager {
  private runningApps: Set<string> = new Set();
  private loadingApps: Set<string> = new Set();
  private isTranscribing = false;

  /**
   * Mark an app as loading
   */
  setAppLoading(packageName: string): void {
    this.loadingApps.add(packageName);
  }

  /**
   * Update app state from cloud messages
   */
  updateAppState(userSession: {
    activeAppSessions: string[];
    loadingApps: string[];
    isTranscribing: boolean;
  }): void {
    // Update running apps
    this.runningApps.clear();
    userSession.activeAppSessions.forEach(app => {
      this.runningApps.add(app);
    });

    // Update loading apps
    this.loadingApps.clear();
    userSession.loadingApps.forEach(app => {
      this.loadingApps.add(app);
    });

    // Update transcription state
    this.isTranscribing = userSession.isTranscribing;
  }

  /**
   * Get list of currently running apps
   */
  getRunningApps(): string[] {
    return Array.from(this.runningApps);
  }

  /**
   * Get list of currently loading apps
   */
  getLoadingApps(): string[] {
    return Array.from(this.loadingApps);
  }

  /**
   * Check if a specific app is running
   */
  isAppRunning(packageName: string): boolean {
    return this.runningApps.has(packageName);
  }

  /**
   * Check if a specific app is loading
   */
  isAppLoading(packageName: string): boolean {
    return this.loadingApps.has(packageName);
  }

  /**
   * Check if transcription is active
   */
  getTranscriptionState(): boolean {
    return this.isTranscribing;
  }

  /**
   * Get full app state
   */
  getAppState(): {
    running: string[];
    loading: string[];
    isTranscribing: boolean;
  } {
    return {
      running: this.getRunningApps(),
      loading: this.getLoadingApps(),
      isTranscribing: this.isTranscribing
    };
  }

  /**
   * Reset all app state
   */
  reset(): void {
    this.runningApps.clear();
    this.loadingApps.clear();
    this.isTranscribing = false;
  }
}