# 📹 Streaming Exception Reporting Guide

This guide documents the comprehensive streaming exception reporting system integrated into the ASG Client application.

## 📋 Overview

The streaming exception reporting system provides detailed monitoring and reporting of all RTMP streaming-related errors, failures, and issues. This enables better debugging, monitoring, and reliability tracking for live video streaming operations.

## 🎯 Exception Categories

### 🔌 RTMP Connection
- **Connection Failures** - RTMP connection establishment failures
- **Connection Loss** - Active stream disconnections
- **URL Validation** - Invalid or malformed RTMP URLs

### 📹 Streaming Operations
- **Initialization Failures** - Streamer setup and configuration failures
- **Stream Start Failures** - Failed stream initiation
- **Stream Stop Failures** - Failed stream termination
- **Preview Issues** - Camera preview start/stop failures

### 📷 Camera & Hardware
- **Camera Access Failures** - Permission and hardware access issues
- **Camera Busy Errors** - Camera already in use by other operations
- **Surface Creation Failures** - Display surface creation issues

### 🔄 Reconnection & Recovery
- **Reconnection Failures** - Failed reconnection attempts
- **Reconnection Exhaustion** - All reconnection attempts failed
- **Stream Timeouts** - Keep-alive timeout errors

### ⚙️ System & Configuration
- **StreamPack Library Errors** - Third-party library failures
- **Service Lifecycle Failures** - Android service issues
- **Permission Errors** - Missing required permissions
- **State Inconsistencies** - Unexpected state transitions

## 🛠️ Reporting Methods

### RTMP Connection

#### `reportRtmpConnectionFailure()`
Reports RTMP connection establishment failures.

```java
ReportUtils.reportRtmpConnectionFailure(context, rtmpUrl, reason, exception);
```

**Parameters:**
- `rtmpUrl` - The RTMP URL being connected to
- `reason` - Failure reason (e.g., "timeout", "refused", "network_error")
- `exception` - Associated exception (can be null)

#### `reportRtmpConnectionLost()`
Reports active RTMP connection losses.

```java
ReportUtils.reportRtmpConnectionLost(context, rtmpUrl, streamDuration, reason);
```

**Parameters:**
- `rtmpUrl` - The RTMP URL that was connected to
- `streamDuration` - Duration of the stream in milliseconds
- `reason` - Reason for connection loss

#### `reportUrlValidationFailure()`
Reports RTMP URL validation failures.

```java
ReportUtils.reportUrlValidationFailure(context, rtmpUrl, reason);
```

**Parameters:**
- `rtmpUrl` - The invalid RTMP URL
- `reason` - Validation failure reason

### Streaming Operations

#### `reportStreamingInitializationFailure()`
Reports streaming initialization failures.

```java
ReportUtils.reportStreamingInitializationFailure(context, rtmpUrl, reason, exception);
```

**Parameters:**
- `rtmpUrl` - The RTMP URL being initialized for
- `reason` - Initialization failure reason
- `exception` - Associated exception

#### `reportStreamStartFailure()`
Reports stream start failures.

```java
ReportUtils.reportStreamStartFailure(context, rtmpUrl, reason, exception);
```

**Parameters:**
- `rtmpUrl` - The RTMP URL being started
- `reason` - Start failure reason
- `exception` - Associated exception

#### `reportStreamStopFailure()`
Reports stream stop failures.

```java
ReportUtils.reportStreamStopFailure(context, reason, exception);
```

**Parameters:**
- `reason` - Stop failure reason
- `exception` - Associated exception

#### `reportPreviewStartFailure()`
Reports camera preview failures.

```java
ReportUtils.reportPreviewStartFailure(context, reason, exception);
```

**Parameters:**
- `reason` - Preview failure reason
- `exception` - Associated exception

### Camera & Hardware

#### `reportCameraAccessFailure()`
Reports camera access failures.

```java
ReportUtils.reportCameraAccessFailure(context, operation, reason, exception);
```

**Parameters:**
- `operation` - Camera operation being attempted
- `reason` - Access failure reason
- `exception` - Associated exception

#### `reportCameraBusyError()`
Reports camera busy errors.

```java
ReportUtils.reportCameraBusyError(context, operation);
```

**Parameters:**
- `operation` - Operation that failed due to camera being busy

#### `reportSurfaceCreationFailure()`
Reports surface creation failures.

```java
ReportUtils.reportSurfaceCreationFailure(context, operation, reason, exception);
```

**Parameters:**
- `operation` - Surface operation being attempted
- `reason` - Creation failure reason
- `exception` - Associated exception

### Reconnection & Recovery

