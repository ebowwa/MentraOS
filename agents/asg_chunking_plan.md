# ASG BLE Message Chunking Implementation Plan

## Overview

Implement a JSON-layer chunking protocol to handle BLE messages that exceed MTU limits when sending from phone to glasses. This works within the constraints of the MCU's black-box protocol that requires `## + type + length + data + $$` format.

## Problem Statement

- Current BLE MTU is typically 512 bytes (509 effective payload)
- Messages exceeding MTU get truncated, causing data loss
- MCU protocol format cannot be modified (controlled by ODM)
- Need solution that works at application layer

## Proposed Solution

Implement chunking at the JSON layer before C-field wrapping. Each chunk becomes a complete MCU-compatible message.

### Message Format

#### Regular Message (fits in MTU)

```json
{
  "C": "{\"type\":\"some_command\",\"data\":\"...\",\"mId\":12345}"
}
```

#### Chunked Message (exceeds MTU)

```json
// Chunk 1
{
  "C": "{\"type\":\"chunked_msg\",\"chunkId\":\"msg_12345_1234567890\",\"chunk\":0,\"total\":3,\"data\":\"base64_encoded_chunk_1\"}"
}

// Chunk 2
{
  "C": "{\"type\":\"chunked_msg\",\"chunkId\":\"msg_12345_1234567890\",\"chunk\":1,\"total\":3,\"data\":\"base64_encoded_chunk_2\"}"
}

// Chunk 3
{
  "C": "{\"type\":\"chunked_msg\",\"chunkId\":\"msg_12345_1234567890\",\"chunk\":2,\"total\":3,\"data\":\"base64_encoded_chunk_3\"}"
}
```

## Implementation Details

### 1. Android Phone Side (MentraLiveSGC.java)

#### New Classes to Create

- `MessageChunker.java` - Handles message splitting and chunk creation
  - `shouldChunk(String message, int effectiveMtu)` - Determine if chunking needed
  - `createChunks(String message, int maxChunkSize)` - Split message into chunks
  - `wrapChunk(String data, String chunkId, int chunkIndex, int totalChunks)` - Create chunk JSON

#### Modifications to Existing Code

- **MentraLiveSGC.sendDataToGlasses()**
  - Check message size after C-wrapping
  - If exceeds MTU, use MessageChunker
  - Send each chunk as separate BLE write
  - Add small delay between chunks (e.g., 50ms)

### 2. iOS Phone Side (MentraLiveManager.swift)

#### New Files to Create

- `MessageChunker.swift` - Swift equivalent of Android chunker
  - Similar methods as Android version
  - Use base64 encoding for chunk data

#### Modifications to Existing Code

- **MentraLiveManager.sendData()**
  - Mirror Android chunking logic
  - Check message size, chunk if needed
  - Send chunks sequentially

### 3. ASG Client Side (Glasses)

#### New Classes to Create

- `ChunkReassembler.java` - Manages chunk accumulation and reassembly
  - `Map<String, ChunkSession>` to track ongoing reassemblies
  - Timeout handling (30 seconds per chunk set)
  - `addChunk(chunkId, chunkIndex, totalChunks, data)`
  - `isComplete(chunkId)` - Check if all chunks received
  - `reassemble(chunkId)` - Combine chunks into original message

- `ChunkedMessageProtocolStrategy.java` - New protocol detector strategy
  - Detects `type: "chunked_msg"` in C field
  - Delegates to ChunkReassembler
  - Returns reassembled message to normal processing flow

#### Modifications to Existing Code

- **CommandProtocolDetector.java**
  - Add ChunkedMessageProtocolStrategy to strategy list
  - Priority: Check for chunked messages before normal JSON

- **CommandProcessor.java**
  - Add ChunkReassembler as dependency
  - Handle reassembled messages normally

## Chunk Size Calculation

```
Effective MTU = MTU - 3 (BLE overhead)
MCU Protocol Overhead = 7 bytes (##, type, 2-byte length, $$)
C-wrapper Overhead ≈ 15 bytes ({"C":"..."})
Chunk JSON Overhead ≈ 100 bytes (type, chunkId, indices, base64 overhead)

Safe Chunk Content Size = Effective MTU - MCU Overhead - C-wrapper - Chunk Overhead
                        = 509 - 7 - 15 - 100
                        = ~387 bytes of actual content per chunk
```

## Error Handling

### Phone Side

- Log warning when chunking large messages
- Track chunk send failures
- No retry logic initially (keep simple)

### Glasses Side

- 30-second timeout for incomplete chunk sets
- Clear incomplete chunks on timeout
- Log errors for debugging
- Continue normal operation if chunk reassembly fails

## Backwards Compatibility Strategy

### Option 1: No Version Checking (Recommended)

- **Pros:**
  - Simpler implementation
  - Current behavior already fails for large messages
  - No worse than status quo
  - Cleaner code without version checks

