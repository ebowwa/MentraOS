# ASG to Phone Retry/ACK System Implementation Plan

## Executive Summary

This document outlines the implementation plan for adding a reliable message delivery system from Android Smart Glasses (ASG) to the phone, complementing the existing phone-to-glasses retry/ACK mechanism. The system will ensure critical messages from glasses are delivered reliably while maintaining efficiency for streaming data.

## Current State Analysis

### Existing Phone → Glasses System (MentraLiveSGC.java)

- **Message ID Generation**: Esoteric IDs using timestamp XOR device ID XOR random
- **Tracking**: `ConcurrentHashMap<Long, PendingMessage>` for pending messages
- **Retry Logic**: Max 3 attempts with exponential backoff (1s base delay)
- **Timeout**: 2 seconds default, dynamic for chunked messages
- **ACK Format**: `{"type": "msg_ack", "mId": <messageId>}`
- **Build Compatibility**: Only for glasses with build number >= 5

### Current Glasses → Phone System

- **No retry mechanism**: Fire-and-forget messaging
- **No message IDs**: Most responses lack tracking
- **No ACK handling**: Phone doesn't acknowledge glasses messages
- **Components**:
  - `ResponseSender`: Sends responses without tracking
  - `CommunicationManager`: Sends various message types
  - `CommandProcessor`: Processes incoming commands

## Design Goals

1. **Selective Reliability**: Only critical messages require ACK/retry
2. **Resource Efficiency**: Minimal overhead on glasses (limited resources)
3. **Backward Compatibility**: Works with existing phone apps
4. **No Circular Dependencies**: Prevent ACK loops
5. **Layer Separation**: Keep transport (BLE) and protocol (ACK) separate

## Architecture Design

### Component Overview

```
┌─────────────────────────────────────────────────────────┐
│                     ASG Client                           │
├─────────────────────────────────────────────────────────┤
│  Application Layer                                       │
│  ┌─────────────────────────────────────────────────┐   │
│  │ CommandProcessor                                 │   │
│  │  - Processes incoming commands                   │   │
│  │  - Handles incoming ACKs                         │   │
│  │  - Routes to handlers                            │   │
│  └─────────────────────────────────────────────────┘   │
│                          ↕                               │
│  ┌─────────────────────────────────────────────────┐   │
│  │ ResponseSender                                   │   │
│  │  - Sends responses                               │   │
│  │  - Determines message criticality                │   │
│  │  - Integrates with ReliableMessageManager        │   │
│  └─────────────────────────────────────────────────┘   │
│                          ↕                               │
│  Protocol Layer                                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │ ReliableMessageManager (NEW)                     │   │
│  │  - Generates message IDs (high bit set)          │   │
│  │  - Tracks pending messages                       │   │
│  │  - Implements retry logic                        │   │
│  │  - Handles ACK timeouts                          │   │
│  └─────────────────────────────────────────────────┘   │
│                          ↕                               │
│  Transport Layer                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ K900BluetoothManager                             │   │
│  │  - BLE communication only                        │   │
│  │  - No ACK logic                                  │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Message ID Strategy

Both phone and glasses use the same simple approach for generating unique message IDs:

```java
// Same approach on both sides - keep it simple
long messageId = Math.abs(timestamp ^ randomComponent ^ counter);
```

**Why collision doesn't matter:**

- Phone tracks its sent messages in its own HashMap
- Glasses track their sent messages in their own HashMap
- These are completely separate memory spaces
- Even if IDs collided (astronomically unlikely), they'd be handled correctly since each side only removes ACKs from its own pending map
- No need for complex bit manipulation or ID ranges

### Message Categories

Following the same simple approach as the phone-to-glasses system, messages are simply categorized as either reliable (needs ACK/retry) or unreliable (fire-and-forget).

#### Reliable Messages (Get ACK/Retry)

Simple set of messages that need guaranteed delivery:

```java
// Messages that need ACK/retry
private static final Set<String> RELIABLE_TYPES = Set.of(
    // Critical operations
    "photo_captured",
    "photo_failed",
    "video_started",
    "video_stopped",
    "video_failed",
    "auth_token_status",

    // Important status changes
    "error",
    "wifi_connected",
    "wifi_disconnected",
    "settings_updated",
    "ota_download_progress",
    "ota_installation_progress"
);
```

All reliable messages use the same parameters:

- **Timeout**: 1000ms (1 second)
- **Max Retries**: 2 (total of 3 attempts)
- **Backoff**: Exponential (1s, 2s, 4s)

#### Unreliable Messages (No Retry)

Everything else is sent without retry:

- `battery_status` - Periodic updates
- `imu_stream_data` - High frequency sensor data
- `audio_data` - Real-time streaming
- `ping_response` - Heartbeat responses
- `wifi_scan_result` - Can be re-requested
- `version_info` - Can be re-requested

#### Never-Retry Messages

Messages that explicitly MUST NOT have message IDs to prevent loops:

```java
private static final Set<String> NEVER_RETRY = Set.of(
    "msg_ack",
    "keep_alive_ack"
);
```

## Implementation Details

### 1. ReliableMessageManager Component

```java
package com.augmentos.asg_client.service.communication.reliability;

