package com.dev.api;

/**
 * JNI wrapper for K900 device control library.
 * This class MUST remain in com.dev.api package to match the native library signatures.
 * The libxydev.so native library expects these exact method signatures.
 */
public class XyDev {
    static {
        System.loadLibrary("xydev");
    }
    
    public static native void setInt(int cmd, int value);
    public static native int getInt(int cmd);
    public static native void setLong(int cmd, long value);
    public static native long getLong(int cmd);
    public static native void setString(int cmd, String value);
    public static native String getString(int cmd);
}