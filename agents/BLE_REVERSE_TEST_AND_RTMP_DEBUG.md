# BLE Reverse Test and RTMP Debug Documentation

## Overview
After discovering that phone→glasses direction can handle 50k+ bytes without failure, we're now testing the reverse direction (glasses→phone) and adding comprehensive RTMP failure logging.

## Test 1: BLE Reverse Direction Test

### Purpose
Test if the BLE failure during RTMP streaming is caused by the glasses sending too much data TO the phone, overwhelming the phone's BLE receive buffer.

### Implementation

#### Phone Side (MentraLiveSGC.java)
- `BLE_REVERSE_TEST_ENABLED = true` - Enables reverse test mode
- Sends small pings every 3 seconds
- Tracks total bytes RECEIVED from glasses
- Monitors for missed pongs
- Dumps thread states on failure

#### Glasses Side (AsgClientService.java)
- `BLE_REVERSE_TEST = true` - Enables large pong responses
- Each pong includes 240 bytes of padding (matching RTMP packet size)
- Total pong size: ~260 bytes per response

### Expected Behavior
If glasses→phone direction is the issue:
- Failure should occur after receiving ~7,500-8,000 bytes from glasses
- This would be ~29 large pongs × 260 bytes
- Time to failure: ~87 seconds (29 × 3 seconds)

### Test Output
```
🔬 BLE REVERSE TEST - Ping #1 sent (small ping to trigger large pong)
📡 BLE REVERSE TEST - Received 291 bytes, total: 291
✅ BLE REVERSE TEST - Pong received after 3s
📊 Total bytes received from glasses: 291 bytes
📏 Pong contains 240 bytes of padding
```

## Test 2: RTMP Failure Diagnostics

### Enhanced Logging
When RTMP stream times out, the system now logs:

1. **Error Detection**:
   ```
   🚨🚨🚨 RTMP STREAM ERROR DETECTED 🚨🚨🚨
   📄 Error details: Stream timed out - no keep-alive from cloud
   ⏱️ Timestamp: 1749419754275
   ```

2. **Diagnostic Information**:
   - Total bytes received from glasses in session
   - Last heartbeat counter value
   - Time since last successful pong
   - BLE connection state details

3. **Thread State Dump**:
   ```
   📸 THREAD STATE DUMP - START
   📌 Thread: Binder:32149_4 (ID: 65, State: RUNNABLE, Priority: 5)
       at android.os.MessageQueue.nativePollOnce(Native Method)
       at android.os.MessageQueue.next(MessageQueue.java:335)
       ... 3 more frames
   📸 THREAD STATE DUMP - END
   ```

### What to Look For

1. **Thread States**:
   - BLOCKED threads (indicates deadlock)
   - WAITING threads on specific locks
   - Threads stuck in BLE operations

2. **Timing Patterns**:
   - How long since last pong when RTMP fails?
   - Are heartbeats still working when keep-alives fail?

3. **Byte Counts**:
   - Total bytes received when failure occurs
   - Does it match our ~7.5KB hypothesis?

## Running Both Tests

### Setup
1. Enable both tests in the code (already done)
2. Build and deploy both apps:
   ```bash
   # Phone app
   cd mobile
   ./gradlew assembleDebug
   adb install -r app/build/outputs/apk/debug/app-debug.apk
   
   # Glasses app
   cd asg_client
   ./gradlew assembleDebug
   adb install -r app/build/outputs/apk/debug/app-debug.apk
   ```

3. Monitor logs:
   ```bash
   # For reverse test
   adb logcat | grep -E "BLE REVERSE TEST|📡|✅|🔬"
   
   # For RTMP debugging
   adb logcat | grep -E "RTMP|🚨|📸|Thread:"
   ```

### Test Scenarios

#### Scenario 1: Reverse Test Only
1. Connect glasses
2. Let reverse test run
3. Watch for failure after ~87 seconds

#### Scenario 2: RTMP Streaming
1. Connect glasses
2. Start RTMP stream
3. Wait for timeout (~5-7 minutes)
4. Analyze comprehensive logs

## Theory Validation

### If Reverse Direction is the Issue:
- Reverse test will fail at ~7.5KB received
- RTMP logs will show similar byte count at failure
- Thread dump might show BLE RX thread blocked

### If It's Something Else:
- Reverse test will run indefinitely without failure
- RTMP logs might show:
  - Specific thread deadlocks
  - Parser thread issues
  - Different byte counts than expected

## Next Steps

Based on test results:

1. **If reverse direction fails at threshold**:
   - Investigate phone's BLE RX buffer management
   - Try buffer flush mechanisms
   - Implement flow control

2. **If reverse direction doesn't fail**:
   - Focus on RTMP-specific issues
   - Analyze thread dumps for deadlocks
   - Check message processing queues

3. **If neither shows clear pattern**:
   - Look at timing/race conditions
   - Check for resource leaks
   - Monitor memory usage during streaming