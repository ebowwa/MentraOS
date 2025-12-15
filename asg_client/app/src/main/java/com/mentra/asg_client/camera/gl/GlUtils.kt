package com.mentra.asg_client.camera.gl

import android.opengl.EGL14
import android.opengl.GLES20
import android.util.Log

/**
 * OpenGL ES utility functions for error checking and shader compilation.
 */
object GlUtils {
    private const val TAG = "GlUtils"

    /**
     * Checks for EGL errors. Throws an exception if one is found.
     */
    fun checkEglError(msg: String) {
        val error = EGL14.eglGetError()
        if (error != EGL14.EGL_SUCCESS) {
            val errorMsg = "$msg: EGL error: 0x${Integer.toHexString(error)}"
            Log.e(TAG, errorMsg)
            throw RuntimeException(errorMsg)
        }
    }

    /**
     * Checks for GLES errors. Throws an exception if one is found.
     */
    fun checkGlError(op: String) {
        val error = GLES20.glGetError()
        if (error != GLES20.GL_NO_ERROR) {
            val errorMsg = "$op: glError 0x${Integer.toHexString(error)}"
            Log.e(TAG, errorMsg)
            if (error == GLES20.GL_OUT_OF_MEMORY) {
                throw RuntimeException("$op GL_OUT_OF_MEMORY")
            }
            throw RuntimeException(errorMsg)
        }
    }

    /**
     * Compiles a shader from source.
     *
     * @param shaderType GL_VERTEX_SHADER or GL_FRAGMENT_SHADER
     * @param source Shader source code
     * @return Shader handle, or 0 on failure
     */
    fun loadShader(shaderType: Int, source: String): Int {
        val shader = GLES20.glCreateShader(shaderType)
        checkGlError("glCreateShader type=$shaderType")

        GLES20.glShaderSource(shader, source)
        GLES20.glCompileShader(shader)

        val compiled = IntArray(1)
        GLES20.glGetShaderiv(shader, GLES20.GL_COMPILE_STATUS, compiled, 0)
        if (compiled[0] == 0) {
            val info = GLES20.glGetShaderInfoLog(shader)
            GLES20.glDeleteShader(shader)
            throw RuntimeException("Could not compile shader $shaderType: $info")
        }
        return shader
    }

    /**
     * Creates a program from vertex and fragment shader sources.
     *
     * @param vertexSource Vertex shader source
     * @param fragmentSource Fragment shader source
     * @return Program handle
     */
    fun createProgram(vertexSource: String, fragmentSource: String): Int {
        val vertexShader = loadShader(GLES20.GL_VERTEX_SHADER, vertexSource)
        val fragmentShader = loadShader(GLES20.GL_FRAGMENT_SHADER, fragmentSource)

        val program = GLES20.glCreateProgram()
        checkGlError("glCreateProgram")
        if (program == 0) {
            throw RuntimeException("Could not create program")
        }

        GLES20.glAttachShader(program, vertexShader)
        checkGlError("glAttachShader vertex")
        GLES20.glAttachShader(program, fragmentShader)
        checkGlError("glAttachShader fragment")
        GLES20.glLinkProgram(program)

        val linkStatus = IntArray(1)
        GLES20.glGetProgramiv(program, GLES20.GL_LINK_STATUS, linkStatus, 0)
        if (linkStatus[0] != GLES20.GL_TRUE) {
            val info = GLES20.glGetProgramInfoLog(program)
            GLES20.glDeleteProgram(program)
            throw RuntimeException("Could not link program: $info")
        }

        // Clean up shaders (they're linked into the program now)
        GLES20.glDeleteShader(vertexShader)
        GLES20.glDeleteShader(fragmentShader)

        return program
    }
}
