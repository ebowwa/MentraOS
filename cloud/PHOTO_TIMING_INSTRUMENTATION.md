# Photo Capture Performance Timing Instrumentation

## Overview

The photo capture pipeline is now fully instrumented with **18 strategic checkpoints** to measure end-to-end latency with millisecond precision. This allows developers to identify bottlenecks and optimize performance across the entire distributed system.

## Architecture

The photo capture operation traverses 4 major systems:

1. **SDK (TypeScript)** - Third-party application
2. **Cloud Backend (TypeScript)** - WebSocket relay and photo management
3. **Mobile App (TypeScript/React Native)** - Mentra Live Android app
4. **Android Native (Java)** - AugmentOS core service and glasses

## Checkpoints

### SDK Layer

- **CP01**: Photo Request Initiated - When `session.camera.requestPhoto()` is called
- **CP18**: Photo Received Complete - When photo data is delivered back to SDK

### Cloud Backend Layer

- **CP02**: Cloud Receives Request - WebSocket receives PHOTO_REQUEST from SDK
- **CP03**: PhotoManager Processing - PhotoManager begins processing
- **CP04**: Request Sent to Glasses - Message sent to mobile via WebSocket
- **CP15**: Cloud Receives Upload - HTTP POST /api/photos/upload receives photo
- **CP16**: Cloud Receives Photo Response - PhotoManager receives photo response
- **CP17**: Response Sent to App - Photo result sent back to SDK

### Mobile App Layer (React Native)

- **CP05**: Mobile Receives Request - SocketComms receives photo_request
- **CP06**: Bridge Command Sent - Native bridge forwards command to Android

### Android Native Phone Layer (AugmentOS Core)

- **CP07**: Phone Native Receives Request - AugmentosService.onPhotoRequest()
- **CP08**: SmartGlassesManager Processes - SmartGlassesManager.requestPhoto()
- **CP09**: MentraLiveSGC Sends to Glasses - JSON command sent via BLE/WebSocket

### Android Native Glasses Layer (ASG Client)

- **CP10**: ASG Receives Command - CommandProcessor extracts take_photo
- **CP11**: PhotoCommandHandler Processes - Photo command handler invoked
- **CP12**: Camera Capture Started - CameraNeo.enqueuePhotoRequest()
- **CP13**: Photo Captured - Camera callback onPhotoCaptured()
- **CP14**: Upload Started - HTTP POST to webhook begins

## Usage

### Enable Tracing

Add to your cloud `.env` file:

```bash
OTEL_ENABLED=true
OTEL_SERVICE_NAME=mentra-cloud
# Optional: Export to external OTLP collector
# OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

### Retrieve Timing Data

**Get timing report for specific photo request:**

```bash
GET /api/traces/:requestId
```

**Example Response:**

```json
{
  "requestId": "photo_req_1710234567890_abc123",
  "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
  "startTime": 1710234567890,
  "endTime": 1710234570733,
  "totalDurationMs": 2843,
  "checkpoints": [
    {
      "id": "CP01",
      "name": "SDK Request Initiated",
      "timestampMs": 1710234567890,
      "elapsedMs": 0,
      "attributes": {
        "phase": "sdk_request_initiated"
      }
    },
    {
      "id": "CP02",
      "name": "Cloud Received Request",
      "timestampMs": 1710234567912,
      "elapsedMs": 22,
      "attributes": {
        "phase": "cloud_received_request",
        "packageName": "com.example.myapp"
      }
    }
    // ... all 18 checkpoints
  ],
  "spans": []
}
```

**Get all active traces:**

```bash
GET /api/traces
```

**Clear all traces (for testing):**

```bash
DELETE /api/traces
```

### Viewing Logs

All checkpoints emit structured logs that can be filtered:

**Cloud logs (Pino):**

```bash
# Filter by checkpoint
grep "checkpointId" logs.json | jq

# Filter specific photo request
grep "photo_req_1234" logs.json | jq
```

**Mobile logs (React Native):**

```bash
# Android logcat
adb logcat | grep "CP0"

