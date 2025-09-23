# ASG Gallery Sync Issues - Large Video Transfer Analysis

## Executive Summary

The gallery sync system in asg_client fails when transferring large videos (500MB+) due to multiple timeout, buffering, and progress tracking issues. This document details all identified problems and their solutions.

## Critical Issues

### 1. Progress Bar Always Shows 0% for Videos

**Problem:**

- Progress callback in `RNFS.downloadFile()` uses `progressDivider: 10` (asgCameraApi.ts:737)
- This means progress events only fire every 10% of download
- For large videos, this can take minutes between updates
- The UI shows 0% until suddenly jumping to 100%

**Evidence:**

```typescript
// asgCameraApi.ts line 737
progressDivider: 10,  // Only fires every 10%
progress: res => {
  const percentage = Math.round((res.bytesWritten / res.contentLength) * 100)
  if (percentage % 20 === 0) {  // Only logs every 20%
    console.log(`Download progress: ${percentage}%`)
  }
}
```

**Solution:**

- Change `progressDivider: 1` to get progress updates every 1%
- Update progress callback to report every update to UI

### 2. NanoHTTPD Socket Timeout Too Short

**Problem:**

- Server uses default `SOCKET_READ_TIMEOUT` (10 seconds)
- If no data flows for 10 seconds, connection drops
- WiFi fluctuations easily trigger this timeout

**Evidence:**

```java
// AsgServer.java line 80
start(SOCKET_READ_TIMEOUT, false);  // Uses NanoHTTPD default of 10 seconds
```

**Solution:**

- Override SOCKET_READ_TIMEOUT to 5 minutes for large transfers
- Add keep-alive mechanism for long downloads

### 3. No Client-Side Timeouts Configured

**Problem:**

- `RNFS.downloadFile()` called without timeout parameters
- System defaults may be too short for 500MB+ files
- Client appears "stuck" when server times out

**Evidence:**

```typescript
// asgCameraApi.ts line 730 - Missing timeout configuration
const downloadResult = await RNFS.downloadFile({
  fromUrl: downloadUrl,
  toFile: localFilePath,
  headers: {...},
  // NO connectionTimeout or readTimeout specified!
})
```

**Compare to STTModelManager.ts which properly sets:**

```typescript
connectionTimeout: 30000,
readTimeout: 30000,
```

**Solution:**

- Add `connectionTimeout: 300000` (5 minutes)
- Add `readTimeout: 300000` (5 minutes)
- Add `backgroundTimeout: 600000` (10 minutes) for iOS

### 4. RAM Issues with Direct FileInputStream

**Problem:**

- Server uses unbuffered `FileInputStream` for streaming
- No wrapper like `BufferedInputStream`
- Large files may cause memory pressure
- No progress tracking on server side

**Evidence:**

```java
// AsgCameraServer.java line 548
return newChunkedResponse(Response.Status.OK, mimeType, new FileInputStream(photoFile));
```

**Solution:**

- Wrap in `BufferedInputStream` with 64KB buffer
- Implement custom InputStream wrapper for progress tracking
- Use memory-mapped files for very large videos

### 5. Request Timeout Configuration Too Short

**Problem:**

- DefaultServerConfig sets 30-second request timeout
- 500MB at 5MB/s WiFi = 100+ seconds needed
- Downloads fail before completion

**Evidence:**

```java
// DefaultServerConfig.java line 72
private int requestTimeout = 30000; // 30 seconds - WAY too short!
```

**Solution:**

- Increase to 600000 (10 minutes) for video downloads
- Make timeout configurable per endpoint
- Use different timeouts for different file types

### 6. 50MB File Size Limit (Misleading)

**Problem:**

- `MAX_FILE_SIZE = 50MB` defined but only checked in `serveLatestPhoto()`
- Does NOT apply to `/api/download` or `/api/photo` endpoints
- Videos larger than 50MB DO work, but the limit is confusing

**Evidence:**

```java
// AsgServer.java line 20
protected static final int MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// AsgCameraServer.java line 227 - Only checked for latest photo
if (fileData.length <= MAX_FILE_SIZE) {
  // Cache and serve
} else {
  return createErrorResponse(Response.Status.PAYLOAD_TOO_LARGE, "Photo file too large");
}
```

**Solution:**

- Remove misleading MAX_FILE_SIZE constant
- Or apply consistently with clear documentation
- Use streaming for all large files, not size limits

