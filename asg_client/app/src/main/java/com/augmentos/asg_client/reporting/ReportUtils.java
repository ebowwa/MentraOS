package com.augmentos.asg_client.reporting;

import android.content.Context;
import android.util.Log;

import com.augmentos.asg_client.reporting.providers.SentryReportProvider;

import java.util.Map;
import java.util.UUID;

/**
 * Utility class providing convenient methods for common reporting scenarios
 * Follows Single Responsibility Principle - only provides reporting utilities
 */
public class ReportUtils {
    
    private static final String TAG = "ReportUtils";
    
    /**
     * Initialize the report manager with default providers
     */
    public static void initialize(Context context) {
        ReportManager manager = ReportManager.getInstance(context);
        
        // Add console provider for debugging
        //manager.addProvider(new ConsoleReportProvider());

        // Add Sentry provider for production monitoring
        manager.addProvider(new SentryReportProvider());
        
        // Generate session ID
        String sessionId = UUID.randomUUID().toString();
        manager.setSessionId(sessionId);
        
        Log.i(TAG, "Report manager initialized with session ID: " + sessionId);
    }
    
    /**
     * Report application startup
     */
    public static void reportAppStartup(Context context) {
        ReportManager.getInstance(context).report(
            new ReportData.Builder()
                .message("Application started")
                .level(ReportLevel.INFO)
                .category("app.lifecycle")
                .operation("startup")
        );
    }
    
    /**
     * Report service lifecycle events
     */
    public static void reportServiceEvent(Context context, String serviceName, String event) {
        ReportManager.getInstance(context).report(
            new ReportData.Builder()
                .message(serviceName + " - " + event)
                .level(ReportLevel.INFO)
                .category("service.lifecycle")
                .operation(event)
                .tag("service_name", serviceName)
        );
    }
    
    /**
     * Report network operations
     */
    public static void reportNetworkOperation(Context context, String method, String url, int statusCode) {
        ReportLevel level = statusCode >= 400 ? ReportLevel.ERROR : ReportLevel.INFO;
        
        ReportManager.getInstance(context).report(
            new ReportData.Builder()
                .message(method + " " + url + " (" + statusCode + ")")
                .level(level)
                .category("http")
                .operation(method)
                .tag("method", method)
                .tag("url", url)
                .tag("status_code", statusCode)
        );
    }
    
    /**
     * Report Bluetooth operations
     */
    public static void reportBluetoothOperation(Context context, String operation, String deviceAddress, boolean success) {
        ReportLevel level = success ? ReportLevel.INFO : ReportLevel.ERROR;
        
        ReportManager.getInstance(context).report(
            new ReportData.Builder()
                .message(operation + " - " + (success ? "SUCCESS" : "FAILED"))
                .level(level)
                .category("bluetooth")
                .operation(operation)
                .tag("operation", operation)
                .tag("device_address", deviceAddress)
                .tag("success", success)
        );
    }
    
    // =====================================
    // 🔵 BLUETOOTH EXCEPTION REPORTING
    // =====================================
    
    /**
     * Report Bluetooth connection failures
     */
    public static void reportBluetoothConnectionFailure(Context context, String deviceType, String deviceAddress, String reason, Throwable exception) {
        ReportManager.getInstance(context).report(
            new ReportData.Builder()
                .message("Bluetooth connection failed: " + reason)
                .level(ReportLevel.ERROR)
                .category("bluetooth.connection")
                .operation("connect")
                .tag("device_type", deviceType)
                .tag("device_address", deviceAddress)
                .tag("failure_reason", reason)
                .exception(exception)
        );
    }
    
    /**
     * Report GATT server failures
     */
    public static void reportGattServerFailure(Context context, String operation, String deviceAddress, int errorCode, Throwable exception) {
        ReportManager.getInstance(context).report(
            new ReportData.Builder()
                .message("GATT server failure: " + operation + " (error: " + errorCode + ")")
                .level(ReportLevel.CRITICAL)
                .category("bluetooth.gatt")
                .operation(operation)
                .tag("operation", operation)
                .tag("device_address", deviceAddress)
                .tag("error_code", errorCode)
                .exception(exception)
        );
    }
    
