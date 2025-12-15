package com.mentra.asg_client.camera.gl

import android.opengl.GLES11Ext
import android.opengl.GLES20
import android.util.Log
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer

/**
 * OpenGL shader program that applies tone mapping to video frames.
 *
 * Implements:
 * - Highlight rolloff (compresses bright areas to prevent clipping)
 * - Shadow lift (boosts dark areas for better visibility)
 * - Optional global tone curve
 *
 * The shader operates on external OES textures from the camera.
 */
class ToneMappingShader {
    private var programHandle: Int = 0
    private var uMVPMatrixLoc: Int = 0
    private var uTexMatrixLoc: Int = 0
    private var aPositionLoc: Int = 0
    private var aTextureCoordLoc: Int = 0

    // Tone mapping parameter uniforms
    private var uHighlightThresholdLoc: Int = 0
    private var uHighlightPowerLoc: Int = 0
    private var uShadowThresholdLoc: Int = 0
    private var uShadowLiftLoc: Int = 0
    private var uToneMappingEnabledLoc: Int = 0

    // Configurable parameters (aggressive settings for highlight protection + shadow recovery)
    var highlightThreshold: Float = 0.60f   // Start compressing earlier
    var highlightPower: Float = 0.40f       // Stronger compression
    var shadowThreshold: Float = 0.35f      // Lift more of the image
    var shadowLift: Float = 0.15f           // Stronger shadow lift
    var toneMappingEnabled: Boolean = true

    companion object {
        private const val TAG = "ToneMappingShader"

        // Vertex shader - simple passthrough with texture matrix
        private const val VERTEX_SHADER = """
            uniform mat4 uMVPMatrix;
            uniform mat4 uTexMatrix;
            attribute vec4 aPosition;
            attribute vec4 aTextureCoord;
            varying vec2 vTextureCoord;
            void main() {
                gl_Position = uMVPMatrix * aPosition;
                vTextureCoord = (uTexMatrix * aTextureCoord).xy;
            }
        """

        // Fragment shader with tone mapping
        private const val FRAGMENT_SHADER = """
            #extension GL_OES_EGL_image_external : require
            precision mediump float;

            varying vec2 vTextureCoord;
            uniform samplerExternalOES sTexture;

            // Tone mapping parameters
            uniform float uHighlightThreshold;
            uniform float uHighlightPower;
            uniform float uShadowThreshold;
            uniform float uShadowLift;
            uniform float uToneMappingEnabled;

            void main() {
                vec4 color = texture2D(sTexture, vTextureCoord);

                // Skip processing if tone mapping is disabled
                if (uToneMappingEnabled < 0.5) {
                    gl_FragColor = color;
                    return;
                }

                // Calculate luminance (BT.601 coefficients)
                float y = 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;
                float newY = y;

                // 1. Highlight rolloff (compress above threshold)
                // Prevents skies, screens, and bright areas from blowing out
                if (y > uHighlightThreshold) {
                    float t = (y - uHighlightThreshold) / (1.0 - uHighlightThreshold);
                    float compressed = pow(t, uHighlightPower);
                    newY = uHighlightThreshold + (1.0 - uHighlightThreshold) * compressed;
                }

                // 2. Shadow lift (boost below threshold)
                // Recovers detail in dark areas without affecting midtones
                if (y < uShadowThreshold) {
                    float liftFactor = 1.0 - (y / uShadowThreshold);
                    newY = newY + uShadowLift * liftFactor;
                }

                // Clamp to valid range
                newY = clamp(newY, 0.0, 1.0);

                // Apply ratio to RGB to preserve color
                float ratio = (y > 0.001) ? (newY / y) : 1.0;
                vec3 newColor = color.rgb * ratio;

                // Clamp final output
                gl_FragColor = vec4(clamp(newColor, 0.0, 1.0), color.a);
            }
        """

        // Full-screen quad vertices
        private val FULL_RECTANGLE_COORDS = floatArrayOf(
            -1.0f, -1.0f,  // bottom left
            1.0f, -1.0f,   // bottom right
            -1.0f, 1.0f,   // top left
            1.0f, 1.0f     // top right
        )

        // Texture coordinates
        private val FULL_RECTANGLE_TEX_COORDS = floatArrayOf(
            0.0f, 0.0f,  // bottom left
            1.0f, 0.0f,  // bottom right
            0.0f, 1.0f,  // top left
            1.0f, 1.0f   // top right
        )

        private fun createFloatBuffer(coords: FloatArray): FloatBuffer {
            val bb = ByteBuffer.allocateDirect(coords.size * 4)
            bb.order(ByteOrder.nativeOrder())
            val fb = bb.asFloatBuffer()
            fb.put(coords)
            fb.position(0)
            return fb
        }
    }

    private val vertexBuffer: FloatBuffer = createFloatBuffer(FULL_RECTANGLE_COORDS)
    private val texCoordBuffer: FloatBuffer = createFloatBuffer(FULL_RECTANGLE_TEX_COORDS)
    private val mvpMatrix = FloatArray(16).apply {
        android.opengl.Matrix.setIdentityM(this, 0)
    }