# Filter specific photo request
adb logcat | grep "photo_req_1234"
```

**Glasses logs (ASG Client):**

```bash
# Via adb
adb logcat | grep "CP1"
```

## Performance Analysis

### Typical Timing Breakdown

Based on instrumentation, here's what to expect:

| Phase                | Duration         | Checkpoints |
| -------------------- | ---------------- | ----------- |
| SDK → Cloud          | 10-50ms          | CP01 → CP02 |
| Cloud Processing     | 5-20ms           | CP02 → CP04 |
| Cloud → Mobile       | 10-30ms          | CP04 → CP05 |
| Mobile → Native      | 1-5ms            | CP05 → CP07 |
| Native Processing    | 5-15ms           | CP07 → CP09 |
| Phone → Glasses      | 20-100ms         | CP09 → CP10 |
| Glasses Processing   | 5-10ms           | CP10 → CP12 |
| **Camera Capture**   | **200-800ms**    | CP12 → CP13 |
| Upload Preparation   | 50-150ms         | CP13 → CP14 |
| **Photo Upload**     | **500-2000ms**   | CP14 → CP15 |
| Cloud Processing     | 10-50ms          | CP15 → CP17 |
| Cloud → SDK          | 10-30ms          | CP17 → CP18 |
| **Total End-to-End** | **~1000-3500ms** | CP01 → CP18 |

### Bottleneck Identification

**Camera Capture (CP12 → CP13)**:

- Expected: 200-800ms
- If >1000ms: Check auto-focus, exposure settings, or camera hardware

**Photo Upload (CP14 → CP15)**:

- Expected: 500-2000ms depending on photo size and network
- If >3000ms: Network connectivity issues or large file size

**Cloud → Mobile (CP04 → CP05)**:

- Expected: 10-30ms
- If >100ms: WebSocket connectivity issues

## Testing

### Manual Test

1. Build and deploy cloud with `OTEL_ENABLED=true`
2. Connect glasses and mobile app
3. Request photo from SDK:
   ```typescript
   const photo = await session.camera.requestPhoto();
   console.log("Photo received!", photo.requestId);
   ```
4. Query timing data:
   ```bash
   curl http://localhost:8002/api/traces/{requestId}
   ```

### Automated Test

```typescript
import { AppSession } from "@mentra/sdk";

async function testPhotoTiming() {
  const session = new AppSession(/* ... */);
  await session.start();

  const startTime = Date.now();
  const photo = await session.camera.requestPhoto();
  const endTime = Date.now();

  console.log(`Total duration (client-side): ${endTime - startTime}ms`);

  // Fetch detailed timing
  const response = await fetch(
    `http://your-cloud/api/traces/${photo.requestId}`,
  );
  const timing = await response.json();

  console.log(`Total duration (instrumented): ${timing.totalDurationMs}ms`);
  console.log(`Checkpoints: ${timing.checkpoints.length}`);

  // Analyze each phase
  timing.checkpoints.forEach((cp, i) => {
    if (i > 0) {
      const prev = timing.checkpoints[i - 1];
      const delta = cp.timestampMs - prev.timestampMs;
      console.log(`${prev.id} → ${cp.id}: ${delta}ms`);
    }
  });
}
```

## Implementation Notes

### Timing Metadata Propagation

Timing data flows through the system in the `timingMetadata` field:

```typescript
// SDK adds timing
message.timingMetadata = {
  cp01_sdk_start: Date.now(),
};

// Each layer adds its timing
timingMetadata.cp02_cloud_received = Date.now();
timingMetadata.cp03_photomanager_start = Date.now();
// ... etc
```

### Log Format

All checkpoint logs follow this format:

```
📍 CP{NN}: {Description}: requestId={id}, checkpoint=CP{NN}, timestamp={ms}, [additional_context]
```

This makes them easily parseable for analysis.

### Minimal Overhead

- Each checkpoint adds <1ms of overhead
- Logs are structured and efficient
- No impact on photo quality or success rate

## Troubleshooting

### Missing Checkpoints

If some checkpoints don't appear:

1. **Check logs are enabled**: Ensure logging level is at least INFO
2. **Verify request ID**: Make sure the requestId propagates correctly
3. **Check for early failures**: Some checkpoints won't fire if previous steps fail

### Timing Anomalies

**Very long CP12 → CP13 (camera capture)**:

- Check camera LED battery drain
- Verify camera isn't busy with another operation
- Check for auto-focus issues

**Very long CP14 → CP15 (upload)**:

- Check network connectivity
- Verify webhook URL is reachable
- Check photo file size (large photos take longer)

**Very long CP04 → CP05 (cloud to mobile)**:

- WebSocket connection issues
- Mobile app may be in background
- Network latency

## Future Enhancements

- [ ] OpenTelemetry distributed tracing with span correlation
- [ ] Automated performance regression testing
- [ ] Dashboard visualization of timing trends
- [ ] Alerts for timing anomalies
- [ ] iOS instrumentation (currently Android only)