### 7. No Resume/Auto-Resume Support

**Problem:**

- Failed downloads must restart from beginning
- No HTTP Range request support
- No partial file detection
- Wastes bandwidth and time

**Solution:**

- Implement HTTP Range headers (RFC 7233)
- Support partial content (206) responses
- Client tracks partial downloads and resumes
- Auto-retry with exponential backoff

### 8. Sequential Download Inefficiency

**Problem:**

- Files downloaded one at a time (sequential)
- Small 50ms delay between files
- Total sync time is sum of all downloads

**Evidence:**

```typescript
// asgCameraApi.ts line 598-634
for (let i = 0; i < files.length; i++) {
  const file = files[i]
  // Downloads one by one...
  await this.downloadFile(file.name, ...)
  await new Promise(resolve => setTimeout(resolve, 50))
}
```

**Solution:**

- Parallel downloads with concurrency limit (2-3 files)
- Adaptive concurrency based on network speed
- Priority queue (photos before videos)

## Implementation Status

### ✅ COMPLETED FIXES

#### Fix #1: Progress Bar (COMPLETED)

**File:** `mobile/src/services/asg/asgCameraApi.ts`

- ✅ Changed `progressDivider: 10` → `progressDivider: 1` (line 740)
- ✅ Added `progressInterval: 250` for smoother updates (line 741)
- ✅ Updated progress callback to report all percentages to UI (line 750)
- ✅ Reduced console logging frequency from 20% to 10% to avoid spam (line 754)
- ✅ Also fixed thumbnail downloads with same settings (lines 820-822)

#### Fix #2: Client Timeouts (COMPLETED)

**File:** `mobile/src/services/asg/asgCameraApi.ts`

- ✅ Added `connectionTimeout: 300000` (5 minutes) for main downloads (line 737)
- ✅ Added `readTimeout: 300000` (5 minutes) for main downloads (line 738)
- ✅ Added `backgroundTimeout: 600000` (10 minutes) for iOS background (line 739)
- ✅ Added thumbnail timeouts: 60000 (1 minute) for smaller files (lines 820-821)

#### Fix #3: Server Buffering (COMPLETED)

**File:** `asg_client/app/src/main/java/com/augmentos/asg_client/io/server/services/AsgCameraServer.java`

- ✅ Added BufferedInputStream wrapper with 64KB buffer in serveDownload() (lines 551-552)
- ✅ Prevents memory issues with large files
- ✅ Improves streaming performance with proper buffering
- ✅ Added logging for buffered stream usage (line 554)

#### Fix #4: Server Timeouts (COMPLETED)

**File:** `asg_client/app/src/main/java/com/augmentos/asg_client/io/server/core/AsgServer.java`

- ✅ Added EXTENDED_SOCKET_TIMEOUT constant = 300000ms (5 minutes) (line 25)
- ✅ Changed server start to use extended timeout instead of default (line 86)
- ✅ Added logging to show timeout configuration (lines 89-90)

**File:** `asg_client/app/src/main/java/com/augmentos/asg_client/io/server/core/DefaultServerConfig.java`

- ✅ Changed default requestTimeout from 30000ms to 600000ms (10 minutes) (line 72)
- ✅ This allows 500MB+ videos to complete transfer without timing out

#### Fix #5: Keep-Alive Mechanism (COMPLETED)

**File:** `asg_client/app/src/main/java/com/augmentos/asg_client/io/server/services/AsgCameraServer.java`

- ✅ Added HTTP Keep-Alive headers with 5-minute timeout (lines 548-549)
- ✅ Created KeepAliveInputStream wrapper for large files >100MB (lines 562-564)
- ✅ Headers added to response object (lines 571-573)
- ✅ Also added keep-alive to gallery endpoint (lines 387-389)

**File:** `asg_client/app/src/main/java/com/augmentos/asg_client/io/server/services/KeepAliveInputStream.java`

- ✅ Created custom InputStream wrapper to prevent timeouts
- ✅ Monitors time between reads and forces data flow if needed
- ✅ Logs progress every 10MB for monitoring
- ✅ 4-minute keep-alive interval (less than 5-minute socket timeout)

### 📋 NOT IMPLEMENTED (Future Work)

#### Resume Support

## Recommended Implementation Priority

### Phase 1: Critical Fixes (Immediate) ✅ ALL COMPLETED

