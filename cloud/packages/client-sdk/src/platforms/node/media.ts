import { IMedia } from '../../interfaces/media';

export class MockMedia implements IMedia {
    async playAudio(url: string): Promise<void> {
        console.log(`[MockMedia] Playing audio: ${url}`);
    }

    async stopAudio(): Promise<void> {
        console.log('[MockMedia] Stopped audio');
    }

    async startAudioRecording(): Promise<void> {
        console.log('[MockMedia] Started audio recording');
    }

    async stopAudioRecording(): Promise<string> {
        console.log('[MockMedia] Stopped audio recording');
        return 'mock-recording.wav';
    }

    async startRtmpStream(url: string): Promise<void> {
        console.log(`[MockMedia] Started RTMP stream to ${url}`);
    }

    async stopRtmpStream(): Promise<void> {
        console.log('[MockMedia] Stopped RTMP stream');
    }
}
