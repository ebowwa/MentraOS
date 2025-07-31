# Sentry Quick Reference - ASG Client

## 🚀 Immediate Implementation

### 1. **Add to Existing Classes**

#### **MainActivity.java** ✅ (Already Done)
```java
// Already implemented in onCreate()
SentryUtils.initializeSentry(this);
SentryUtils.reportAppStartup();
```

#### **AsgClientService.java** ✅ (Already Done)
```java
// Already implemented in onCreate()
SentryUtils.initializeSentry(this);
SentryUtils.reportServiceEvent("AsgClientService", "created");
```

### 2. **Add to Other Components**

#### **BluetoothManager.java**
```java
// In connection methods
SentryUtils.reportBluetoothOperation("connect", deviceAddress, success);

// In error handling
SentryUtils.reportCriticalError("bluetooth_error", "Connection failed", exception);
```

#### **NetworkManager.java**
```java
// In request methods
SentryUtils.reportNetworkOperation("GET", url, statusCode);

// In error handling
SentryUtils.reportCriticalError("network_error", "Request failed", exception);
```

#### **CameraService.java**
```java
// In capture methods
SentryUtils.reportCameraOperation("photo_capture", success, details);

// In error handling
SentryUtils.reportCriticalError("camera_error", "Capture failed", exception);
```

#### **StreamingService.java**
```java
// In streaming methods
SentryUtils.reportStreamingEvent("stream_start", rtmpUrl, success);

// In error handling
SentryUtils.reportCriticalError("streaming_error", "Stream failed", exception);
```

## 📊 Key Metrics to Monitor

### **Critical Alerts**
- Crash rate > 5% in 1 hour
- Service startup failures
- Camera operation failures > 10%
- Bluetooth connection failures > 20%

### **Performance Metrics**
- Service startup time
- Network request duration
- Memory usage patterns
- Battery level impact

### **Feature Health**
- Camera success rate
- Bluetooth stability
- Streaming reliability
- OTA update success rate

## 🔧 Common Patterns

### **Try-Catch with Sentry**
```java
try {
    // Your operation
    performOperation();
} catch (Exception e) {
    SentryUtils.reportCriticalError("operation_name", "Operation failed", e);
}
```

### **Success/Failure Reporting**
```java
boolean success = performOperation();
SentryUtils.reportOperation("operation_name", success, "Additional details");
```

### **Performance Tracking**
```java
long startTime = System.currentTimeMillis();
// Your operation
long duration = System.currentTimeMillis() - startTime;
SentryUtils.reportPerformanceMetric("operation_duration", duration, "ms");
```

## 📱 Dashboard URLs

- **Issues**: https://ahmad-wv.sentry.io/issues/?project=asg
- **Performance**: https://ahmad-wv.sentry.io/performance/?project=asg
- **Releases**: https://ahmad-wv.sentry.io/releases/?project=asg
- **Settings**: https://ahmad-wv.sentry.io/settings/projects/asg/

## 🎯 Next Actions

1. **Add SentryUtils calls** to all error-prone methods
2. **Set up alerts** for critical metrics
3. **Create custom dashboards** for different teams
4. **Monitor and analyze** error patterns weekly
5. **Optimize based on** Sentry insights

---

*Use this reference for quick implementation. See `SENTRY_INTEGRATION_GUIDE.md` for detailed documentation.* 