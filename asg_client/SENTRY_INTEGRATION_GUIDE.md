# Sentry Integration Guide for ASG Client

## 🚀 Overview

This guide covers how to effectively utilize Sentry for comprehensive crash reporting, error tracking, and issue monitoring in your ASG Client Android application.

## 📋 Current Setup

Your ASG Client already has Sentry configured with:
- ✅ **Sentry Android Gradle Plugin** (v5.8.0)
- ✅ **sentry.properties** with auth token
- ✅ **Source map uploads** enabled
- ✅ **Basic error reporting** in MainActivity

## 🛠️ Enhanced Implementation

### 1. **SentryUtils Class** (Already Created)

The `SentryUtils` class provides centralized methods for:
- **Error reporting** with context
- **Performance monitoring**
- **User context management**
- **Breadcrumb tracking**
- **Service lifecycle events**

### 2. **Key Integration Points**

#### **Application Lifecycle**
```java
// In MainActivity.onCreate()
SentryUtils.initializeSentry(this);
SentryUtils.reportAppStartup();
```

#### **Service Events**
```java
// In AsgClientService
SentryUtils.reportServiceEvent("AsgClientService", "started");
SentryUtils.reportServiceEvent("AsgClientService", "stopped");
```

#### **Network Operations**
```java
// Report HTTP requests
SentryUtils.reportNetworkOperation("GET", "https://api.example.com/data", 200);
SentryUtils.reportNetworkOperation("POST", "https://api.example.com/upload", 500);
```

#### **Bluetooth Operations**
```java
// Report BLE events
SentryUtils.reportBluetoothOperation("connect", deviceAddress, true);
SentryUtils.reportBluetoothOperation("disconnect", deviceAddress, false);
```

#### **Camera Operations**
```java
// Report camera events
SentryUtils.reportCameraOperation("photo_capture", true, "Resolution: 1920x1080");
SentryUtils.reportCameraOperation("video_recording", false, "Permission denied");
```

#### **Streaming Events**
```java
// Report RTMP streaming
SentryUtils.reportStreamingEvent("stream_start", rtmpUrl, true);
SentryUtils.reportStreamingEvent("stream_error", rtmpUrl, false);
```

#### **OTA Update Events**
```java
// Report OTA operations
SentryUtils.reportOtaEvent("download_start", "v2.1.0", true);
SentryUtils.reportOtaEvent("install_failed", "v2.1.0", false);
```

## 🎯 Best Practices

### 1. **Error Reporting Strategy**

#### **Critical Errors**
```java
try {
    // Critical operation
    performCriticalOperation();
} catch (Exception e) {
    SentryUtils.reportCriticalError("critical_operation", "Failed to perform critical operation", e);
}
```

#### **Non-Critical Errors**
```java
try {
    // Non-critical operation
    performNonCriticalOperation();
} catch (Exception e) {
    Log.w(TAG, "Non-critical error", e);
    // Don't report to Sentry for non-critical issues
}
```

### 2. **Performance Monitoring**

#### **Track Operation Times**
```java
long startTime = System.currentTimeMillis();
// Perform operation
long duration = System.currentTimeMillis() - startTime;
SentryUtils.reportPerformanceMetric("operation_duration", duration, "ms");
```

#### **Memory Usage**
```java
Runtime runtime = Runtime.getRuntime();
long usedMemory = runtime.totalMemory() - runtime.freeMemory();
SentryUtils.reportPerformanceMetric("memory_usage", usedMemory, "bytes");
```

### 3. **User Context**

#### **Set User Information**
```java
// When user logs in
SentryUtils.setUserContext("user123", "john_doe", "john@example.com");

// When user logs out
SentryUtils.clearUserContext();
```

### 4. **Custom Tags and Context**

#### **Add Custom Tags**
```java
Sentry.setTag("device_type", "k900");
Sentry.setTag("firmware_version", "1.2.3");
Sentry.setTag("network_type", "wifi");
```

#### **Add Custom Context**
```java
Map<String, Object> context = new HashMap<>();
context.put("battery_level", batteryLevel);
context.put("charging_status", isCharging);
context.put("wifi_connected", isWifiConnected);
Sentry.setContexts("device_status", context);
```

## 📊 Monitoring Dashboard

### **Key Metrics to Track**

1. **Crash Rate**
   - Monitor overall app stability
   - Track crashes by Android version
   - Identify problematic devices