import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import org.json.JSONException;
import org.json.JSONObject;
import java.security.SecureRandom;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

public class ReliableMessageManager {
    private static final String TAG = "ReliableMessageManager";

    // Configuration - Keep it simple like the phone side
    private static final long ACK_TIMEOUT_MS = 1000;      // 1 second timeout
    private static final int MAX_RETRIES = 2;             // 2 retries (3 total attempts)
    private static final long MAX_PENDING_MESSAGES = 10;  // Resource constraint
    private static final long CLEANUP_INTERVAL_MS = 30000; // 30 seconds

    // State
    private final ConcurrentHashMap<Long, PendingMessage> pendingMessages;
    private final AtomicLong messageIdCounter;
    private final SecureRandom secureRandom;
    private final Handler retryHandler;
    private final IMessageSender messageSender;
    private boolean enabled = false;
    private int phoneVersionNumber = 0;

    // Statistics
    private long totalMessagesSent = 0;
    private long totalAcksReceived = 0;
    private long totalRetries = 0;
    private long totalFailures = 0;

    public interface IMessageSender {
        boolean sendData(byte[] data);
    }

    private static class PendingMessage {
        final JSONObject message;
        final long timestamp;
        final int retryCount;
        final Runnable timeoutRunnable;

        PendingMessage(JSONObject message, int retryCount, Runnable timeoutRunnable) {
            this.message = message;
            this.timestamp = System.currentTimeMillis();
            this.retryCount = retryCount;
            this.timeoutRunnable = timeoutRunnable;
        }
    }

    public ReliableMessageManager(IMessageSender sender) {
        this.messageSender = sender;
        this.pendingMessages = new ConcurrentHashMap<>();
        this.messageIdCounter = new AtomicLong(1);
        this.secureRandom = new SecureRandom();
        this.retryHandler = new Handler(Looper.getMainLooper());

        // Schedule periodic cleanup
        scheduleCleanup();
    }

    /**
     * Send a message with optional retry based on message type
     */
    public boolean sendMessage(JSONObject message) {
        String type = message.optString("type", "");

        // Simple decision - needs reliability or not
        if (!enabled || !MessageReliability.needsReliability(type)) {
            return sendDirectly(message);
        }

        // Check resource limits
        if (pendingMessages.size() >= MAX_PENDING_MESSAGES) {
            Log.w(TAG, "Pending message buffer full, sending without retry");
            return sendDirectly(message);
        }

        try {
            long messageId = generateMessageId();
            message.put("mId", messageId);

            // Track the message
            trackMessage(messageId, message);

            // Send immediately
            boolean sent = sendDirectly(message);
            if (sent) {
                totalMessagesSent++;
            }
            return sent;

        } catch (JSONException e) {
            Log.e(TAG, "Error adding message ID", e);
            return sendDirectly(message);
        }
    }

