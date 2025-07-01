// Handle React Native imports with fallback for type issues
let Platform: any;
let NativeModules: any;

try {
  const RN = require('react-native');
  Platform = RN.Platform;
  NativeModules = RN.NativeModules;
} catch (e) {
  console.warn('Failed to import from react-native');
  Platform = { OS: 'unknown' };
  NativeModules = {};
}

interface AudioManagerNative {
  playAudio(
    requestId: string,
    audioUrl?: string,
    audioData?: string,
    mimeType?: string,
    volume?: number,
    stopOtherAudio?: boolean,
    streamAction?: string
  ): Promise<string>;

  stopAudio(requestId: string): Promise<string>;
  stopAllAudio(): Promise<string>;
}

// For Android, we use the native module
const AndroidAudioManager: AudioManagerNative | null = Platform.OS === 'android'
  ? NativeModules.AudioManagerModule
  : null;

// For iOS, we'll need to create a similar bridge or handle it differently
const iOSAudioManager: AudioManagerNative | null = Platform.OS === 'ios'
  ? NativeModules.IOSAudioManager // This would need to be implemented
  : null;

export interface AudioPlayRequest {
  requestId: string;
  audioUrl?: string;
  audioData?: string;
  mimeType?: string;
  volume?: number;
  stopOtherAudio?: boolean;
  streamAction?: 'start' | 'append' | 'end';
}

export class AudioManager {
  private static instance: AudioManager;

  private constructor() {}

  public static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }

  public async playAudio(request: AudioPlayRequest): Promise<void> {
    const {
      requestId,
      audioUrl,
      audioData,
      mimeType,
      volume = 1.0,
      stopOtherAudio = true,
      streamAction
    } = request;

    console.log(`🔊 [AudioManager] playAudio called with:`, {
      requestId,
      hasAudioUrl: !!audioUrl,
      audioUrlLength: audioUrl?.length,
      hasAudioData: !!audioData,
      audioDataLength: audioData?.length,
      mimeType,
      volume,
      stopOtherAudio,
      streamAction,
      platform: Platform.OS
    });

    try {
      if (Platform.OS === 'android' && AndroidAudioManager) {
        console.log(`🔊 [AudioManager] Platform is Android, calling AndroidAudioManager.playAudio...`);
        console.log(`🔊 [AudioManager] AndroidAudioManager exists:`, !!AndroidAudioManager);

        const result = await AndroidAudioManager.playAudio(
          requestId,
          audioUrl || '',
          audioData || '',
          mimeType || '',
          volume,
          stopOtherAudio,
          streamAction || ''
        );

        console.log(`🔊 [AudioManager] AndroidAudioManager.playAudio completed with result:`, result);
      } else if (Platform.OS === 'ios') {
        console.log(`🔊 [AudioManager] Platform is iOS, calling playAudioIOS...`);
        // For iOS, we'll call the native AudioManager directly
        // This is a temporary solution - in production you'd want a proper bridge
        await this.playAudioIOS(request);
      } else {
        console.error(`🔊 [AudioManager] Unsupported platform: ${Platform.OS}`);
        throw new Error(`AudioManager not available for platform: ${Platform.OS}`);
      }

      console.log(`🔊 [AudioManager] playAudio completed successfully for requestId: ${requestId}`);
    } catch (error) {
      console.error(`🔊 [AudioManager] Failed to play audio for requestId ${requestId}:`, error);
      throw error;
    }
  }

  public async stopAudio(requestId: string): Promise<void> {
    console.log(`AudioManager: Stopping audio for requestId: ${requestId}`);

    try {
      if (Platform.OS === 'android' && AndroidAudioManager) {
        await AndroidAudioManager.stopAudio(requestId);
      } else if (Platform.OS === 'ios') {
        await this.stopAudioIOS(requestId);
      } else {
        throw new Error(`AudioManager not available for platform: ${Platform.OS}`);
      }
    } catch (error) {
      console.error(`AudioManager: Failed to stop audio for requestId ${requestId}:`, error);
      throw error;
    }
  }

  public async stopAllAudio(): Promise<void> {
    console.log('AudioManager: Stopping all audio');

    try {
      if (Platform.OS === 'android' && AndroidAudioManager) {
        await AndroidAudioManager.stopAllAudio();
      } else if (Platform.OS === 'ios') {
        await this.stopAllAudioIOS();
      } else {
        throw new Error(`AudioManager not available for platform: ${Platform.OS}`);
      }
    } catch (error) {
      console.error('AudioManager: Failed to stop all audio:', error);
      throw error;
    }
  }

  // iOS-specific implementations (these would ideally be moved to a native bridge)
  private async playAudioIOS(request: AudioPlayRequest): Promise<void> {
    // For now, we'll use a workaround that calls the iOS AudioManager
    // In a production app, you'd want to create a proper React Native bridge
    const { requestId, audioUrl, audioData, mimeType, volume, stopOtherAudio, streamAction } = request;

    // This is a placeholder - you'd need to implement an iOS native module
    // similar to the Android one, or use a different approach
    console.log('AudioManager: iOS playback not yet implemented via React Native bridge');

    // Temporary: we could use react-native-sound or expo-av for basic functionality
    // but for streaming support, a custom native module would be better
  }

  private async stopAudioIOS(requestId: string): Promise<void> {
    console.log(`AudioManager: iOS stop audio for ${requestId} not yet implemented`);
  }

  private async stopAllAudioIOS(): Promise<void> {
    console.log('AudioManager: iOS stop all audio not yet implemented');
  }

  // Utility method to handle incoming audio play requests from WebSocket
  public async handleAudioPlayRequest(message: any): Promise<void> {
    console.log(`🔊 [AudioManager] handleAudioPlayRequest called with message:`, {
      hasMessage: !!message,
      messageKeys: message ? Object.keys(message) : [],
      requestId: message?.requestId,
      hasAudioUrl: !!message?.audioUrl,
      hasAudioData: !!message?.audioData,
      mimeType: message?.mimeType,
      volume: message?.volume,
      stopOtherAudio: message?.stopOtherAudio,
      streamAction: message?.streamAction
    });

    const {
      requestId,
      audioUrl,
      audioData,
      mimeType,
      volume,
      stopOtherAudio,
      streamAction
    } = message;

    if (!requestId) {
      console.error(`🔊 [AudioManager] Audio play request missing requestId`);
      throw new Error('Audio play request missing requestId');
    }

    console.log(`🔊 [AudioManager] Calling playAudio with extracted parameters...`);

    await this.playAudio({
      requestId,
      audioUrl,
      audioData,
      mimeType,
      volume,
      stopOtherAudio,
      streamAction
    });

    console.log(`🔊 [AudioManager] handleAudioPlayRequest completed successfully for requestId: ${requestId}`);
  }
}

export default AudioManager.getInstance();