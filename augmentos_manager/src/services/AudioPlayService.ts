import AudioManager, { AudioPlayRequest } from '../managers/AudioManager';

export interface AudioPlayRequestMessage {
  type: 'audio_play_request';
  requestId: string;
  audioUrl?: string;
  audioData?: string;
  mimeType?: string;
  volume?: number;
  stopOtherAudio?: boolean;
  streamAction?: 'start' | 'append' | 'end';
}

export class AudioPlayService {
  private static instance: AudioPlayService;

  private constructor() {}

  public static getInstance(): AudioPlayService {
    if (!AudioPlayService.instance) {
      AudioPlayService.instance = new AudioPlayService();
    }
    return AudioPlayService.instance;
  }

  /**
   * Handle an incoming audio play request message
   */
  public async handleAudioPlayRequest(message: AudioPlayRequestMessage): Promise<void> {


    try {
      const request: AudioPlayRequest = {
        requestId: message.requestId,
        audioUrl: message.audioUrl,
        audioData: message.audioData,
        mimeType: message.mimeType,
        volume: message.volume,
        stopOtherAudio: message.stopOtherAudio,
        streamAction: message.streamAction
      };

      await AudioManager.playAudio(request);

    } catch (error) {
      throw error;
    }
  }

  /**
   * Stop audio playback for a specific request
   */
  public async stopAudio(requestId: string): Promise<void> {
    try {
      await AudioManager.stopAudio(requestId);
      console.log(`AudioPlayService: Stopped audio for requestId: ${requestId}`);
    } catch (error) {
      console.error(`AudioPlayService: Failed to stop audio for requestId ${requestId}:`, error);
      throw error;
    }
  }

  /**
   * Stop all audio playback
   */
  public async stopAllAudio(): Promise<void> {
    try {
      await AudioManager.stopAllAudio();
      console.log('AudioPlayService: Stopped all audio');
    } catch (error) {
      console.error('AudioPlayService: Failed to stop all audio:', error);
      throw error;
    }
  }

  /**
   * Parse and handle a generic message that might be an audio play request
   */
  public async handleMessage(message: any): Promise<boolean> {
    if (message && message.type === 'audio_play_request') {
      await this.handleAudioPlayRequest(message as AudioPlayRequestMessage);
      return true;
    }

    return false;
  }
}

export default AudioPlayService.getInstance();