    /**
     * Report BLE advertising failures
     */
    public static void reportAdvertisingFailure(Context context, int errorCode, String deviceName) {
        ReportManager.getInstance(context).report(
            new ReportData.Builder()
                .message("BLE advertising failed (error: " + errorCode + ")")
                .level(ReportLevel.ERROR)
                .category("bluetooth.advertising")
                .operation("start_advertising")
                .tag("error_code", errorCode)
                .tag("device_name", deviceName)
        );
    }
    
    /**
     * Report data transmission failures
     */
    public static void reportDataTransmissionFailure(Context context, String deviceType, String deviceAddress, int dataSize, String reason, Throwable exception) {
        ReportManager.getInstance(context).report(
            new ReportData.Builder()
                .message("Data transmission failed: " + reason + " (" + dataSize + " bytes)")
                .level(ReportLevel.ERROR)
                .category("bluetooth.data")
                .operation("send_data")
                .tag("device_type", deviceType)
                .tag("device_address", deviceAddress)
                .tag("data_size", dataSize)
                .tag("failure_reason", reason)
                .exception(exception)
        );
    }
    
    /**
     * Report serial communication failures (K900)
     */
    public static void reportSerialCommunicationFailure(Context context, String operation, String serialPath, int errorCode, Throwable exception) {
        ReportManager.getInstance(context).report(
            new ReportData.Builder()
                .message("Serial communication failed: " + operation + " (error: " + errorCode + ")")
                .level(ReportLevel.CRITICAL)
                .category("bluetooth.serial")
                .operation(operation)
                .tag("operation", operation)
                .tag("serial_path", serialPath)
                .tag("error_code", errorCode)
                .exception(exception)
        );
    }
    
    /**
     * Report file transfer failures
     */
    public static void reportFileTransferFailure(Context context, String filePath, String operation, String reason, Throwable exception) {
        ReportManager.getInstance(context).report(
            new ReportData.Builder()
                .message("File transfer failed: " + operation + " - " + reason)
                .level(ReportLevel.ERROR)
                .category("bluetooth.file_transfer")
                .operation(operation)
                .tag("file_path", filePath)
                .tag("operation", operation)
                .tag("failure_reason", reason)
                .exception(exception)
        );
    }
    
    /**
     * Report file transfer packet retry exhaustion
     */
    public static void reportFileTransferRetryExhaustion(Context context, String filePath, int packetIndex, int maxRetries) {
        ReportManager.getInstance(context).report(
            new ReportData.Builder()
                .message("File transfer packet retry exhausted: packet " + packetIndex + " after " + maxRetries + " retries")
                .level(ReportLevel.ERROR)
                .category("bluetooth.file_transfer")
                .operation("send_packet")
                .tag("file_path", filePath)
                .tag("packet_index", packetIndex)
                .tag("max_retries", maxRetries)
        );
    }
    
    /**
     * Report MTU negotiation failures
     */
    public static void reportMtuNegotiationFailure(Context context, String deviceAddress, int requestedMtu, int actualMtu, String reason) {
        ReportManager.getInstance(context).report(
            new ReportData.Builder()
                .message("MTU negotiation failed: requested " + requestedMtu + ", got " + actualMtu + " - " + reason)
                .level(ReportLevel.WARNING)
                .category("bluetooth.mtu")
                .operation("negotiate_mtu")
                .tag("device_address", deviceAddress)
                .tag("requested_mtu", requestedMtu)
                .tag("actual_mtu", actualMtu)
                .tag("failure_reason", reason)
        );
    }
    
    /**
     * Report pairing failures
     */
    public static void reportPairingFailure(Context context, String deviceAddress, int retryCount, String reason) {
        ReportManager.getInstance(context).report(
            new ReportData.Builder()
                .message("Bluetooth pairing failed after " + retryCount + " retries: " + reason)
                .level(ReportLevel.ERROR)
                .category("bluetooth.pairing")
                .operation("pair_device")
                .tag("device_address", deviceAddress)
                .tag("retry_count", retryCount)
                .tag("failure_reason", reason)
        );
    }
    
