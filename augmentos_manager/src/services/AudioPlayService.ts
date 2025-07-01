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
    console.log('🔊 [AudioPlayService] Received audio play request:', {
      requestId: message.requestId,
      hasAudioUrl: !!message.audioUrl,
      audioUrlLength: message.audioUrl?.length,
      hasAudioData: !!message.audioData,
      audioDataLength: message.audioData?.length,
      mimeType: message.mimeType,
      volume: message.volume,
      stopOtherAudio: message.stopOtherAudio,
      streamAction: message.streamAction
    });

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

      console.log(`🔊 [AudioPlayService] Calling AudioManager.playAudio with request:`, {
        requestId: request.requestId,
        hasAudioUrl: !!request.audioUrl,
        hasAudioData: !!request.audioData,
        mimeType: request.mimeType,
        volume: request.volume,
        stopOtherAudio: request.stopOtherAudio,
        streamAction: request.streamAction
      });

      await AudioManager.playAudio(request);
      console.log(`🔊 [AudioPlayService] Successfully completed audio playback request for requestId: ${message.requestId}`);

    } catch (error) {
      console.error(`🔊 [AudioPlayService] Failed to handle audio play request for requestId ${message.requestId}:`, error);
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
    console.log('🔊 [AudioPlayService] handleMessage called with:', {
      messageType: message?.type,
      hasMessage: !!message,
      messageKeys: message ? Object.keys(message) : []
    });

    if (message && message.type === 'audio_play_request') {
      console.log('🔊 [AudioPlayService] Message is audio_play_request, processing...');
      await this.handleAudioPlayRequest(message as AudioPlayRequestMessage);
      return true;
    }

    console.log('🔊 [AudioPlayService] Message is not audio_play_request, ignoring');
    return false;
  }
}

export default AudioPlayService.getInstance();