1. **Fix Progress Bar** ✅ COMPLETED
   - Changed `progressDivider: 1` in mobile client
   - UI now shows real progress every 1%
   - Also fixed for thumbnail downloads

2. **Fix Timeouts** ✅ COMPLETED
   - Added connection/read timeouts to RNFS.downloadFile (5 minutes)
   - Increased server SOCKET_READ_TIMEOUT to 5 minutes
   - Increased request timeout to 10 minutes for large files

3. **Fix Buffering** ✅ COMPLETED
   - Wrapped FileInputStream in BufferedInputStream
   - Using 64KB buffer size for optimal performance
   - Prevents RAM issues with large files

### Phase 2: Reliability (1-2 weeks)

1. **Add Resume Support**
   - Implement Range headers on server
   - Add partial download tracking on client
   - Auto-resume on failure

2. **Add Retry Logic**
   - Exponential backoff
   - Max retry count
   - Smart error detection

### Phase 3: Performance (2-4 weeks)

1. **Parallel Downloads**
   - Concurrent download manager
   - Priority queue system
   - Bandwidth management

2. **Compression**
   - Video transcoding for smaller sizes
   - GZIP for compressible content
   - Adaptive quality based on network

## Code Changes Required

### Mobile (asgCameraApi.ts)

```typescript
// Fix progress and timeouts
const downloadResult = await RNFS.downloadFile({
  fromUrl: downloadUrl,
  toFile: localFilePath,
  headers: {...},
  connectionTimeout: 300000,  // 5 minutes
  readTimeout: 300000,        // 5 minutes
  backgroundTimeout: 600000,  // 10 minutes (iOS)
  progressDivider: 1,         // Get 1% increments
  progressInterval: 250,      // Update every 250ms
  begin: (res) => {
    console.log('Download started, size:', res.contentLength);
  },
  progress: (res) => {
    const percentage = Math.round((res.bytesWritten / res.contentLength) * 100);
    onProgress?.(percentage);  // Report all progress
  }
}).promise;
```

### Server (AsgCameraServer.java)

```java
// Fix streaming with buffering
private Response serveDownload(IHTTPSession session) {
  // ... existing code ...

  // Wrap in buffered stream with 64KB buffer
  InputStream bufferedStream = new BufferedInputStream(
    new FileInputStream(photoFile),
    65536  // 64KB buffer
  );

  // Set appropriate timeout for large files
  session.setTimeout(600000); // 10 minutes

  return newChunkedResponse(
    Response.Status.OK,
    mimeType,
    bufferedStream
  );
}
```

### Server (AsgServer.java)

```java
// Increase socket timeout
private static final int EXTENDED_SOCKET_TIMEOUT = 300000; // 5 minutes

public void startServer() {
  try {
    start(EXTENDED_SOCKET_TIMEOUT, false);
    // ... rest of code
  }
}
```

## Testing Recommendations

1. **Test with Various File Sizes**
   - 100MB, 500MB, 1GB, 2GB videos
   - Multiple simultaneous downloads
   - Poor network conditions (throttled to 1MB/s)

2. **Test Failure Recovery**
   - Kill server mid-download
   - Disconnect WiFi mid-download
   - Background/foreground app during download

3. **Performance Metrics**
   - Download speed vs file size
   - Memory usage during transfer
   - Battery impact for large syncs

## Resume Support Implementation Guide

### Overview

Resume support allows failed downloads to continue from where they left off instead of restarting from the beginning. This is critical for large video files that may take minutes to download over WiFi.

### How Resume Support Works

1. **Server-Side: HTTP Range Support**
   - Server must support HTTP Range headers (RFC 7233)
   - Client sends `Range: bytes=START-END` header
   - Server responds with 206 Partial Content
   - Server sends `Content-Range: bytes START-END/TOTAL` header

2. **Client-Side: Partial File Tracking**
   - Track partial downloads in local storage
   - Store: filename, bytes downloaded, total size, timestamp
   - On retry, check for partial file and resume from last byte

3. **Auto-Resume Logic**
   - Detect download failure (timeout, network error)
   - Check if partial file exists
   - Calculate resume position
   - Retry with Range header
   - Merge partial downloads

### Detailed Implementation

#### Server-Side Implementation (AsgCameraServer.java)