    /**
     * Report permission errors
     */
    public static void reportBluetoothPermissionError(Context context, String operation, String permission) {
        ReportManager.getInstance(context).report(
            new ReportData.Builder()
                .message("Bluetooth permission denied: " + permission + " for " + operation)
                .level(ReportLevel.ERROR)
                .category("bluetooth.permissions")
                .operation(operation)
                .tag("operation", operation)
                .tag("permission", permission)
        );
    }
    
    /**
     * Report connection state inconsistencies
     */
    public static void reportConnectionStateInconsistency(Context context, String deviceAddress, String expectedState, String actualState, String operation) {
        ReportManager.getInstance(context).report(
            new ReportData.Builder()
                .message("Connection state inconsistency: expected " + expectedState + ", got " + actualState)
                .level(ReportLevel.WARNING)
                .category("bluetooth.connection")
                .operation(operation)
                .tag("device_address", deviceAddress)
                .tag("expected_state", expectedState)
                .tag("actual_state", actualState)
                .tag("operation", operation)
        );
    }
    
    /**
     * Report message parsing errors
     */
    public static void reportMessageParsingError(Context context, String deviceType, String messageType, String reason, Throwable exception) {
        ReportManager.getInstance(context).report(
            new ReportData.Builder()
                .message("Message parsing failed: " + messageType + " - " + reason)
                .level(ReportLevel.ERROR)
                .category("bluetooth.protocol")
                .operation("parse_message")
                .tag("device_type", deviceType)
                .tag("message_type", messageType)
                .tag("failure_reason", reason)
                .exception(exception)
        );
    }
    
    /**
     * Report ACK timeout errors
     */
    public static void reportAckTimeoutError(Context context, String operation, int packetIndex, long timeoutMs) {
        ReportManager.getInstance(context).report(
            new ReportData.Builder()
                .message("ACK timeout: " + operation + " packet " + packetIndex + " after " + timeoutMs + "ms")
                .level(ReportLevel.WARNING)
                .category("bluetooth.protocol")
                .operation(operation)
                .tag("operation", operation)
                .tag("packet_index", packetIndex)
                .tag("timeout_ms", timeoutMs)
        );
    }
    
    /**
     * Report Bluetooth adapter issues
     */
    public static void reportBluetoothAdapterIssue(Context context, String issue, String details) {
        ReportManager.getInstance(context).report(
            new ReportData.Builder()
                .message("Bluetooth adapter issue: " + issue + " - " + details)
                .level(ReportLevel.CRITICAL)
                .category("bluetooth.hardware")
                .operation("adapter_check")
                .tag("issue", issue)
                .tag("details", details)
        );
    }
    
    /**
     * Report device type detection errors
     */
    public static void reportDeviceTypeDetectionError(Context context, String detectedType, String expectedType, String reason) {
        ReportManager.getInstance(context).report(
            new ReportData.Builder()
                .message("Device type detection error: detected " + detectedType + ", expected " + expectedType + " - " + reason)
                .level(ReportLevel.WARNING)
                .category("bluetooth.detection")
                .operation("detect_device_type")
                .tag("detected_type", detectedType)
                .tag("expected_type", expectedType)
                .tag("reason", reason)
        );
    }
    
    /**
     * Report Bluetooth initialization failures
     */
    public static void reportBluetoothInitializationFailure(Context context, String deviceType, String reason, Throwable exception) {
        ReportManager.getInstance(context).report(
            new ReportData.Builder()
                .message("Bluetooth initialization failed: " + reason)
                .level(ReportLevel.CRITICAL)
                .category("bluetooth.initialization")
                .operation("initialize")
                .tag("device_type", deviceType)
                .tag("failure_reason", reason)
                .exception(exception)
        );
    }
    