    /**
     * Handle incoming ACK from phone
     */
    public void handleAck(long messageId) {
        PendingMessage pending = pendingMessages.remove(messageId);
        if (pending != null) {
            // Cancel timeout
            retryHandler.removeCallbacks(pending.timeoutRunnable);
            totalAcksReceived++;

            Log.d(TAG, String.format("ACK received for message %d (attempts: %d, time: %dms)",
                messageId, pending.retryCount + 1,
                System.currentTimeMillis() - pending.timestamp));
        }
    }

    /**
     * Enable/disable reliability based on phone version
     */
    public void setEnabled(boolean enabled, int phoneVersion) {
        this.enabled = enabled;
        this.phoneVersionNumber = phoneVersion;
        Log.i(TAG, "Reliability " + (enabled ? "enabled" : "disabled") +
                   " for phone version " + phoneVersion);
    }

    private long generateMessageId() {
        // Same approach as phone - simple and effective
        long timestamp = System.currentTimeMillis();
        long randomComponent = secureRandom.nextLong();
        long counter = messageIdCounter.getAndIncrement();

        // Ensure positive (same as phone)
        return Math.abs(timestamp ^ randomComponent ^ counter);
    }

    private void trackMessage(long messageId, JSONObject message) {
        Runnable timeoutRunnable = () -> handleTimeout(messageId);

        PendingMessage pending = new PendingMessage(message, 0, timeoutRunnable);

        pendingMessages.put(messageId, pending);

        // Schedule timeout check
        retryHandler.postDelayed(timeoutRunnable, ACK_TIMEOUT_MS);
    }

    private void handleTimeout(long messageId) {
        PendingMessage pending = pendingMessages.get(messageId);
        if (pending == null) return;

        if (pending.retryCount < MAX_RETRIES) {
            // Retry
            Log.w(TAG, String.format("Timeout for message %d, retrying (%d/%d)",
                messageId, pending.retryCount + 1, MAX_RETRIES));

            totalRetries++;
            retryMessage(messageId, pending);
        } else {
            // Max retries reached
            Log.e(TAG, String.format("Message %d failed after %d attempts",
                messageId, MAX_RETRIES + 1));

            pendingMessages.remove(messageId);
            totalFailures++;
        }
    }

    private void retryMessage(long messageId, PendingMessage pending) {
        // Create updated pending message with incremented retry count
        PendingMessage updated = new PendingMessage(
            pending.message,
            pending.retryCount + 1,
            pending.timeoutRunnable
        );

        pendingMessages.put(messageId, updated);

        // Send again
        sendDirectly(pending.message);

        // Reschedule timeout with exponential backoff
        long backoffDelay = ACK_TIMEOUT_MS * (1L << pending.retryCount);
        retryHandler.postDelayed(pending.timeoutRunnable, backoffDelay);
    }

    private boolean sendDirectly(JSONObject message) {
        try {
            String jsonString = message.toString();
            return messageSender.sendData(jsonString.getBytes());
        } catch (Exception e) {
            Log.e(TAG, "Error sending message", e);
            return false;
        }
    }

    private void scheduleCleanup() {
        retryHandler.postDelayed(() -> {
            cleanupOldMessages();
            scheduleCleanup();
        }, CLEANUP_INTERVAL_MS);
    }

    private void cleanupOldMessages() {
        long now = System.currentTimeMillis();
        long cutoff = now - (CLEANUP_INTERVAL_MS * 2);

        pendingMessages.entrySet().removeIf(entry -> {
            PendingMessage pending = entry.getValue();
            if (pending.timestamp < cutoff) {
                Log.w(TAG, "Removing stale message: " + entry.getKey());
                retryHandler.removeCallbacks(pending.timeoutRunnable);
                return true;
            }
            return false;
        });
    }