- **Cons:**
  - Old glasses will receive chunk messages they can't process
  - Will show as unknown message types in logs

- **Implementation:**
  - Just send chunked messages when needed
  - Old glasses ignore unknown "chunked_msg" type
  - New glasses process chunks normally

### Option 2: Version Checking

- Check `glassesBuildNumberInt >= CHUNKING_MIN_VERSION`
- Only chunk for supported versions
- Truncate with warning for old versions
- More complex but "safer"

**Recommendation: Go with Option 1** - It's no worse than current truncation, simpler to implement, and naturally degrades.

## Testing Plan

### Unit Tests

1. MessageChunker correctly splits messages
2. ChunkReassembler handles:
   - Complete chunk sets
   - Out-of-order chunks
   - Missing chunks
   - Duplicate chunks
   - Timeout scenarios

### Integration Tests

1. Small message (< MTU) - Should not chunk
2. Medium message (2-3 chunks)
3. Large message (10+ chunks)
4. Very large message (50+ chunks)
5. Multiple concurrent chunked messages
6. Chunk loss simulation
7. Connection drop during chunking

### Compatibility Tests

1. New phone → New glasses (chunking works)
2. New phone → Old glasses (chunks ignored, no crash)
3. Old phone → New glasses (normal messages work)
4. Old phone → Old glasses (unchanged behavior)

## Implementation Order

### Phase 1: Android Implementation (Week 1)

1. Create MessageChunker class
2. Modify MentraLiveSGC.sendDataToGlasses()
3. Create ChunkReassembler class
4. Create ChunkedMessageProtocolStrategy
5. Integrate with CommandProtocolDetector
6. Test Android → Android

### Phase 2: iOS Implementation (Week 2)

1. Port MessageChunker to Swift
2. Modify MentraLiveManager
3. Test iOS → Android glasses
4. Ensure consistency with Android behavior

### Phase 3: Testing & Refinement (Week 3)

1. Comprehensive testing
2. Performance optimization
3. Add metrics/logging
4. Documentation

## Monitoring & Metrics

### Phone Side Metrics

- Count of messages chunked
- Average chunks per message
- Chunk send failures

### Glasses Side Metrics

- Successful reassemblies
- Timeout failures
- Average reassembly time
- Memory usage for pending chunks

## Future Enhancements (Not Phase 1)

1. Compression before chunking
2. Chunk-level ACK/retry
3. Adaptive chunk sizing based on connection quality
4. Priority queue for urgent messages
5. Chunk cancellation mechanism

## Risks & Mitigations

### Risk 1: Memory Usage on Glasses

- **Risk:** Accumulating chunks could use significant memory
- **Mitigation:** Limit concurrent chunk sessions, aggressive timeouts

### Risk 2: Message Ordering

- **Risk:** Chunks from different messages could interleave
- **Mitigation:** Unique chunkId per message, process atomically

### Risk 3: Performance Impact

- **Risk:** Chunking adds latency for large messages
- **Mitigation:** Only chunk when necessary, optimize chunk size

## Success Criteria

1. Messages > MTU successfully transmitted
2. No regression for messages < MTU
3. No crashes on old clients
4. Reassembly success rate > 95% in good conditions
5. Memory usage increase < 100KB on glasses

## Decision Points

### Should we implement version checking?

**Recommendation:** No. Let chunked messages fail naturally on old clients. This is simpler and no worse than current truncation.

### Should we add chunk-level ACKs?

**Recommendation:** Not in Phase 1. Keep it simple initially. The existing message-level ACK (mId) is sufficient.

### What timeout for incomplete chunks?

**Recommendation:** 30 seconds. Long enough for slow connections, short enough to prevent memory buildup.

### Should we compress before chunking?

**Recommendation:** Not in Phase 1. Adds complexity. Consider for Phase 2 if chunk counts are high.

## Code Locations Summary

### Android Phone (android_core)

- `/smarterglassesmanager/smartglassescommunicators/MentraLiveSGC.java` - Modify sendDataToGlasses()
- `/smarterglassesmanager/utils/MessageChunker.java` - NEW FILE

### iOS Phone (mobile/ios)

- `/BleManager/MentraLiveManager.swift` - Modify sendData()
- `/BleManager/MessageChunker.swift` - NEW FILE

### ASG Client (asg_client)

- `/service/core/processors/CommandProtocolDetector.java` - Add strategy
- `/service/core/processors/ChunkedMessageProtocolStrategy.java` - NEW FILE
- `/service/core/processors/ChunkReassembler.java` - NEW FILE
- `/service/core/processors/CommandProcessor.java` - Add reassembler

## Next Steps

1. Review and approve this plan
2. Create implementation tasks/tickets
3. Begin Phase 1 Android implementation
4. Set up test environment with MTU constraints