    /**
     * Report Bluetooth shutdown issues
     */
    public static void reportBluetoothShutdownIssue(Context context, String deviceType, String issue, Throwable exception) {
        ReportManager.getInstance(context).report(
            new ReportData.Builder()
                .message("Bluetooth shutdown issue: " + issue)
                .level(ReportLevel.WARNING)
                .category("bluetooth.shutdown")
                .operation("shutdown")
                .tag("device_type", deviceType)
                .tag("issue", issue)
                .exception(exception)
        );
    }
    
    // =====================================
    // 📹 STREAMING EXCEPTION REPORTING
    // =====================================
    
    /**
     * Report RTMP connection failures
     */
    public static void reportRtmpConnectionFailure(Context context, String rtmpUrl, String reason, Throwable exception) {
        ReportManager.getInstance(context).report(
            new ReportData.Builder()
                .message("RTMP connection failed: " + reason)
                .level(ReportLevel.ERROR)
                .category("streaming.rtmp")
                .operation("connect")
                .tag("rtmp_url", rtmpUrl)
                .tag("failure_reason", reason)
                .exception(exception)
        );
    }
    
    /**
     * Report RTMP connection loss
     */
    public static void reportRtmpConnectionLost(Context context, String rtmpUrl, long streamDuration, String reason) {
        ReportManager.getInstance(context).report(
            new ReportData.Builder()
                .message("RTMP connection lost after " + streamDuration + "ms: " + reason)
                .level(ReportLevel.ERROR)
                .category("streaming.rtmp")
                .operation("connection_lost")
                .tag("rtmp_url", rtmpUrl)
                .tag("stream_duration_ms", streamDuration)
                .tag("failure_reason", reason)
        );
    }
    
    /**
     * Report streaming initialization failures
     */
    public static void reportStreamingInitializationFailure(Context context, String rtmpUrl, String reason, Throwable exception) {
        ReportManager.getInstance(context).report(
            new ReportData.Builder()
                .message("Streaming initialization failed: " + reason)
                .level(ReportLevel.CRITICAL)
                .category("streaming.initialization")
                .operation("initialize")
                .tag("rtmp_url", rtmpUrl)
                .tag("failure_reason", reason)
                .exception(exception)
        );
    }
    
    /**
     * Report camera access failures
     */
    public static void reportCameraAccessFailure(Context context, String operation, String reason, Throwable exception) {
        ReportManager.getInstance(context).report(
            new ReportData.Builder()
                .message("Camera access failed: " + operation + " - " + reason)
                .level(ReportLevel.ERROR)
                .category("streaming.camera")
                .operation(operation)
                .tag("operation", operation)
                .tag("failure_reason", reason)
                .exception(exception)
        );
    }
    
    /**
     * Report camera busy errors
     */
    public static void reportCameraBusyError(Context context, String operation) {
        ReportManager.getInstance(context).report(
            new ReportData.Builder()
                .message("Camera busy error: " + operation)
                .level(ReportLevel.WARNING)
                .category("streaming.camera")
                .operation(operation)
                .tag("operation", operation)
                .tag("error_type", "camera_busy")
        );
    }
    
    /**
     * Report surface creation failures
     */
    public static void reportSurfaceCreationFailure(Context context, String operation, String reason, Throwable exception) {
        ReportManager.getInstance(context).report(
            new ReportData.Builder()
                .message("Surface creation failed: " + operation + " - " + reason)
                .level(ReportLevel.ERROR)
                .category("streaming.surface")
                .operation(operation)
                .tag("operation", operation)
                .tag("failure_reason", reason)
                .exception(exception)
        );
    }
    
    /**
     * Report streamer configuration failures
     */
    public static void reportStreamerConfigurationFailure(Context context, String configType, String reason, Throwable exception) {
        ReportManager.getInstance(context).report(
            new ReportData.Builder()
                .message("Streamer configuration failed: " + configType + " - " + reason)
                .level(ReportLevel.ERROR)
                .category("streaming.configuration")
                .operation("configure")
                .tag("config_type", configType)
                .tag("failure_reason", reason)
                .exception(exception)
        );
    }
    
