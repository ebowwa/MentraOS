package com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages;

import org.json.JSONArray;

/**
 * Event for IMU data received from smart glasses
 */
public class ImuDataEvent {
    public final JSONArray accel;  // Accelerometer data [x, y, z] in m/s²
    public final JSONArray gyro;   // Gyroscope data [x, y, z] in rad/s
    public final JSONArray mag;    // Magnetometer data [x, y, z] in μT
    public final JSONArray quat;   // Quaternion [w, x, y, z]
    public final JSONArray euler;  // Euler angles [roll, pitch, yaw] in degrees
    public final long timestamp;   // Timestamp in milliseconds

    public ImuDataEvent(JSONArray accel, JSONArray gyro, JSONArray mag, 
                       JSONArray quat, JSONArray euler, long timestamp) {
        this.accel = accel;
        this.gyro = gyro;
        this.mag = mag;
        this.quat = quat;
        this.euler = euler;
        this.timestamp = timestamp;
    }
}