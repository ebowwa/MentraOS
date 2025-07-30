# ASG Package

A comprehensive React Native package for managing ASG (Augmented Smart Glasses) camera, gallery, and device functionality.

## Overview

The ASG package provides a complete solution for interacting with ASG Camera Server, including:

- 📸 **Photo Gallery Management** - Browse and view photos from ASG glasses
- 📱 **Camera Controls** - Take pictures remotely from the mobile app
- 🔗 **Server Communication** - Robust API client for ASG Camera Server
- 🎨 **UI Components** - Ready-to-use React Native components
- 📊 **Type Safety** - Full TypeScript support

## Features

### Core Functionality
- **Gallery Display** - Grid view of photos with thumbnails
- **Photo Viewer** - Full-screen photo viewing with zoom
- **Camera Integration** - Remote photo capture
- **Server Status** - Real-time connection monitoring
- **Error Handling** - Comprehensive error states and recovery

### Technical Features
- **TypeScript Support** - Full type safety
- **Themed UI** - Consistent with app design system
- **Responsive Design** - Works on all screen sizes
- **Performance Optimized** - Efficient image loading and caching
- **Network Resilient** - Handles connection issues gracefully

## Installation

The package is included in the main app bundle. No additional installation required.

## Usage

### Basic Gallery Implementation

```tsx
import { GalleryScreen } from '@/app/asg'

export default function MyGallery() {
  return <GalleryScreen deviceModel="ASG Glasses" />
}
```

### Using the API Client

```tsx
import { AsgCameraApiClient } from '@/app/asg'

const api = new AsgCameraApiClient('http://192.168.1.100:8089')

// Get gallery photos
const photos = await api.getGalleryPhotos()

// Take a picture
await api.takePicture()

// Get latest photo
const latestPhoto = await api.getLatestPhotoAsDataUrl()
```

### Using Individual Components

```tsx
import { PhotoGrid } from '@/app/asg'

function MyCustomGallery({ photos, onPhotoPress }) {
  return (
    <PhotoGrid
      photos={photos}
      onPhotoPress={onPhotoPress}
      emptyMessage="No photos found"
    />
  )
}
```

## API Reference

### Components

#### `GalleryScreen`
Main gallery screen component with full functionality.

**Props:**
- `deviceModel?: string` - Device model name (default: 'ASG Glasses')

#### `PhotoGrid`
Grid component for displaying photos.

**Props:**
- `photos: PhotoInfo[]` - Array of photo information
- `onPhotoPress: (photo: PhotoInfo) => void` - Photo tap handler
- `onPhotoLongPress?: (photo: PhotoInfo) => void` - Photo long press handler
- `loading?: boolean` - Loading state
- `emptyMessage?: string` - Message when no photos
- `ListHeaderComponent?: React.ComponentType` - Header component

### Services

#### `AsgCameraApiClient`
Main API client for ASG Camera Server communication.

**Methods:**
- `getGallery()` - Get gallery response
- `getGalleryPhotos()` - Get array of photos
- `takePicture()` - Take a new photo
- `getLatestPhoto()` - Get latest photo as blob
- `getLatestPhotoAsDataUrl()` - Get latest photo as data URL
- `getPhoto(filename)` - Get specific photo
- `getPhotoAsDataUrl(filename)` - Get specific photo as data URL
- `downloadPhoto(filename)` - Get download URL for photo
- `getStatus()` - Get server status
- `getHealth()` - Get server health
- `isServerReachable()` - Check server connectivity

### Types

#### `PhotoInfo`
```tsx
interface PhotoInfo {
  name: string
  url: string
  download: string
  size: number
  modified: string
}
```

#### `GalleryResponse`
```tsx
interface GalleryResponse {
  status: 'success' | 'error'
  data: {
    photos: PhotoInfo[]
  }
}
```

#### `ServerStatus`
```tsx
interface ServerStatus {
  status: string
  uptime: number
  version: string
  timestamp: string
}
```

## Configuration

### Server Settings
The package automatically detects ASG glasses WiFi connection and configures the server URL. Manual configuration is also supported:

```tsx
const api = new AsgCameraApiClient()
api.setServer('http://192.168.1.100:8089')
```

### Constants
```tsx
import { ASG_CONSTANTS } from '@/app/asg'

// Default server port
ASG_CONSTANTS.DEFAULT_SERVER_PORT // 8089

// Default timeout
ASG_CONSTANTS.DEFAULT_TIMEOUT // 10000ms

// Gallery endpoints
ASG_CONSTANTS.GALLERY_ENDPOINTS // ['/api/gallery', '/gallery', ...]
```

## Error Handling

The package includes comprehensive error handling:

- **Network Errors** - Connection timeouts and failures
- **Server Errors** - Invalid responses and server issues
- **Permission Errors** - Missing camera permissions
- **State Errors** - Invalid component states

All errors are displayed with user-friendly messages and recovery options.

## Performance

### Image Loading
- **Lazy Loading** - Images load as they become visible
- **Caching** - Efficient image caching and reuse
- **Thumbnails** - Optimized thumbnail generation
- **Progressive Loading** - Loading states and placeholders

### Network Optimization
- **Request Deduplication** - Prevents duplicate requests
- **Rate Limiting** - Prevents server overload
- **Timeout Handling** - Graceful timeout management
- **Retry Logic** - Automatic retry on failures

## Troubleshooting

### Common Issues

**Gallery not loading:**
- Check WiFi connection to glasses
- Verify server is running on glasses
- Ensure phone and glasses are on same network

**Photos not displaying:**
- Check server response format
- Verify photo URLs are accessible
- Check network permissions

**Camera not working:**
- Verify camera permissions
- Check server connectivity
- Ensure glasses are connected

### Debug Information
Enable debug logging by checking console output for detailed error information.

## Changelog

### v2.0.0 - Package Rename
- Renamed from `@/glasses` to `@/asg`
- Updated all internal references
- Simplified package structure
- Improved documentation

### v1.0.0 - Initial Release
- Basic gallery functionality
- Camera integration
- Server communication
- UI components

## Contributing

1. Follow the existing code style
2. Add TypeScript types for new features
3. Include error handling
4. Update documentation
5. Test on multiple devices

## License

Part of the MentraOS project. 