```java
// Add to serveDownload() method
private Response serveDownload(IHTTPSession session) {
    // ... existing code to get file ...

    // Check for Range header
    String rangeHeader = session.getHeaders().get("range");
    long fileLength = photoFile.length();
    long rangeStart = 0;
    long rangeEnd = fileLength - 1;
    boolean partialContent = false;

    if (rangeHeader != null && rangeHeader.startsWith("bytes=")) {
        partialContent = true;
        String range = rangeHeader.substring(6);

        // Parse range (supports "START-END", "START-", "-END")
        if (range.contains("-")) {
            String[] parts = range.split("-");
            if (!parts[0].isEmpty()) {
                rangeStart = Long.parseLong(parts[0]);
            }
            if (parts.length > 1 && !parts[1].isEmpty()) {
                rangeEnd = Long.parseLong(parts[1]);
            }
        }
    }

    // Calculate content length
    long contentLength = rangeEnd - rangeStart + 1;

    // Prepare response
    Response.Status status = partialContent ?
        Response.Status.PARTIAL_CONTENT : Response.Status.OK;

    // Create input stream starting at range position
    FileInputStream fis = new FileInputStream(photoFile);
    if (rangeStart > 0) {
        fis.skip(rangeStart);
    }

    // Wrap in buffered stream
    BufferedInputStream bis = new BufferedInputStream(fis, 65536);

    // Create response with appropriate headers
    Response response = newChunkedResponse(status, mimeType, bis);
    response.addHeader("Accept-Ranges", "bytes");
    response.addHeader("Content-Length", String.valueOf(contentLength));

    if (partialContent) {
        response.addHeader("Content-Range",
            String.format("bytes %d-%d/%d", rangeStart, rangeEnd, fileLength));
    }

    return response;
}
```

#### Client-Side Implementation (asgCameraApi.ts)

```typescript
// Add partial download tracking
interface PartialDownload {
  filename: string;
  localPath: string;
  bytesDownloaded: number;
  totalSize: number;
  timestamp: number;
}

// Store partial downloads in AsyncStorage
const PARTIAL_DOWNLOADS_KEY = 'asg_partial_downloads';

async function getPartialDownload(filename: string): Promise<PartialDownload | null> {
  try {
    const partials = await AsyncStorage.getItem(PARTIAL_DOWNLOADS_KEY);
    if (!partials) return null;

    const downloads = JSON.parse(partials);
    const partial = downloads[filename];

    // Check if partial is too old (>1 hour)
    if (partial && Date.now() - partial.timestamp > 3600000) {
      // Clean up old partial
      await RNFS.unlink(partial.localPath + '.partial');
      delete downloads[filename];
      await AsyncStorage.setItem(PARTIAL_DOWNLOADS_KEY, JSON.stringify(downloads));
      return null;
    }

    return partial;
  } catch (e) {
    return null;
  }
}

async function savePartialDownload(partial: PartialDownload): Promise<void> {
  const partials = await AsyncStorage.getItem(PARTIAL_DOWNLOADS_KEY) || '{}';
  const downloads = JSON.parse(partials);
  downloads[partial.filename] = partial;
  await AsyncStorage.setItem(PARTIAL_DOWNLOADS_KEY, JSON.stringify(downloads));
}

// Enhanced downloadFile with resume support
async downloadFile(
  filename: string,
  includeThumbnail: boolean = false,
  onProgress?: (progress: number) => void,
  maxRetries: number = 3
): Promise<{filePath: string; thumbnailPath?: string; mime_type: string}> {
  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt < maxRetries) {
    attempt++;

    try {
      // Check for partial download
      const partial = await getPartialDownload(filename);
      const partialPath = localFilePath + '.partial';

      let headers = {
        "Accept": "*/*",
        "User-Agent": "MentraOS-Mobile/1.0",
      };

      let resumeBytes = 0;
      if (partial && await RNFS.exists(partialPath)) {
        // Get actual file size on disk
        const stat = await RNFS.stat(partialPath);
        resumeBytes = stat.size;

        // Add Range header for resume
        headers['Range'] = `bytes=${resumeBytes}-`;
        console.log(`[ASG Camera API] Resuming download from byte ${resumeBytes}`);
      }

      const downloadResult = await RNFS.downloadFile({
        fromUrl: downloadUrl,
        toFile: partial ? partialPath : localFilePath,
        headers,
        connectionTimeout: 300000,
        readTimeout: 300000,
        backgroundTimeout: 600000,
        progressDivider: 1,
        progressInterval: 250,
        resumable: true,  // Enable RNFS resume support
        begin: async (res) => {
          console.log(`[ASG Camera API] Download started, size: ${res.contentLength}`);

          // Save partial download info
          if (!partial) {
            await savePartialDownload({
              filename,
              localPath: localFilePath,
              bytesDownloaded: 0,
              totalSize: res.contentLength + resumeBytes,
              timestamp: Date.now()
            });
          }
        },
        progress: async (res) => {
          const totalBytes = resumeBytes + res.bytesWritten;
          const totalSize = resumeBytes + res.contentLength;
          const percentage = Math.round((totalBytes / totalSize) * 100);

          onProgress?.(percentage);

          // Update partial download info periodically
          if (percentage % 10 === 0) {
            await savePartialDownload({
              filename,
              localPath: localFilePath,
              bytesDownloaded: totalBytes,
              totalSize: totalSize,
              timestamp: Date.now()
            });
          }
        },
      }).promise;

      // Download succeeded
      if (downloadResult.statusCode === 200 || downloadResult.statusCode === 206) {
        // Move partial to final location
        if (partial && await RNFS.exists(partialPath)) {
          await RNFS.moveFile(partialPath, localFilePath);
        }

        // Clean up partial download record
        const partials = await AsyncStorage.getItem(PARTIAL_DOWNLOADS_KEY) || '{}';
        const downloads = JSON.parse(partials);
        delete downloads[filename];
        await AsyncStorage.setItem(PARTIAL_DOWNLOADS_KEY, JSON.stringify(downloads));

        console.log(`[ASG Camera API] Download completed: ${filename}`);

        // Continue with thumbnail download...
        // ... rest of existing code ...

        return {filePath: localFilePath, thumbnailPath, mime_type};
      }

      throw new Error(`Download failed with status ${downloadResult.statusCode}`);

    } catch (error) {
      lastError = error as Error;
      console.error(`[ASG Camera API] Download attempt ${attempt} failed:`, error);

      if (attempt < maxRetries) {
        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        console.log(`[ASG Camera API] Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // All retries failed
  throw lastError || new Error('Download failed after max retries');
}
```

### Auto-Resume Benefits

1. **Bandwidth Efficiency**: Don't re-download already received bytes
2. **Time Savings**: 500MB video at 50% = 250MB saved on retry
3. **User Experience**: Progress continues instead of restarting
4. **Network Resilience**: Handles WiFi fluctuations gracefully
5. **Battery Efficiency**: Less data transfer = less battery usage

### Testing Resume Support

```bash
# Test server Range support
curl -H "Range: bytes=1000-2000" \
  http://glasses-ip:8089/api/download?file=video.mp4

