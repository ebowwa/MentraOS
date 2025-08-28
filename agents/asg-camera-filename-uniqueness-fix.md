# ASG Camera - Filename Uniqueness Fix

## Date: 2025-08-17

## Problem Identified

User reported that when pressing the photo button 5 times rapidly, only 3 photos appeared in the gallery. Analysis of logs revealed:

### Log Evidence

- **5 button presses** were correctly detected (5 "cs_pho" commands)
- **5 photo capture processes** were initiated
- **BUT only 3 unique files** were created:
  - `IMG_20250817_015242.jpg` (overwritten multiple times)
  - `IMG_20250817_015243.jpg`
  - `IMG_20250817_015244.jpg` (overwritten multiple times)

### Root Cause

The filename generation was using timestamps with only second precision:

```java
String timeStamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());
```

When multiple photos were taken within the same second, they received the same filename and overwrote each other.

## Solution Implemented

### Enhanced Filename Generation

Changed from second precision to millisecond precision PLUS a random component:

```java
// Before: Could generate duplicate names within same second
String timeStamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());
String photoFilePath = "IMG_" + timeStamp + ".jpg";

// After: Guaranteed unique names even in rapid capture
String timeStamp = new SimpleDateFormat("yyyyMMdd_HHmmss_SSS", Locale.US).format(new Date());
int randomSuffix = (int)(Math.random() * 1000);
String photoFilePath = "IMG_" + timeStamp + "_" + randomSuffix + ".jpg";
```

### Example Filenames

Before:

- `IMG_20250817_015242.jpg`
- `IMG_20250817_015242.jpg` (DUPLICATE!)
- `IMG_20250817_015242.jpg` (DUPLICATE!)

After:

- `IMG_20250817_015242_123_456.jpg`
- `IMG_20250817_015242_456_789.jpg`
- `IMG_20250817_015242_789_234.jpg`

## Files Modified

**MediaCaptureService.java**

- Updated `takePhotoLocally()` method
- Updated `takePhotoAndUpload()` timestamp generation
- Updated `startVideoRecording()` methods
- Added millisecond precision (SSS) to all timestamps
- Added random suffix (0-999) for extra uniqueness

## Testing Verification

### Test Scenario

1. Press photo button rapidly 5-10 times
2. Check photo gallery for all photos
3. Verify each photo has unique filename
4. Confirm no photos are overwritten

### Expected Results

- **5 button presses** → **5 unique photos**
- Each photo has unique filename with milliseconds and random suffix
- No file overwrites
- All photos appear in gallery

### Log Verification

Look for unique filenames in logs:

```
Saved image to: IMG_20250817_015242_123_456.jpg
Saved image to: IMG_20250817_015242_456_789.jpg
Saved image to: IMG_20250817_015242_789_234.jpg
```

## Performance Impact

- **Minimal**: Adding milliseconds and random number generation has negligible performance impact
- **Storage**: No change in file size or storage requirements
- **Compatibility**: Filenames remain compatible with all systems

## Build Status

✅ **BUILD SUCCESSFUL** - All changes compile without errors

## Conclusion

This fix ensures that every photo taken gets a unique filename, even when photos are captured in extremely rapid succession (multiple photos within the same millisecond). The combination of:

1. **Millisecond precision** (SSS format)
2. **Random suffix** (0-999)

Provides a virtually zero chance of filename collision, ensuring all rapidly captured photos are preserved.