    public void shutdown() {
        retryHandler.removeCallbacksAndMessages(null);
        pendingMessages.clear();
    }

    // Statistics methods
    public JSONObject getStatistics() throws JSONException {
        JSONObject stats = new JSONObject();
        stats.put("total_sent", totalMessagesSent);
        stats.put("total_acks", totalAcksReceived);
        stats.put("total_retries", totalRetries);
        stats.put("total_failures", totalFailures);
        stats.put("pending_count", pendingMessages.size());
        stats.put("enabled", enabled);
        return stats;
    }
}
```

### 2. Message Reliability Helper

```java
package com.augmentos.asg_client.service.communication.reliability;

import java.util.Set;

/**
 * Simple reliability checker - mirrors phone's boolean approach
 */
public class MessageReliability {

    // Messages that need ACK/retry - keep it simple
    private static final Set<String> RELIABLE_TYPES = Set.of(
        // Critical operations
        "photo_captured",
        "photo_failed",
        "video_started",
        "video_stopped",
        "video_failed",
        "auth_token_status",

        // Important status changes
        "error",
        "wifi_connected",
        "wifi_disconnected",
        "settings_updated",
        "ota_download_progress",
        "ota_installation_progress"
    );

    // Messages that NEVER get retry (prevent loops)
    private static final Set<String> NEVER_RETRY = Set.of(
        "msg_ack",
        "keep_alive_ack"
    );

    /**
     * Simple boolean check - does this message need reliability?
     */
    public static boolean needsReliability(String messageType) {
        if (messageType == null || NEVER_RETRY.contains(messageType)) {
            return false;
        }
        return RELIABLE_TYPES.contains(messageType);
    }
}
```

### 3. Integration Points

#### 3.1 ResponseSender Modifications

```java
// Add to ResponseSender.java

private ReliableMessageManager reliableManager;

public ResponseSender(AsgClientServiceManager serviceManager) {
    this.serviceManager = serviceManager;

    // Initialize reliability manager
    this.reliableManager = new ReliableMessageManager(
        data -> serviceManager.getBluetoothManager().sendData(data)
    );
}

/**
 * Send a generic response with reliability support
 */
public void sendGenericResponse(String responseType, JSONObject data, long messageId) {
    if (!isBluetoothConnected()) {
        Log.d(TAG, "Cannot send response - not connected");
        return;
    }

    try {
        JSONObject response = new JSONObject();
        response.put("type", responseType);
        if (data != null) {
            response.put("data", data);
        }
        response.put("timestamp", System.currentTimeMillis());

        // Simple boolean check - use reliable sending or not
        boolean sent = reliableManager.sendMessage(response);

        Log.d(TAG, String.format("Sent %s response (reliable: %s)",
                                 responseType,
                                 MessageReliability.needsReliability(responseType)));
    } catch (JSONException e) {
        Log.e(TAG, "Error creating response", e);
    }
}
```

#### 3.2 CommandProcessor Modifications

```java
// Add to CommandProcessor.java

private ReliableMessageManager reliableManager;

// In constructor, get reference from ResponseSender
this.reliableManager = responseSender.getReliableManager();

// In processJsonCommand method
private void processJsonCommand(JSONObject json) {
    try {
        // Check for ACK first
        String type = json.optString("type", "");
        if ("msg_ack".equals(type)) {
            long messageId = json.optLong("mId", -1);

            // Handle ACK for our sent message
            if (messageId != -1) {
                reliableManager.handleAck(messageId);
                Log.d(TAG, "Received ACK for message: " + messageId);
                return; // Don't process ACKs further
            }
        }

        // Continue with normal processing...
        CommandData commandData = extractCommandData(json);
        // ...
    } catch (Exception e) {
        Log.e(TAG, "Error processing command", e);
    }
}
```

#### 3.3 CommunicationManager Modifications

```java
// Add to CommunicationManager.java

