# BLE Threshold Test for AugmentOS

## Overview
This test is designed to identify the exact byte threshold that causes BLE receive failures on the ASG client (glasses). Based on RTMP streaming logs, we suspect that after ~7,560 bytes are sent from phone to glasses, the BLE receive path on the glasses stops working.

## Test Implementation

### Phone Side (MentraLiveSGC.java)
The test is implemented in the `MentraLiveSGC.java` file with the following features:

1. **Test Toggle**: `BLE_THRESHOLD_TEST_ENABLED = true` (set to false to disable)
2. **Fast Heartbeat**: Sends padded pings every 3 seconds instead of 30 seconds
3. **Large Packets**: Each ping includes 240 bytes of padding to match RTMP packet size
4. **Byte Tracking**: Accurately counts total bytes sent including protocol overhead
5. **Failure Detection**: Monitors for missed pong responses

### Test Parameters
```java
private static final boolean BLE_THRESHOLD_TEST_ENABLED = true; // Toggle test
private static final int BLE_TEST_HEARTBEAT_INTERVAL_MS = 3000; // 3 seconds
private static final int BLE_TEST_PING_PADDING_SIZE = 240; // Padding bytes
private static final int MAX_MISSED_PONGS = 3; // Failure after 3 missed pongs
```

### What Happens During the Test

1. **Connection Established**: When glasses connect, test starts automatically
2. **Padded Pings Sent**: Every 3 seconds, sends a ping with 240 bytes of padding
3. **Byte Counting**: Each packet is ~290 bytes (ping data + JSON wrapper + protocol overhead)
4. **Pong Monitoring**: Tracks successful pong responses and missed pongs
5. **Failure Detection**: After 3 consecutive missed pongs, logs failure details

### Expected Output

#### During Normal Operation:
```
🔬 BLE TEST - Ping #1 sent
📏 Packet size: 291 bytes (ping: 257, overhead: 34)
📊 Total bytes sent: 291 bytes
⏱️ Test duration: 3 seconds
✅ BLE TEST - Pong received after 3s, total bytes sent: 291
```

#### When Failure Detected:
```
⚠️ BLE TEST - Missed pong #1 (last pong 4s ago)
⚠️ BLE TEST - Missed pong #2 (last pong 7s ago)
⚠️ BLE TEST - Missed pong #3 (last pong 10s ago)
🚨🚨🚨 BLE RECEIVE FAILURE DETECTED! 🚨🚨🚨
📊 Total bytes sent before failure: 7854 bytes
⏱️ Time until failure: 27 seconds (0 minutes)
💔 Consecutive missed pongs: 3
🔍 Last successful pong was 10 seconds ago
📐 Estimated failure threshold: ~7854 bytes
```

## Running the Test

1. **Enable Test**: Ensure `BLE_THRESHOLD_TEST_ENABLED = true` in MentraLiveSGC.java
2. **Build & Deploy**: Build `mobile` and install on phone
3. **Connect Glasses**: Connect Mentra Live glasses via the app
4. **Monitor Logs**: Use `adb logcat | grep "BLE TEST"` to see test output
5. **Wait for Failure**: Test will run until BLE receive fails (~5-7 minutes based on RTMP data)

## Analyzing Results

The test will tell you:
- **Exact byte count** when BLE receive fails
- **Time elapsed** before failure
- **Number of successful packets** before failure

## Theory Validation

If our theory is correct:
- Failure should occur around **7,500-8,000 bytes**
- Time to failure: ~25-30 packets × 3 seconds = **75-90 seconds**
- This would match the 5-7 minute RTMP failure (larger packets, less frequent)

## Next Steps

Once we identify the exact threshold:
1. Test if it's consistent across multiple runs
2. Try different packet sizes to confirm it's byte-based, not time-based
3. Investigate BLE driver/buffer management at the identified threshold
4. Implement workarounds (buffer flush, connection reset, etc.)

## Disabling the Test

To return to normal operation:
1. Set `BLE_THRESHOLD_TEST_ENABLED = false`
2. Rebuild and redeploy
3. Normal 30-second heartbeats will resume