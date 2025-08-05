/**
 * @fileoverview MicrophoneManager manages microphone state within a user session.
 * It encapsulates all microphone-related functionality that was previously
 * scattered throughout the WebSocket service.
 *
 * This follows the pattern used by other managers like DisplayManager and DashboardManager.
 */

import WebSocket from 'ws';
import {
  CloudToGlassesMessageType,
  MicrophoneStateChange,
  StreamType,
} from '@mentra/sdk';
import subscriptionService from './subscription.service';
import { Logger } from 'pino';
import UserSession from './UserSession';

/**
 * Manages microphone state for a user session
 */
export class MicrophoneManager {
  private session: UserSession;
  private logger: Logger;

  // Track the current microphone state
  private enabled: boolean = false;

  // Debounce mechanism for state changes
  private debounceTimer: NodeJS.Timeout | null = null;
  private pendingState: boolean | null = null;
  private lastSentState: boolean = false;
  private lastSentRequiredData: Array<'pcm' | 'transcription' | 'pcm_or_transcription'> = [];
  private pendingRequiredData: Array<'pcm' | 'transcription' | 'pcm_or_transcription'> | null = null;

  // Debounce mechanism for subscription changes
  private subscriptionDebounceTimer: NodeJS.Timeout | null = null;

  constructor(session: UserSession) {
    this.session = session;
    this.logger = session.logger.child({ service: 'MicrophoneManager' });
    this.logger.info('MicrophoneManager initialized');
  }