    /**
     * Report preview start failures
     */
    public static void reportPreviewStartFailure(Context context, String reason, Throwable exception) {
        ReportManager.getInstance(context).report(
            new ReportData.Builder()
                .message("Preview start failed: " + reason)
                .level(ReportLevel.ERROR)
                .category("streaming.preview")
                .operation("start_preview")
                .tag("failure_reason", reason)
                .exception(exception)
        );
    }
    
    /**
     * Report stream start failures
     */
    public static void reportStreamStartFailure(Context context, String rtmpUrl, String reason, Throwable exception) {
        ReportManager.getInstance(context).report(
            new ReportData.Builder()
                .message("Stream start failed: " + reason)
                .level(ReportLevel.ERROR)
                .category("streaming.start")
                .operation("start_stream")
                .tag("rtmp_url", rtmpUrl)
                .tag("failure_reason", reason)
                .exception(exception)
        );
    }
    
    /**
     * Report stream stop failures
     */
    public static void reportStreamStopFailure(Context context, String reason, Throwable exception) {
        ReportManager.getInstance(context).report(
            new ReportData.Builder()
                .message("Stream stop failed: " + reason)
                .level(ReportLevel.WARNING)
                .category("streaming.stop")
                .operation("stop_stream")
                .tag("failure_reason", reason)
                .exception(exception)
        );
    }
    
    /**
     * Report reconnection failures
     */
    public static void reportReconnectionFailure(Context context, String rtmpUrl, int attempt, int maxAttempts, String reason) {
        ReportManager.getInstance(context).report(
            new ReportData.Builder()
                .message("Reconnection failed: attempt " + attempt + "/" + maxAttempts + " - " + reason)
                .level(ReportLevel.ERROR)
                .category("streaming.reconnection")
                .operation("reconnect")
                .tag("rtmp_url", rtmpUrl)
                .tag("attempt", attempt)
                .tag("max_attempts", maxAttempts)
                .tag("failure_reason", reason)
        );
    }
    
    /**
     * Report reconnection exhaustion
     */
    public static void reportReconnectionExhaustion(Context context, String rtmpUrl, int maxAttempts, long totalDuration) {
        ReportManager.getInstance(context).report(
            new ReportData.Builder()
                .message("Reconnection exhausted: " + maxAttempts + " attempts over " + totalDuration + "ms")
                .level(ReportLevel.CRITICAL)
                .category("streaming.reconnection")
                .operation("reconnect_exhausted")
                .tag("rtmp_url", rtmpUrl)
                .tag("max_attempts", maxAttempts)
                .tag("total_duration_ms", totalDuration)
        );
    }
    
    /**
     * Report stream timeout errors
     */
    public static void reportStreamTimeoutError(Context context, String streamId, long timeoutMs) {
        ReportManager.getInstance(context).report(
            new ReportData.Builder()
                .message("Stream timeout: " + streamId + " after " + timeoutMs + "ms")
                .level(ReportLevel.WARNING)
                .category("streaming.timeout")
                .operation("stream_timeout")
                .tag("stream_id", streamId)
                .tag("timeout_ms", timeoutMs)
        );
    }
    
    /**
     * Report StreamPack library errors
     */
    public static void reportStreamPackError(Context context, String errorType, String message, boolean isRetryable) {
        ReportLevel level = isRetryable ? ReportLevel.WARNING : ReportLevel.ERROR;
        
        ReportManager.getInstance(context).report(
            new ReportData.Builder()
                .message("StreamPack error: " + errorType + " - " + message)
                .level(level)
                .category("streaming.streampack")
                .operation("library_error")
                .tag("error_type", errorType)
                .tag("error_message", message)
                .tag("is_retryable", isRetryable)
        );
    }
    
    /**
     * Report service lifecycle failures
     */
    public static void reportStreamingServiceFailure(Context context, String operation, String reason, Throwable exception) {
        ReportManager.getInstance(context).report(
            new ReportData.Builder()
                .message("Streaming service failure: " + operation + " - " + reason)
                .level(ReportLevel.CRITICAL)
                .category("streaming.service")
                .operation(operation)
                .tag("operation", operation)
                .tag("failure_reason", reason)
                .exception(exception)
        );
    }
    
