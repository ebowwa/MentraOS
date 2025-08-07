# Gallery Delta Sync Implementation

This document describes the delta sync functionality implemented in the ASG Gallery component.

## Overview

The delta sync feature allows the mobile app to efficiently synchronize with the ASG Camera Server by only downloading files that have changed since the last sync operation. This reduces bandwidth usage and improves performance.

## Components

### 1. SyncButton Component (`SyncButton.tsx`)
A reusable button component that displays:
- Sync button with loading state
- Last sync time
- Sync statistics (new/deleted files, total size)

### 2. GalleryScreen Integration
The main gallery screen now includes:
- Sync state management
- Delta sync functionality
- Error handling for sync operations
- Visual feedback for sync status

### 3. API Client Extensions (`asgCameraApi.ts`)
New methods added to the API client:
- `syncGallery()` - Perform delta sync
- `batchSyncFiles()` - Batch download multiple files
- `getSyncStatus()` - Get server sync status and recommendations
- `generateClientId()` - Generate unique client identifiers

## Sync Flow

1. **Initial Sync**: When sync is first triggered, all files are returned
2. **Delta Sync**: Subsequent syncs only return files modified since the last sync timestamp
3. **Client Tracking**: Each client has a unique ID for tracking sync state
4. **Error Handling**: Failed syncs are handled gracefully with user feedback

## API Endpoints Used

### `/api/sync`
- **Method**: GET
- **Parameters**:
  - `client_id` (required): Unique client identifier
  - `last_sync` (optional): Timestamp of last sync
  - `include_thumbnails` (optional): Include video thumbnails
- **Response**: List of changed files and sync metadata

### `/api/sync-batch`
- **Method**: POST
- **Body**: JSON with file list and client ID
- **Response**: Batch download results with base64 encoded files

### `/api/sync-status`
- **Method**: GET
- **Response**: Server status, file counts, and sync recommendations

## Usage

### Basic Sync
```typescript
const handleSync = async () => {
  const syncResponse = await asgCameraApi.syncGallery(
    clientId,
    lastSyncTime,
    true // include thumbnails
  )
  
  // Update local photos with new data
  setPhotos(prevPhotos => {
    const existingNames = new Set(prevPhotos.map(p => p.name))
    const newPhotos = syncResponse.changed_files.filter(p => !existingNames.has(p.name))
    return [...prevPhotos, ...newPhotos]
  })
}
```

### Sync with UI Feedback
```typescript
<SyncButton
  onPress={handleSync}
  isSyncing={syncState.isSyncing}
  lastSyncTime={syncState.lastSyncTime}
  syncStats={syncState.lastSyncStats}
  disabled={isLoading}
/>
```

## Features

### Delta Sync
- Only downloads changed files since last sync
- Tracks sync timestamps per client
- Handles both new and deleted files

### Batch Operations
- Efficient batch downloading of multiple files
- Base64 encoding for JSON transmission
- Thumbnail support for video files

### Error Handling
- Network error recovery
- Server error handling
- User-friendly error messages

### Performance Optimizations
- Rate limiting for API requests
- Caching of sync responses
- Efficient file merging logic

## Testing

Use the `SyncTest` component to verify sync functionality:

```typescript
import {SyncTest} from "./SyncTest"

// Add to your screen for testing
<SyncTest />
```

## Configuration

### Sync Recommendations
The server provides recommended settings:
- **Sync Interval**: 30 seconds (configurable)
- **Batch Size**: 10 files per batch
- **Thumbnails**: Enabled by default
- **Compression**: Disabled (uses base64)

### Client ID Generation
Each client gets a unique ID:
- Format: `mobile_{timestamp}_{random}`
- Ensures proper sync state tracking
- Prevents conflicts between multiple clients

## Future Enhancements

1. **Automatic Sync**: Background sync at regular intervals
2. **Conflict Resolution**: Handle file conflicts between clients
3. **Offline Support**: Queue sync operations when offline
4. **Progress Tracking**: Real-time sync progress indicators
5. **Selective Sync**: Allow users to choose which files to sync 