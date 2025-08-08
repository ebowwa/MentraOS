# ASG Gallery Component

## Overview

The ASG Gallery component provides a comprehensive photo and video management interface for AugmentOS Smart Glasses. It features dual-tab functionality to manage both server-side and locally downloaded media files.

## Features

### Dual Tab Interface
- **On Server Tab**: Displays photos and videos currently stored on the ASG glasses
- **Downloaded Tab**: Shows files that have been synced and stored locally on the mobile device

### Sync Functionality
- **Delta Sync**: Downloads only new/changed files since last sync
- **Batch Processing**: Downloads files in small batches for reliability
- **Automatic Cleanup**: Deletes files from server after successful local download
- **Error Handling**: Graceful handling of network issues and failed downloads
- **Progress Tracking**: Real-time progress updates during sync operations

### Photo Management
- **Take Picture**: Capture new photos directly from the glasses
- **View Photos**: Full-screen photo viewing with modal interface
- **Delete Photos**: Remove photos from server or local storage
- **Video Support**: Display video files with play indicator

## Technical Implementation

### API Integration
The component integrates with the ASG Camera Server API through `asgCameraApi.ts`:

- `getGalleryPhotos()`: Fetch photos from server
- `syncWithServer()`: Get changed files since last sync
- `batchSyncFiles()`: Download files in batches
- `deleteFilesFromServer()`: Remove files from server
- `takePicture()`: Capture new photo

### Local Storage
Uses `localStorageService.ts` for managing downloaded files:

- **File Storage**: Base64 encoded files stored in AsyncStorage
- **Sync State**: Tracks last sync time and client ID
- **File Conversion**: Utilities for converting between PhotoInfo and DownloadedFile formats
- **Storage Statistics**: Track total files and storage usage

### State Management
- **Server Photos**: Photos currently on the ASG glasses
- **Downloaded Photos**: Locally stored photos
- **Sync Progress**: Real-time sync operation status
- **Error Handling**: User-friendly error messages
- **Loading States**: Visual feedback during operations

## Usage

### Basic Gallery View
```tsx
<GalleryScreen deviceModel="ASG Glasses" />
```

### Sync Process
1. User taps "Sync" button
2. System checks for new/changed files since last sync
3. Downloads files in batches of 3
4. Saves files to local storage
5. Deletes files from server after successful download
6. Updates sync state and refreshes photo grids

### File Operations
- **Long Press**: Delete photo (server or local)
- **Tap**: View photo in full screen
- **Take Picture**: Capture new photo (server tab only)

## Error Handling

The component handles various error scenarios:
- **Network Issues**: Displays connection status and retry options
- **Sync Failures**: Partial sync with failed file reporting
- **Storage Issues**: Graceful degradation when storage is full
- **Server Errors**: User-friendly error messages with troubleshooting tips

## Performance Considerations

- **Batch Downloads**: Files downloaded in small batches to avoid overwhelming server
- **Rate Limiting**: API requests are rate-limited to prevent server overload
- **Memory Management**: Large files are processed efficiently with base64 encoding
- **Storage Cleanup**: Automatic cleanup of old sync state data

## Future Enhancements

- **Background Sync**: Automatic sync when app is in background
- **Cloud Storage**: Integration with cloud storage services
- **Photo Editing**: Basic photo editing capabilities
- **Sharing**: Share photos directly from the gallery
- **Filters**: Filter photos by date, type, or other criteria 