    /**
     * Report wake lock failures
     */
    public static void reportWakeLockFailure(Context context, String operation, String reason) {
        ReportManager.getInstance(context).report(
            new ReportData.Builder()
                .message("Wake lock failure: " + operation + " - " + reason)
                .level(ReportLevel.WARNING)
                .category("streaming.wakelock")
                .operation(operation)
                .tag("operation", operation)
                .tag("failure_reason", reason)
        );
    }
    
    /**
     * Report notification failures
     */
    public static void reportNotificationFailure(Context context, String operation, String reason, Throwable exception) {
        ReportManager.getInstance(context).report(
            new ReportData.Builder()
                .message("Notification failure: " + operation + " - " + reason)
                .level(ReportLevel.WARNING)
                .category("streaming.notification")
                .operation(operation)
                .tag("operation", operation)
                .tag("failure_reason", reason)
                .exception(exception)
        );
    }
    
    /**
     * Report EventBus failures
     */
    public static void reportEventBusFailure(Context context, String eventType, String reason, Throwable exception) {
        ReportManager.getInstance(context).report(
            new ReportData.Builder()
                .message("EventBus failure: " + eventType + " - " + reason)
                .level(ReportLevel.WARNING)
                .category("streaming.eventbus")
                .operation("post_event")
                .tag("event_type", eventType)
                .tag("failure_reason", reason)
                .exception(exception)
        );
    }
    
    /**
     * Report URL validation failures
     */
    public static void reportUrlValidationFailure(Context context, String rtmpUrl, String reason) {
        ReportManager.getInstance(context).report(
            new ReportData.Builder()
                .message("URL validation failed: " + reason)
                .level(ReportLevel.ERROR)
                .category("streaming.validation")
                .operation("validate_url")
                .tag("rtmp_url", rtmpUrl)
                .tag("failure_reason", reason)
        );
    }
    
    /**
     * Report permission errors for streaming
     */
    public static void reportStreamingPermissionError(Context context, String permission, String operation) {
        ReportManager.getInstance(context).report(
            new ReportData.Builder()
                .message("Streaming permission denied: " + permission + " for " + operation)
                .level(ReportLevel.ERROR)
                .category("streaming.permissions")
                .operation(operation)
                .tag("permission", permission)
                .tag("operation", operation)
        );
    }
    
    /**
     * Report state inconsistency errors
     */
    public static void reportStreamingStateInconsistency(Context context, String expectedState, String actualState, String operation) {
        ReportManager.getInstance(context).report(
            new ReportData.Builder()
                .message("Streaming state inconsistency: expected " + expectedState + ", got " + actualState)
                .level(ReportLevel.WARNING)
                .category("streaming.state")
                .operation(operation)
                .tag("expected_state", expectedState)
                .tag("actual_state", actualState)
                .tag("operation", operation)
        );
    }
    
    /**
     * Report resource cleanup failures
     */
    public static void reportResourceCleanupFailure(Context context, String resourceType, String reason, Throwable exception) {
        ReportManager.getInstance(context).report(
            new ReportData.Builder()
                .message("Resource cleanup failed: " + resourceType + " - " + reason)
                .level(ReportLevel.WARNING)
                .category("streaming.cleanup")
                .operation("cleanup")
                .tag("resource_type", resourceType)
                .tag("failure_reason", reason)
                .exception(exception)
        );
    }
    
    /**
     * Report performance issues
     */
    public static void reportStreamingPerformanceIssue(Context context, String metric, long value, String unit, String threshold) {
        ReportManager.getInstance(context).report(
            new ReportData.Builder()
                .message("Streaming performance issue: " + metric + " = " + value + " " + unit + " (threshold: " + threshold + ")")
                .level(ReportLevel.WARNING)
                .category("streaming.performance")
                .operation("performance_check")
                .tag("metric", metric)
                .tag("value", value)
                .tag("unit", unit)
                .tag("threshold", threshold)
        );
    }
    