private ReliableMessageManager reliableManager;

// Initialize in constructor
public CommunicationManager(/* existing params */) {
    // ... existing initialization

    this.reliableManager = new ReliableMessageManager(
        data -> serviceManager.getBluetoothManager().sendData(data)
    );
}

// Modify sendWifiStatusOverBle and similar methods
public void sendWifiStatusOverBle(boolean connected, String ssid) {
    try {
        JSONObject response = new JSONObject();
        response.put("type", connected ? "wifi_connected" : "wifi_disconnected");
        response.put("ssid", ssid);
        response.put("timestamp", System.currentTimeMillis());

        // Simple send - reliability handled automatically based on type
        reliableManager.sendMessage(response);

    } catch (JSONException e) {
        Log.e(TAG, "Error creating WiFi status", e);
    }
}
```

### 4. Phone-Side Modifications (MentraLiveSGC.java)

```java
// Add to processJsonMessage in MentraLiveSGC

private void processJsonMessage(JSONObject json) {
    Log.d(TAG, "Processing JSON from glasses: " + json.toString());

    try {
        // Check for message ID that needs ACK
        if (json.has("mId")) {
            long messageId = json.getLong("mId");
            // Send ACK back to glasses
            sendAckToGlasses(messageId);
        }

        // Check if this is an ACK for our message
        String type = json.optString("type", "");
        if ("msg_ack".equals(type)) {
            long messageId = json.optLong("mId", -1);
            if (messageId != -1) {
                processAckResponse(messageId);
                return;
            }
        }

        // Continue normal processing...
    } catch (Exception e) {
        Log.e(TAG, "Error processing JSON", e);
    }
}

// New method to send ACK to glasses
private void sendAckToGlasses(long messageId) {
    try {
        JSONObject ack = new JSONObject();
        ack.put("type", "msg_ack");
        ack.put("mId", messageId);
        ack.put("timestamp", System.currentTimeMillis());

        String ackStr = ack.toString();
        Log.d(TAG, "Sending ACK to glasses for message: " + messageId);

        // Send without retry (ACKs are never retried)
        sendDataToGlasses(ackStr, false);

    } catch (JSONException e) {
        Log.e(TAG, "Error creating ACK", e);
    }
}
```

## Testing Strategy

### Phase 1: Unit Tests

1. **ReliableMessageManager Tests**
   - Message ID generation uniqueness
   - Retry logic with mock sender
   - Timeout handling
   - Resource limit enforcement
   - Cleanup of old messages

2. **Priority Classification Tests**
   - Correct priority assignment for each message type
   - ACK-exempt message handling

### Phase 2: Integration Tests

1. **Mock BLE Environment**
   - Simulate message loss scenarios
   - Test retry behavior
   - Verify ACK handling

2. **Resource Constraint Tests**
   - Fill pending message buffer
   - Test cleanup under memory pressure
   - Verify performance with many retries

### Phase 3: End-to-End Tests

1. **Real Device Testing**
   - Test with actual Mentra Live glasses
   - Verify with different phone models
   - Test in poor connectivity conditions

2. **Backward Compatibility**
   - Test with older phone app versions
   - Verify graceful degradation

### Test Scenarios

| Scenario                     | Expected Behavior                                 |
| ---------------------------- | ------------------------------------------------- |
| Photo captured, ACK received | Message removed from pending, no retry            |
| Photo captured, no ACK       | Retry 3 times, then fail                          |
| WiFi connected, ACK delayed  | ACK received during retry, cancel further retries |
| IMU stream data              | No message ID added, no retry                     |
| ACK message sent             | Never has message ID, never retried               |
| Buffer full (10 messages)    | New critical messages sent without retry          |
| Phone doesn't support ACKs   | Messages sent without IDs, no retries             |

## Rollout Plan

### Phase 1: Foundation (Week 1)

- [ ] Implement ReliableMessageManager
- [ ] Add MessagePriority enum
- [ ] Write unit tests
- [ ] Code review

### Phase 2: Integration (Week 2)

- [ ] Integrate with ResponseSender
- [ ] Modify CommandProcessor for ACK handling
- [ ] Update CommunicationManager methods
- [ ] Integration testing

### Phase 3: Phone Support (Week 3)

- [ ] Update MentraLiveSGC to send ACKs
- [ ] Test with modified phone app
- [ ] Verify backward compatibility

### Phase 4: Staged Rollout (Week 4)

- [ ] Enable for internal testing builds
- [ ] Monitor statistics and logs
- [ ] Tune timeout and retry parameters
- [ ] Enable for beta users

### Phase 5: Production (Week 5)

- [ ] Full rollout with feature flag
- [ ] Monitor performance metrics
- [ ] Gather failure statistics
- [ ] Optimize based on real-world data

## Monitoring and Metrics

### Key Metrics to Track

1. **Reliability Metrics**
   - ACK success rate by message type
   - Average retry count before success
   - Failure rate after max retries
   - Message latency distribution

2. **Resource Metrics**
   - Pending message buffer usage
   - Memory overhead
   - CPU usage during retries
   - Battery impact

3. **Network Metrics**
   - BLE connection stability
   - Message throughput
   - Retry storm detection

### Logging Strategy

```java
// Structured logging for analysis
Log.d(TAG, String.format("RELIABILITY_METRIC|type=%s|event=%s|messageId=%d|attempt=%d|latency=%d",
    messageType, event, messageId, attemptNumber, latencyMs));