    init {
        programHandle = GlUtils.createProgram(VERTEX_SHADER, FRAGMENT_SHADER)
        if (programHandle == 0) {
            throw RuntimeException("Unable to create tone mapping program")
        }

        // Get attribute locations
        aPositionLoc = GLES20.glGetAttribLocation(programHandle, "aPosition")
        aTextureCoordLoc = GLES20.glGetAttribLocation(programHandle, "aTextureCoord")

        // Get uniform locations
        uMVPMatrixLoc = GLES20.glGetUniformLocation(programHandle, "uMVPMatrix")
        uTexMatrixLoc = GLES20.glGetUniformLocation(programHandle, "uTexMatrix")
        uHighlightThresholdLoc = GLES20.glGetUniformLocation(programHandle, "uHighlightThreshold")
        uHighlightPowerLoc = GLES20.glGetUniformLocation(programHandle, "uHighlightPower")
        uShadowThresholdLoc = GLES20.glGetUniformLocation(programHandle, "uShadowThreshold")
        uShadowLiftLoc = GLES20.glGetUniformLocation(programHandle, "uShadowLift")
        uToneMappingEnabledLoc = GLES20.glGetUniformLocation(programHandle, "uToneMappingEnabled")

        Log.d(TAG, "Tone mapping shader created successfully")
    }

    /**
     * Create a texture object for external OES textures (camera frames).
     */
    fun createTextureObject(): Int {
        val textureId = IntArray(1)
        GLES20.glGenTextures(1, textureId, 0)
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
        GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, textureId[0])
        GlUtils.checkGlError("glBindTexture")

        GLES20.glTexParameterf(
            GLES11Ext.GL_TEXTURE_EXTERNAL_OES,
            GLES20.GL_TEXTURE_MIN_FILTER,
            GLES20.GL_LINEAR.toFloat()
        )
        GLES20.glTexParameterf(
            GLES11Ext.GL_TEXTURE_EXTERNAL_OES,
            GLES20.GL_TEXTURE_MAG_FILTER,
            GLES20.GL_LINEAR.toFloat()
        )
        GLES20.glTexParameteri(
            GLES11Ext.GL_TEXTURE_EXTERNAL_OES,
            GLES20.GL_TEXTURE_WRAP_S,
            GLES20.GL_CLAMP_TO_EDGE
        )
        GLES20.glTexParameteri(
            GLES11Ext.GL_TEXTURE_EXTERNAL_OES,
            GLES20.GL_TEXTURE_WRAP_T,
            GLES20.GL_CLAMP_TO_EDGE
        )
        GlUtils.checkGlError("glTexParameter")

        return textureId[0]
    }

    /**
     * Set the viewport size for rendering.
     */
    fun setViewport(width: Int, height: Int) {
        GLES20.glViewport(0, 0, width, height)
    }

    /**
     * Draw a frame with tone mapping applied.
     *
     * @param textureId The OES texture containing the camera frame
     * @param texMatrix The texture transform matrix from SurfaceTexture
     */
    fun drawFrame(textureId: Int, texMatrix: FloatArray) {
        GlUtils.checkGlError("drawFrame start")

        GLES20.glUseProgram(programHandle)
        GlUtils.checkGlError("glUseProgram")

        // Bind the camera texture
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
        GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, textureId)

        // Set matrices
        GLES20.glUniformMatrix4fv(uMVPMatrixLoc, 1, false, mvpMatrix, 0)
        GLES20.glUniformMatrix4fv(uTexMatrixLoc, 1, false, texMatrix, 0)

        // Set tone mapping parameters
        GLES20.glUniform1f(uHighlightThresholdLoc, highlightThreshold)
        GLES20.glUniform1f(uHighlightPowerLoc, highlightPower)
        GLES20.glUniform1f(uShadowThresholdLoc, shadowThreshold)
        GLES20.glUniform1f(uShadowLiftLoc, shadowLift)
        GLES20.glUniform1f(uToneMappingEnabledLoc, if (toneMappingEnabled) 1.0f else 0.0f)

        // Set up vertex attributes
        GLES20.glEnableVertexAttribArray(aPositionLoc)
        GLES20.glVertexAttribPointer(
            aPositionLoc, 2, GLES20.GL_FLOAT, false, 8, vertexBuffer
        )

        GLES20.glEnableVertexAttribArray(aTextureCoordLoc)
        GLES20.glVertexAttribPointer(
            aTextureCoordLoc, 2, GLES20.GL_FLOAT, false, 8, texCoordBuffer
        )

        // Draw the quad
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
        GlUtils.checkGlError("glDrawArrays")

        // Clean up
        GLES20.glDisableVertexAttribArray(aPositionLoc)
        GLES20.glDisableVertexAttribArray(aTextureCoordLoc)
        GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, 0)
        GLES20.glUseProgram(0)
    }

    /**
     * Release shader resources.
     */
    fun release() {
        if (programHandle != 0) {
            GLES20.glDeleteProgram(programHandle)
            programHandle = 0
        }
        Log.d(TAG, "Tone mapping shader released")
    }
}