    /**
     * Report camera operations
     */
    public static void reportCameraOperation(Context context, String operation, boolean success, String details) {
        ReportLevel level = success ? ReportLevel.INFO : ReportLevel.ERROR;
        
        ReportManager.getInstance(context).report(
            new ReportData.Builder()
                .message(operation + " - " + (success ? "SUCCESS" : "FAILED"))
                .level(level)
                .category("camera")
                .operation(operation)
                .tag("operation", operation)
                .tag("success", success)
                .context("details", details)
        );
    }
    
    /**
     * Report streaming events
     */
    public static void reportStreamingEvent(Context context, String event, String streamUrl, boolean success) {
        ReportLevel level = success ? ReportLevel.INFO : ReportLevel.ERROR;
        
        ReportManager.getInstance(context).report(
            new ReportData.Builder()
                .message(event + " - " + (success ? "SUCCESS" : "FAILED"))
                .level(level)
                .category("streaming")
                .operation(event)
                .tag("event", event)
                .tag("stream_url", streamUrl)
                .tag("success", success)
        );
    }
    
    /**
     * Report OTA update events
     */
    public static void reportOtaEvent(Context context, String event, String version, boolean success) {
        ReportLevel level = success ? ReportLevel.INFO : ReportLevel.ERROR;
        
        ReportManager.getInstance(context).report(
            new ReportData.Builder()
                .message(event + " - " + (success ? "SUCCESS" : "FAILED"))
                .level(level)
                .category("ota")
                .operation(event)
                .tag("event", event)
                .tag("version", version)
                .tag("success", success)
        );
    }
    
    /**
     * Report critical errors with additional context
     */
    public static void reportCriticalError(Context context, String errorType, String message, Throwable exception) {
        ReportManager.getInstance(context).report(
            new ReportData.Builder()
                .message(message)
                .level(ReportLevel.CRITICAL)
                .category("error")
                .operation(errorType)
                .tag("error_type", errorType)
                .context("error_type", errorType)
                .context("error_message", message)
                .exception(exception)
        );
    }
    
    /**
     * Report performance metrics
     */
    public static void reportPerformanceMetric(Context context, String metricName, long value, String unit) {
        ReportManager.getInstance(context).report(
            new ReportData.Builder()
                .message("Performance Metric: " + metricName + " = " + value + " " + unit)
                .level(ReportLevel.INFO)
                .category("performance")
                .operation("metric")
                .tag("metric_name", metricName)
                .tag("metric_unit", unit)
                .context("metric_name", metricName)
                .context("value", value)
                .context("unit", unit)
        );
    }
    
    /**
     * Report user actions
     */
    public static void reportUserAction(Context context, String action, Map<String, Object> parameters) {
        ReportManager manager = ReportManager.getInstance(context);
        
        ReportData.Builder builder = new ReportData.Builder()
            .message("User action: " + action)
            .level(ReportLevel.INFO)
            .category("user.action")
            .operation(action)
            .tag("action", action);
        
        // Add parameters as context
        if (parameters != null) {
            for (Map.Entry<String, Object> param : parameters.entrySet()) {
                builder.context(param.getKey(), param.getValue());
            }
        }
        
        manager.report(builder);
    }
    
    /**
     * Add breadcrumb for debugging
     */
    public static void addBreadcrumb(Context context, String message, String category, ReportLevel level) {
        ReportManager.getInstance(context).addBreadcrumb(message, category, level);
    }
    
    /**
     * Set user context
     */
    public static void setUserContext(Context context, String userId, String username, String email) {
        ReportManager.getInstance(context).setUserContext(userId, username, email);
    }
    
    /**
     * Clear user context
     */
    public static void clearUserContext(Context context) {
        ReportManager.getInstance(context).clearUserContext();
    }
    
    /**
     * Enable/disable a specific provider
     */
    public static void setProviderEnabled(Context context, String providerName, boolean enabled) {
        ReportManager.getInstance(context).setProviderEnabled(providerName, enabled);
    }
    
    /**
     * Get enabled provider names
     */
    public static java.util.List<String> getEnabledProviders(Context context) {
        return ReportManager.getInstance(context).getEnabledProviderNames();
    }
} 