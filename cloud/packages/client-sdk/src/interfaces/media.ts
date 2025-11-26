export interface IMedia {
    /**
     * Play an audio file or stream.
     * @param url The URL or path to play.
     */
    playAudio(url: string): Promise<void>;

    /**
     * Stop currently playing audio.
     */
    stopAudio(): Promise<void>;

    /**
     * Start recording audio from the microphone.
     * @returns A stream or path to the recording.
     */
    startAudioRecording(): Promise<void>;

    /**
     * Stop recording audio.
     */
    stopAudioRecording(): Promise<string | Blob>;

    /**
     * Start streaming video to an RTMP URL.
     */
    startRtmpStream(url: string): Promise<void>;

    /**
     * Stop the RTMP stream.
     */
    stopRtmpStream(): Promise<void>;
}
