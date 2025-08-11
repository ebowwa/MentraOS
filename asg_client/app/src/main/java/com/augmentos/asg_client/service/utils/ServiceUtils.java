package com.augmentos.asg_client.service.utils;

import android.content.Context;
import android.util.Log;

import org.json.JSONException;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Utility class for common service operations.
 * Provides shared functionality used across different service components.
 */
public class ServiceUtils {
    
    private static final String TAG = "ServiceUtils";
    
    /**
     * Check if data is a valid JSON message
     * @param data Data to check
     * @return true if valid JSON, false otherwise
     */
    public static boolean isValidJsonMessage(byte[] data) {
        if (data == null || data.length == 0) {
            return false;
        }
        
        // Check for JSON format (starts with {)
        return data.length > 0 && data[0] == '{';
    }
    
    /**
     * Check if data is a K900 protocol message
     * @param data Data to check
     * @return true if K900 protocol, false otherwise
     */
    public static boolean isK900ProtocolMessage(byte[] data) {
        return data.length > 4 && data[0] == 0x23 && data[1] == 0x23;
    }
    
    /**
     * Extract JSON from K900 protocol message
     * @param data K900 protocol data
     * @return JSON string or null if extraction fails
     */
    public static String extractJsonFromK900Protocol(byte[] data) {
        try {
            // Look for end marker ($$)
            int endMarkerPos = -1;
            for (int i = 4; i < data.length - 1; i++) {
                if (data[i] == 0x24 && data[i+1] == 0x24) {
                    endMarkerPos = i;
                    break;
                }
            }
            
            if (endMarkerPos > 0) {
                int payloadStart = 5;
                int payloadLength = endMarkerPos - payloadStart;
                
                if (payloadLength > 0 && data[payloadStart] == '{') {
                    return new String(data, payloadStart, payloadLength, StandardCharsets.UTF_8);
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Error extracting JSON from K900 protocol", e);
        }
        
        return null;
    }
    
    /**
     * Format duration in milliseconds to human-readable string
     * @param durationMs Duration in milliseconds
     * @return Formatted duration string
     */
    public static String formatDuration(long durationMs) {
        if (durationMs < 0) {
            return "Unknown";
        }
        
        long seconds = durationMs / 1000;
        long minutes = seconds / 60;
        long hours = minutes / 60;
        
        if (hours > 0) {
            return String.format(Locale.US, "%dh %dm %ds", hours, minutes % 60, seconds % 60);
        } else if (minutes > 0) {
            return String.format(Locale.US, "%dm %ds", minutes, seconds % 60);
        } else {
            return String.format(Locale.US, "%ds", seconds);
        }
    }
    
    /**
     * Get current timestamp as formatted string
     * @return Formatted timestamp string
     */
    public static String getCurrentTimestamp() {
        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US);
        return sdf.format(new Date());
    }
    
    /**
     * Create a simple JSON response
     * @param type Response type
     * @param success Success status
     * @param message Optional message
     * @return JSONObject response
     */
    public static JSONObject createSimpleResponse(String type, boolean success, String message) {
        try {
            JSONObject response = new JSONObject();
            response.put("type", type);
            response.put("success", success);
            response.put("timestamp", System.currentTimeMillis());
            
            if (message != null) {
                response.put("message", message);
            }
            
            return response;
        } catch (JSONException e) {
            Log.e(TAG, "Error creating simple response", e);
            return null;
        }
    }
    
    /**
     * Get app version name
     * @param context Application context
     * @return Version name or "1.0.0" if not available
     */
    public static String getAppVersionName(Context context) {
        try {
            return context.getPackageManager()
                    .getPackageInfo(context.getPackageName(), 0)
                    .versionName;
        } catch (Exception e) {
            Log.e(TAG, "Error getting app version", e);
            return "1.0.0";
        }
    }
    
    /**
     * Get app version code
     * @param context Application context
     * @return Version code as string or "1" if not available
     */
    public static String getAppVersionCode(Context context) {
        try {
            return String.valueOf(context.getPackageManager()
                    .getPackageInfo(context.getPackageName(), 0)
                    .versionCode);
        } catch (Exception e) {
            Log.e(TAG, "Error getting app version code", e);
            return "1";
        }
    }
    
    /**
     * Check if string is null or empty
     * @param str String to check
     * @return true if null or empty, false otherwise
     */
    public static boolean isNullOrEmpty(String str) {
        return str == null || str.trim().isEmpty();
    }
    
    /**
     * Safely convert string to integer
     * @param str String to convert
     * @param defaultValue Default value if conversion fails
     * @return Integer value or default value
     */
    public static int safeParseInt(String str, int defaultValue) {
        try {
            return Integer.parseInt(str);
        } catch (NumberFormatException e) {
            Log.w(TAG, "Error parsing integer: " + str);
            return defaultValue;
        }
    }
    
    /**
     * Safely convert string to long
     * @param str String to convert
     * @param defaultValue Default value if conversion fails
     * @return Long value or default value
     */
    public static long safeParseLong(String str, long defaultValue) {
        try {
            return Long.parseLong(str);
        } catch (NumberFormatException e) {
            Log.w(TAG, "Error parsing long: " + str);
            return defaultValue;
        }
    }
    
    /**
     * Safely convert string to boolean
     * @param str String to convert
     * @param defaultValue Default value if conversion fails
     * @return Boolean value or default value
     */
    public static boolean safeParseBoolean(String str, boolean defaultValue) {
        if (isNullOrEmpty(str)) {
            return defaultValue;
        }
        
        String lowerStr = str.toLowerCase();
        if ("true".equals(lowerStr) || "1".equals(lowerStr) || "yes".equals(lowerStr)) {
            return true;
        } else if ("false".equals(lowerStr) || "0".equals(lowerStr) || "no".equals(lowerStr)) {
            return false;
        }
        
        return defaultValue;
    }
} 