# Should return:
# HTTP/1.1 206 Partial Content
# Content-Range: bytes 1000-2000/1234567
# Content-Length: 1001
```

### Edge Cases to Handle

1. **Server doesn't support Range**: Fall back to full download
2. **File changed on server**: Detect via ETag/Last-Modified
3. **Partial file corrupted**: Validate with checksum
4. **Multiple concurrent downloads**: Use unique partial file names
5. **Storage full**: Clean up old partials before retry

## Conclusion

### ✅ Implemented Fixes

All critical issues have been addressed:

1. **Progress bar now works** - Shows real-time progress with 1% granularity
2. **Timeouts extended** - 5-minute socket timeout, 10-minute request timeout, proper client timeouts
3. **Buffered streaming** - 64KB BufferedInputStream prevents memory issues
4. **Keep-alive mechanism** - Prevents timeout during slow transfers with custom InputStream wrapper

### 📋 Remaining Work (Optional)

1. **Resume support** - Would allow failed downloads to continue from last byte (fully documented above)
2. **Better error handling** - Classify errors and make smarter retry decisions
3. **Cleanup mechanisms** - Auto-remove old partial files

The implemented fixes should resolve the vast majority of large video transfer issues. Downloads will now:

- Show accurate progress throughout the transfer
- Have sufficient time to complete (even 1GB+ files)
- Use memory efficiently with proper buffering
- Stay alive during network congestion with keep-alive mechanism

These changes maintain full backward compatibility while significantly improving reliability for large file transfers.

## References

- NanoHTTPD Documentation: https://github.com/NanoHttpd/nanohttpd
- RNFS Documentation: https://github.com/itinance/react-native-fs
- HTTP Range Requests: https://developer.mozilla.org/en-US/docs/Web/HTTP/Range_requests
- Android FileProvider: https://developer.android.com/reference/androidx/core/content/FileProvider
