package com.mentra.asg_client.camera.gl

import android.graphics.SurfaceTexture
import android.opengl.EGLSurface
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import android.util.Size
import android.view.Surface
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * GPU-accelerated tone mapping processor for real-time video processing.
 *
 * This class sits between the camera output and MediaRecorder input,
 * applying tone mapping to each frame via an OpenGL ES shader.
 *
 * Architecture:
 * Camera → SurfaceTexture (inputSurface) → OpenGL Shader → EGL Surface (outputSurface) → MediaRecorder
 *
 * Usage:
 * 1. Create ToneMappingProcessor with the MediaRecorder's input surface
 * 2. Get inputSurface and pass it to Camera2 as a capture target
 * 3. Call start() to begin processing
 * 4. Frames are automatically processed and forwarded
 * 5. Call stop() and release() when done
 */
class ToneMappingProcessor(
    private val outputSurface: Surface,
    private val videoSize: Size
) : SurfaceTexture.OnFrameAvailableListener {

    private var eglCore: EglCore? = null
    private var eglSurface: EGLSurface? = null
    private var toneMappingShader: ToneMappingShader? = null
    private var surfaceTexture: SurfaceTexture? = null
    private var textureId: Int = -1

    private var processingThread: HandlerThread? = null
    private var processingHandler: Handler? = null

    private val texMatrix = FloatArray(16)
    private var isRunning = false

    // The surface that the camera should render to
    var inputSurface: Surface? = null
        private set

    companion object {
        private const val TAG = "ToneMappingProcessor"

        // Singleton-ish access to current parameters for runtime adjustment
        // Aggressive settings for highlight protection + shadow recovery
        @Volatile
        var globalHighlightThreshold: Float = 0.60f  // Start compressing earlier

        @Volatile
        var globalHighlightPower: Float = 0.40f      // Stronger compression

        @Volatile
        var globalShadowThreshold: Float = 0.35f     // Lift more of the image

        @Volatile
        var globalShadowLift: Float = 0.15f          // Stronger shadow lift

        @Volatile
        var globalToneMappingEnabled: Boolean = true

        /**
         * Update tone mapping parameters for all active processors.
         */
        fun setToneMappingParams(
            highlightThreshold: Float = globalHighlightThreshold,
            highlightPower: Float = globalHighlightPower,
            shadowThreshold: Float = globalShadowThreshold,
            shadowLift: Float = globalShadowLift
        ) {
            globalHighlightThreshold = highlightThreshold
            globalHighlightPower = highlightPower
            globalShadowThreshold = shadowThreshold
            globalShadowLift = shadowLift
            Log.d(TAG, "Tone mapping params updated: highlight=$highlightThreshold/$highlightPower, shadow=$shadowThreshold/$shadowLift")
        }

        /**
         * Enable or disable tone mapping for all active processors.
         */
        fun setToneMappingEnabled(enabled: Boolean) {
            globalToneMappingEnabled = enabled
            Log.d(TAG, "Tone mapping enabled: $enabled")
        }
    }

    /**
     * Initialize the processor. Must be called before start().
     * This sets up the EGL context, shaders, and creates the input surface.
     * Blocks until initialization is complete or times out.
     */
    fun initialize() {
        Log.d(TAG, "Initializing tone mapping processor for ${videoSize.width}x${videoSize.height}")

        // Create processing thread
        processingThread = HandlerThread("ToneMappingProcessor").apply { start() }
        processingHandler = Handler(processingThread!!.looper)

        // Use CountDownLatch to wait for initialization to complete
        val initLatch = CountDownLatch(1)

        // Initialize GL on the processing thread
        processingHandler?.post {
            try {
                // Create EGL core
                eglCore = EglCore()

                // Create EGL surface from MediaRecorder's surface
                eglSurface = eglCore!!.createWindowSurface(outputSurface)
                eglCore!!.makeCurrent(eglSurface!!)

                // Create tone mapping shader
                toneMappingShader = ToneMappingShader()
                toneMappingShader!!.setViewport(videoSize.width, videoSize.height)

                // Create texture for camera frames
                textureId = toneMappingShader!!.createTextureObject()

                // Create SurfaceTexture that camera will render to
                surfaceTexture = SurfaceTexture(textureId).apply {
                    setDefaultBufferSize(videoSize.width, videoSize.height)
                    setOnFrameAvailableListener(this@ToneMappingProcessor, processingHandler)
                }

                // Create input surface from SurfaceTexture
                inputSurface = Surface(surfaceTexture)

                Log.d(TAG, "Tone mapping processor initialized successfully")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to initialize tone mapping processor", e)
            } finally {
                initLatch.countDown()
            }
        }

        // Wait for initialization to complete (timeout after 5 seconds)
        try {
            if (!initLatch.await(5, TimeUnit.SECONDS)) {
                Log.e(TAG, "Tone mapping processor initialization timed out")
            }
        } catch (e: InterruptedException) {
            Log.e(TAG, "Tone mapping processor initialization interrupted", e)
            Thread.currentThread().interrupt()
        }
    }

    /**
     * Start processing frames.
     */
    fun start() {
        isRunning = true
        Log.d(TAG, "Tone mapping processor started")
    }

    /**
     * Stop processing frames.
     */
    fun stop() {
        isRunning = false
        Log.d(TAG, "Tone mapping processor stopped")
    }

    /**
     * Called when a new frame is available from the camera.
     */
    override fun onFrameAvailable(st: SurfaceTexture) {
        if (!isRunning) return

        processingHandler?.post {
            try {
                if (eglCore == null || eglSurface == null || toneMappingShader == null) {
                    return@post
                }

                // Make our EGL surface current
                eglCore!!.makeCurrent(eglSurface!!)

                // Update the texture with the new frame
                surfaceTexture?.updateTexImage()
                surfaceTexture?.getTransformMatrix(texMatrix)

                // Update shader parameters from global settings
                toneMappingShader!!.apply {
                    highlightThreshold = globalHighlightThreshold
                    highlightPower = globalHighlightPower
                    shadowThreshold = globalShadowThreshold
                    shadowLift = globalShadowLift
                    toneMappingEnabled = globalToneMappingEnabled
                }

                // Draw frame with tone mapping
                toneMappingShader!!.drawFrame(textureId, texMatrix)

                // Set presentation time for proper video timing
                val timestamp = surfaceTexture?.timestamp ?: System.nanoTime()
                eglCore!!.setPresentationTime(eglSurface!!, timestamp)

                // Swap buffers to send frame to MediaRecorder
                eglCore!!.swapBuffers(eglSurface!!)

            } catch (e: Exception) {
                Log.e(TAG, "Error processing frame", e)
            }
        }
    }

    /**
     * Release all resources.
     */
    fun release() {
        Log.d(TAG, "Releasing tone mapping processor")
        isRunning = false

        processingHandler?.post {
            try {
                inputSurface?.release()
                inputSurface = null

                surfaceTexture?.release()
                surfaceTexture = null

                toneMappingShader?.release()
                toneMappingShader = null

                eglSurface?.let { eglCore?.releaseSurface(it) }
                eglSurface = null

                eglCore?.release()
                eglCore = null

            } catch (e: Exception) {
                Log.e(TAG, "Error releasing resources", e)
            }
        }

        // Give time for cleanup, then quit thread
        processingHandler?.postDelayed({
            processingThread?.quitSafely()
            processingThread = null
            processingHandler = null
        }, 100)

        Log.d(TAG, "Tone mapping processor released")
    }
}
