import { create } from "zustand"

interface VideoFrameState {
    // Base64 encoded JPEG frame from glasses camera
    currentFrame: string | null
    // Whether streaming is active
    isStreaming: boolean
    // Timestamp of last frame
    lastFrameTime: number
    // Frame count for debugging
    frameCount: number
    // Actions
    setFrame: (base64: string) => void
    setStreaming: (streaming: boolean) => void
    reset: () => void
}

export const useVideoFrameStore = create<VideoFrameState>((set) => ({
    currentFrame: null,
    isStreaming: false,
    lastFrameTime: 0,
    frameCount: 0,

    setFrame: (base64: string) =>
        set((state) => ({
            currentFrame: base64,
            lastFrameTime: Date.now(),
            frameCount: state.frameCount + 1,
            isStreaming: true,
        })),

    setStreaming: (streaming: boolean) =>
        set({
            isStreaming: streaming,
            ...(streaming ? {} : { currentFrame: null }),
        }),

    reset: () =>
        set({
            currentFrame: null,
            isStreaming: false,
            lastFrameTime: 0,
            frameCount: 0,
        }),
}))