#### `reportReconnectionFailure()`
Reports individual reconnection failures.

```java
ReportUtils.reportReconnectionFailure(context, rtmpUrl, attempt, maxAttempts, reason);
```

**Parameters:**
- `rtmpUrl` - The RTMP URL being reconnected to
- `attempt` - Current reconnection attempt number
- `maxAttempts` - Maximum number of attempts
- `reason` - Reconnection failure reason

#### `reportReconnectionExhaustion()`
Reports when all reconnection attempts have failed.

```java
ReportUtils.reportReconnectionExhaustion(context, rtmpUrl, maxAttempts, totalDuration);
```

**Parameters:**
- `rtmpUrl` - The RTMP URL that failed to reconnect
- `maxAttempts` - Maximum number of attempts made
- `totalDuration` - Total time spent attempting reconnection

#### `reportStreamTimeoutError()`
Reports stream timeout errors.

```java
ReportUtils.reportStreamTimeoutError(context, streamId, timeoutMs);
```

**Parameters:**
- `streamId` - The stream ID that timed out
- `timeoutMs` - Timeout duration in milliseconds

### System & Configuration

#### `reportStreamPackError()`
Reports StreamPack library errors.

```java
ReportUtils.reportStreamPackError(context, errorType, message, isRetryable);
```

**Parameters:**
- `errorType` - Type of StreamPack error
- `message` - Error message from StreamPack
- `isRetryable` - Whether the error is retryable

#### `reportStreamingServiceFailure()`
Reports streaming service lifecycle failures.

```java
ReportUtils.reportStreamingServiceFailure(context, operation, reason, exception);
```

**Parameters:**
- `operation` - Service operation being attempted
- `reason` - Failure reason
- `exception` - Associated exception

#### `reportStreamingPermissionError()`
Reports streaming permission errors.

```java
ReportUtils.reportStreamingPermissionError(context, permission, operation);
```

**Parameters:**
- `permission` - Required permission that was denied
- `operation` - Operation requiring the permission

#### `reportStreamingStateInconsistency()`
Reports streaming state inconsistencies.

```java
ReportUtils.reportStreamingStateInconsistency(context, expectedState, actualState, operation);
```

**Parameters:**
- `expectedState` - Expected streaming state
- `actualState` - Actual streaming state
- `operation` - Operation that revealed the inconsistency

## 📊 Integration Examples

### RtmpStreamingService Integration

```java
// StreamPack error handling
@Override
public void onError(StreamPackError error) {
    Log.e(TAG, "Streaming error: " + error.getMessage());
    
    // Report StreamPack error
    boolean isRetryable = isRetryableError(error);
    ReportUtils.reportStreamPackError(RtmpStreamingService.this, 
        "stream_error", error.getMessage(), isRetryable);
    
    // Handle based on retryability
    if (isRetryable) {
        scheduleReconnect("stream_error");
    } else {
        stopStreaming();
    }
}

// RTMP connection failure
@Override
public void onFailed(String message) {
    Log.e(TAG, "RTMP connection failed: " + message);
    
    // Report RTMP connection failure
    ReportUtils.reportRtmpConnectionFailure(RtmpStreamingService.this, 
        mRtmpUrl, message, null);
    
    // Handle failure
    if (!isRetryableErrorString(message)) {
        // Fatal error
        return;
    }
    // Schedule reconnection
}

// Connection loss
@Override
public void onLost(String message) {
    long streamDuration = currentTime - mStreamStartTime;
    Log.i(TAG, "RTMP connection lost: " + message);
    
    // Report RTMP connection lost
    ReportUtils.reportRtmpConnectionLost(RtmpStreamingService.this, 
        mRtmpUrl, streamDuration, message);
    
    // Schedule reconnection
}

// Camera busy error
if (CameraNeo.isCameraInUse()) {
    Log.e(TAG, "Cannot start RTMP stream - camera is busy");
    
    // Report camera busy error
    ReportUtils.reportCameraBusyError(RtmpStreamingService.this, "start_streaming");
    return;
}

// URL validation failure
if (mRtmpUrl == null || mRtmpUrl.isEmpty()) {
    Log.e(TAG, "RTMP URL not set");
    
    // Report URL validation failure
    ReportUtils.reportUrlValidationFailure(RtmpStreamingService.this, 
        mRtmpUrl != null ? mRtmpUrl : "null", "URL is null or empty");
    return;
}

// Stream timeout
private void handleStreamTimeout(String streamId) {
    Log.w(TAG, "Stream timed out: " + streamId);
    
    // Report stream timeout error
    ReportUtils.reportStreamTimeoutError(RtmpStreamingService.this, 
        streamId, STREAM_TIMEOUT_MS);
    
    // Force stop the stream
    forceStopStreamingInternal();
}

// Reconnection exhaustion
if (mReconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    Log.w(TAG, "Maximum reconnection attempts reached");
    
    // Report reconnection exhaustion
    long totalDuration = System.currentTimeMillis() - mLastReconnectionTime;
    ReportUtils.reportReconnectionExhaustion(RtmpStreamingService.this, 
        mRtmpUrl, MAX_RECONNECT_ATTEMPTS, totalDuration);
    
    // Stop streaming
    stopStreaming();
}
```