  /**
   * Update the microphone state with debouncing
   * Replicates the exact behavior of the original sendDebouncedMicrophoneStateChange
   *
   * @param isEnabled - Whether the microphone should be enabled
   * @param requiredData - Array of required data types
   * @param delay - Debounce delay in milliseconds (default: 1000ms)
   */
  updateState(isEnabled: boolean, requiredData: Array<'pcm' | 'transcription' | 'pcm_or_transcription'>, delay: number = 1000): void {
    this.logger.debug(`Updating microphone state: ${isEnabled}, delay: ${delay}ms`);

    if (this.debounceTimer === null) {
      // First call: send immediately and update lastSentState
      this.sendStateChangeToGlasses(isEnabled, requiredData);
      this.lastSentState = isEnabled;
      this.pendingState = isEnabled;
      this.lastSentRequiredData = Array.from(requiredData);
      this.pendingRequiredData = Array.from(requiredData);
      this.enabled = isEnabled;
    } else {
      // For subsequent calls, update pending state
      this.pendingState = isEnabled;
      this.pendingRequiredData = Array.from(requiredData);

      // Clear existing timer
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    // Set or reset the debounce timer
    this.debounceTimer = setTimeout(() => {
      // Only send if the final state differs from the last sent state
      // Also compare that all elements of the array are the same
      if (this.pendingState !== this.lastSentState || this.hasRequiredDataChanged(this.pendingRequiredData!, this.lastSentRequiredData!)) {
        this.logger.info(`Sending debounced microphone state change: ${this.pendingState}`);
        this.sendStateChangeToGlasses(this.pendingState!, this.pendingRequiredData!);
        this.lastSentState = this.pendingState!;
        this.lastSentRequiredData = this.pendingRequiredData!;
        this.enabled = this.pendingState!;
      }

      // Update transcription service state
      this.updateTranscriptionState();

      // Cleanup: reset debounce timer
      this.debounceTimer = null;
      this.pendingState = null;
      this.pendingRequiredData = null;
    }, delay);
  }

  private hasRequiredDataChanged(newRequiredData: Array<'pcm' | 'transcription' | 'pcm_or_transcription'>, oldRequiredData: Array<'pcm' | 'transcription' | 'pcm_or_transcription'>): boolean {
    return newRequiredData.length !== oldRequiredData.length || newRequiredData.some((item, index) => item !== oldRequiredData[index]);
  }

  /**
   * Send microphone state change message to glasses
   * This replicates the exact message format from the original implementation
   */
  private sendStateChangeToGlasses(isEnabled: boolean, requiredData: Array<'pcm' | 'transcription' | 'pcm_or_transcription'>): void {
    if (!this.session.websocket || this.session.websocket.readyState !== WebSocket.OPEN) {
      this.logger.warn('Cannot send microphone state change: WebSocket not open');
      return;
    }

    try {
      // TODO: Remove this type extension once the SDK is updated
      const message: MicrophoneStateChange & { requiredData: Array<'pcm' | 'transcription' | 'pcm_or_transcription'> } = {
        type: CloudToGlassesMessageType.MICROPHONE_STATE_CHANGE,
        sessionId: this.session.sessionId,
        userSession: {
          sessionId: this.session.sessionId,
          userId: this.session.userId,
          startTime: this.session.startTime,
          // activeAppSessions: this.session.activeAppSessions || [],
          activeAppSessions: Array.from(this.session.runningApps),
          // loadingApps: Array.from(this.session.loadingApps),
          loadingApps: this.session.loadingApps,
          isTranscribing: this.session.isTranscribing || false,
        },
        isMicrophoneEnabled: isEnabled,
        requiredData: requiredData,
        timestamp: new Date(),
      };

      this.session.websocket.send(JSON.stringify(message));
      this.logger.debug({ message }, 'Sent microphone state change message');
    } catch (error) {
      this.logger.error(error, 'Error sending microphone state change');
    }
  }

  calculateRequiredData(hasPCM: boolean, hasTranscription: boolean): Array<'pcm' | 'transcription' | 'pcm_or_transcription'> {
    const requiredData: Array<'pcm' | 'transcription' | 'pcm_or_transcription'> = [];
    const isCloudSttDown = this.session.transcriptionManager.isCloudSTTDown();
    if (hasPCM) {
      requiredData.push('pcm');
      if (hasTranscription && isCloudSttDown) {
        requiredData.push('transcription');
      }
    } else {
      if (hasTranscription && isCloudSttDown) {
        requiredData.push('transcription');
      } else {
        requiredData.push('pcm_or_transcription');
      }
    }

    return requiredData;
  }

  /**
   * Update transcription service state based on current microphone state
   * Transcription is now handled by TranscriptionManager based on app subscriptions and VAD
   * The microphone state doesn't directly control transcription anymore
   */
  private updateTranscriptionState(): void {
    // Transcription is now controlled by:
    // 1. App subscriptions (via TranscriptionManager.updateSubscriptions)
    // 2. VAD events (via TranscriptionManager.restartFromActiveSubscriptions/stopAndFinalizeAll)
    // 
    // The microphone state is informational and doesn't directly start/stop transcription
    this.logger.debug('Microphone state updated - transcription handled by TranscriptionManager');
  }

  /**
   * Get the current microphone state
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Handle glasses connection state changes
   * This replicates the behavior in the GLASSES_CONNECTION_STATE case
   */
  handleConnectionStateChange(status: string): void {
    if (status === 'CONNECTED') {
      this.logger.info({ status }, 'Glasses connected, checking media subscriptions ' + status);
      const hasPCMTranscriptionSubscriptions = subscriptionService.hasPCMTranscriptionSubscriptions(this.session.sessionId);
      // const hasMediaSubscriptions = subscriptionService.hasMediaSubscriptions(this.session.sessionId);
      const hasMediaSubscriptions = hasPCMTranscriptionSubscriptions.hasMedia;
      const requiredData = this.calculateRequiredData(hasPCMTranscriptionSubscriptions.hasPCM, hasPCMTranscriptionSubscriptions.hasTranscription);
      this.updateState(hasMediaSubscriptions, requiredData);
    }
  }


  /**
   * Handle subscription changes with debouncing
   * This should be called when Apps update their subscriptions
   */
  handleSubscriptionChange(): void {
    // Clear any existing debounce timer
    if (this.subscriptionDebounceTimer) {
      clearTimeout(this.subscriptionDebounceTimer);
    }

    // Set new debounce timer to batch rapid subscription changes
    this.subscriptionDebounceTimer = setTimeout(() => {
      // const hasMediaSubscriptions = subscriptionService.hasMediaSubscriptions(this.session.sessionId);
      const hasPCMTranscriptionSubscriptions = subscriptionService.hasPCMTranscriptionSubscriptions(this.session.sessionId);
      const hasMediaSubscriptions = hasPCMTranscriptionSubscriptions.hasMedia;
      const requiredData = this.calculateRequiredData(hasPCMTranscriptionSubscriptions.hasPCM, hasPCMTranscriptionSubscriptions.hasTranscription);
      this.logger.info(`Subscription changed, media subscriptions: ${hasMediaSubscriptions}`);
      this.updateState(hasMediaSubscriptions, requiredData);
      this.subscriptionDebounceTimer = null;
    }, 100); // 100ms debounce - short enough to be responsive, long enough to batch rapid calls
  }

  /**
   * Update microphone settings based on core status
   * This replicates the onboard mic setting update
   */
  // updateOnboardMicSetting(useOnboardMic: boolean): void {
  //   this.logger.info(`Updating onboard mic setting: ${useOnboardMic}`);
  //   // Update the setting in user preferences or session state
  //   // Implementation depends on how settings are stored
  // }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.logger.info('Disposing MicrophoneManager');
    // Clear any timers
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.subscriptionDebounceTimer) {
      clearTimeout(this.subscriptionDebounceTimer);
      this.subscriptionDebounceTimer = null;
    }
  }
}

export default MicrophoneManager;