2. **Performance Metrics**
   - Service startup time
   - Network request duration
   - Memory usage patterns

3. **Feature Usage**
   - Camera operations success rate
   - Bluetooth connection stability
   - Streaming reliability

4. **Error Patterns**
   - Most common error types
   - Error frequency by device model
   - Error correlation with app version

## 🔧 Implementation Examples

### **Example 1: Bluetooth Manager Integration**

```java
public class BluetoothManager {
    public void connect(String deviceAddress) {
        try {
            // Connection logic
            boolean success = performConnection(deviceAddress);
            SentryUtils.reportBluetoothOperation("connect", deviceAddress, success);
        } catch (Exception e) {
            SentryUtils.reportCriticalError("bluetooth_connection", "Failed to connect to device", e);
        }
    }
}
```

### **Example 2: Network Manager Integration**

```java
public class NetworkManager {
    public void makeRequest(String url, String method) {
        try {
            // Network request logic
            Response response = performRequest(url, method);
            SentryUtils.reportNetworkOperation(method, url, response.getCode());
        } catch (Exception e) {
            SentryUtils.reportCriticalError("network_request", "Failed to make network request", e);
        }
    }
}
```

### **Example 3: Camera Service Integration**

```java
public class CameraService {
    public void capturePhoto(String requestId) {
        try {
            // Photo capture logic
            String filePath = performPhotoCapture();
            SentryUtils.reportCameraOperation("photo_capture", true, "File: " + filePath);
        } catch (Exception e) {
            SentryUtils.reportCameraOperation("photo_capture", false, e.getMessage());
            SentryUtils.reportCriticalError("camera_capture", "Failed to capture photo", e);
        }
    }
}
```

## 🚨 Alert Configuration

### **Recommended Alerts**

1. **High Crash Rate**
   - Alert when crash rate > 5% in 1 hour
   - Monitor by app version and device model

2. **Service Failures**
   - Alert when AsgClientService fails to start
   - Monitor service restart frequency

3. **Critical Feature Failures**
   - Alert when camera operations fail > 10% of attempts
   - Alert when Bluetooth connections fail > 20% of attempts

4. **Performance Degradation**
   - Alert when average response time > 5 seconds
   - Monitor memory usage spikes

## 📈 Dashboard Views

### **Create Custom Dashboards**

1. **Overview Dashboard**
   - Total crashes (24h)
   - Error rate by feature
   - Performance metrics

2. **Device-Specific Dashboard**
   - Crashes by device model
   - Android version distribution
   - Hardware-specific issues

3. **Feature Health Dashboard**
   - Camera operation success rate
   - Bluetooth connection stability
   - Streaming reliability metrics

## 🔍 Debugging with Sentry

### **Using Breadcrumbs**

Breadcrumbs help trace the user's path before an error:

```java
// Add breadcrumbs for user actions
Sentry.addBreadcrumb(new Breadcrumb()
    .setCategory("user_action")
    .setMessage("User pressed capture button")
    .setLevel(SentryLevel.INFO));

// Add breadcrumbs for system events
Sentry.addBreadcrumb(new Breadcrumb()
    .setCategory("system")
    .setMessage("WiFi state changed: connected")
    .setLevel(SentryLevel.INFO));
```

### **Custom Error Context**

```java
Sentry.withScope(scope -> {
    scope.setTag("operation", "photo_capture");
    scope.setContexts("camera", Map.of(
        "resolution", "1920x1080",
        "flash_enabled", "true",
        "focus_mode", "auto"
    ));
    
    // This error will include the custom context
    Sentry.captureException(exception);
});
```

## 🎯 Next Steps

1. **Implement SentryUtils** in all major components
2. **Add performance monitoring** for critical operations
3. **Set up alerts** for important metrics
4. **Create custom dashboards** for different stakeholders
5. **Regular review** of error patterns and performance trends

## 📞 Support

- **Sentry Documentation**: https://docs.sentry.io/platforms/android/
- **Dashboard URL**: https://ahmad-wv.sentry.io/issues/?project=asg
- **Project Settings**: https://ahmad-wv.sentry.io/settings/projects/asg/

---

*This guide provides a comprehensive framework for utilizing Sentry effectively in your ASG Client application. Regular monitoring and analysis of the data will help improve app stability and user experience.* 