```

## Configuration Parameters

```java
// Simplified configuration - same for all reliable messages
public class ReliabilityConfig {
    // Uniform timeout and retry for all reliable messages
    public static final long ACK_TIMEOUT_MS = 1000;        // 1 second
    public static final int MAX_RETRIES = 2;               // 2 retries (3 total attempts)

    // Resource limits
    public static final int MAX_PENDING_MESSAGES = 10;     // Glasses have limited memory
    public static final long CLEANUP_INTERVAL_MS = 30000;  // 30 second cleanup

    // Feature flags
    public static boolean ENABLED = false;                 // Disabled by default
    public static int MIN_PHONE_VERSION = 5;              // Same as phone requirement
}
```

## Risk Analysis

### Risks and Mitigations

| Risk                   | Impact | Mitigation                                             |
| ---------------------- | ------ | ------------------------------------------------------ |
| ACK loops              | High   | ACK messages never have mId; whitelist of no-ACK types |
| Resource exhaustion    | Medium | Limited pending buffer (10); aggressive cleanup        |
| Battery drain          | Medium | Selective retry only for critical; exponential backoff |
| Backward compatibility | Medium | Feature detection; graceful degradation                |
| Network congestion     | Low    | Rate limiting; streaming data exempt                   |

## Success Criteria

1. **Reliability**: >95% delivery success for critical messages
2. **Performance**: <5% increase in battery usage
3. **Compatibility**: Works with 100% of existing phone apps
4. **Resource Usage**: <100KB memory overhead
5. **Latency**: <50ms added latency for non-retry case

## Future Enhancements

1. **Adaptive Timeouts**: Adjust based on connection quality
2. **Priority Queuing**: Ensure critical messages sent first
3. **Compression**: For large messages requiring retry
4. **Telemetry**: Cloud reporting of reliability metrics
5. **Smart Retry**: Skip retry if newer message supersedes
6. **Batch ACKs**: Acknowledge multiple messages at once

## Conclusion

This implementation provides a robust, resource-efficient reliability layer for critical glasses-to-phone messages while maintaining backward compatibility and preventing common pitfalls like ACK loops. The phased rollout ensures we can validate and tune the system before full deployment.