## 📈 Monitoring & Analytics

### Key Metrics to Track

1. **Connection Success Rate**
   - Successful vs failed RTMP connections
   - Connection time distribution
   - Reconnection success rate

2. **Stream Reliability**
   - Stream duration distribution
   - Stream interruption frequency
   - Time between interruptions

3. **Camera Performance**
   - Camera access success rate
   - Camera busy frequency
   - Surface creation success rate

4. **Error Distribution**
   - Error types and frequency
   - Retryable vs fatal errors
   - Error patterns over time

### Alert Thresholds

- **Connection Failure Rate > 15%** - Investigate network/RTMP server issues
- **Stream Interruption Rate > 10%** - Investigate stability issues
- **Camera Access Failure Rate > 5%** - Investigate permission/hardware issues
- **Reconnection Exhaustion Rate > 5%** - Critical connectivity issue
- **Stream Timeout Rate > 3%** - Investigate keep-alive mechanism

## 🔧 Best Practices

### 1. Context-Rich Reporting
Always include relevant context in your reports:
- RTMP URL and stream ID
- Operation being performed
- Stream duration and timing
- Error codes and exception details

### 2. Appropriate Error Levels
Use the correct error levels:
- **CRITICAL** - Service failures, initialization failures, reconnection exhaustion
- **ERROR** - Connection failures, stream start/stop failures, camera access issues
- **WARNING** - Performance issues, timeouts, state inconsistencies
- **INFO** - Normal operations, successful recoveries

### 3. Exception Handling
Always wrap streaming operations in try-catch blocks and report exceptions:

```java
try {
    // Streaming operation
    boolean success = performStreamingOperation();
    if (!success) {
        ReportUtils.reportStreamStartFailure(context, rtmpUrl, 
            "operation_failed", null);
    }
} catch (Exception e) {
    ReportUtils.reportStreamStartFailure(context, rtmpUrl, 
        "exception_occurred", e);
}
```

### 4. Performance Monitoring
Track performance metrics alongside error reporting:

```java
long startTime = System.currentTimeMillis();
boolean success = startStreaming();
long duration = System.currentTimeMillis() - startTime;

if (success) {
    ReportUtils.reportPerformanceMetric(context, "stream_start_duration", duration, "ms");
} else {
    ReportUtils.reportStreamStartFailure(context, rtmpUrl, "timeout", null);
}
```

### 5. State Management
Monitor state transitions and report inconsistencies:

```java
if (mStreamState != expectedState) {
    ReportUtils.reportStreamingStateInconsistency(context, 
        expectedState.toString(), mStreamState.toString(), operation);
}
```

## 🚀 Future Enhancements

### Planned Features

1. **Real-time Streaming Dashboard**
   - Live stream status monitoring
   - Error rate visualization
   - Performance metrics display

2. **Predictive Analytics**
   - Failure pattern detection
   - Proactive issue identification
   - Performance trend analysis

3. **Automated Recovery**
   - Automatic retry mechanisms
   - Connection recovery strategies
   - Error resolution suggestions

4. **Enhanced Context**
   - Network quality metrics
   - Device performance data
   - Environmental factors

5. **Stream Quality Monitoring**
   - Bitrate monitoring
   - Frame rate tracking
   - Quality degradation detection

## 📚 Related Documentation

- [Generic Reporting System Guide](./GENERIC_REPORTING_SYSTEM.md)
- [ReportManager API Reference](./REPORTING_QUICK_REFERENCE.md)
- [Bluetooth Exception Reporting Guide](./BLUETOOTH_EXCEPTION_REPORTING_GUIDE.md)
- [Streaming Architecture Overview](./streaming/README.md)
- [Exception Handling Best Practices](./EXCEPTION_HANDLING_GUIDE.md)

---

This streaming exception reporting system provides comprehensive monitoring and debugging capabilities for all RTMP streaming operations in the ASG Client application, enabling better reliability and user experience for live video streaming. 