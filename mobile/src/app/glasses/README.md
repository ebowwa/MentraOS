# Glasses Package

A comprehensive React Native package for managing ASG (Augmented Smart Glasses) camera functionality, including photo capture, gallery management, and server communication.

## 🏗️ Architecture

The package follows a modular architecture with clear separation of concerns:

```
glasses/
├── components/          # Reusable UI components
│   ├── Gallery/        # Gallery-specific components
│   ├── Camera/         # Camera control components
│   └── common/         # Shared components
├── hooks/              # Custom React hooks
├── services/           # API and business logic
├── types/              # TypeScript type definitions
├── utils/              # Utility functions
└── index.ts           # Main exports
```

## 🚀 Features

- **📸 Photo Capture**: Take pictures using the ASG camera
- **🖼️ Gallery Management**: View and manage photo gallery
- **🔗 Server Communication**: Robust API client with retry logic
- **📱 Full-Screen Modal**: View photos in full-screen mode
- **🔄 Auto-Refresh**: Automatic gallery updates
- **⚡ Connection Management**: Smart connection handling
- **🎨 Themed UI**: Consistent with app design system
- **📱 Responsive Design**: Works on different screen sizes

## 📦 Installation

The package is already integrated into the mobile app. Import components and hooks as needed:

```typescript
import { 
  GalleryScreen, 
  useConnection, 
  useGallery,
  asgCameraApi 
} from '@/app/glasses'
```

## 🎯 Usage

### Basic Gallery Screen

```typescript
import { GalleryScreen } from '@/app/glasses'

export default function MyGallery() {
  return <GalleryScreen deviceModel="My Glasses" />
}
```

### Custom Implementation

```typescript
import { useConnection, useGallery, PhotoGrid } from '@/app/glasses'

export function CustomGallery() {
  const { connectionStatus } = useConnection()
  const { galleryState, takePicture } = useGallery()

  return (
    <View>
      <PhotoGrid 
        photos={galleryState.photos}
        onPhotoPress={(photo) => console.log('Photo selected:', photo)}
      />
    </View>
  )
}
```

## 🔧 API Reference

### Hooks

#### `useConnection(options?)`

Manages connection to the ASG Camera Server.

```typescript
const { connectionStatus, connect, disconnect } = useConnection({
  autoConnect: true,
  retryInterval: 5000
})
```

#### `useGallery(options?)`

Manages gallery state and operations.

```typescript
const { 
  galleryState, 
  loadGallery, 
  takePicture, 
  selectPhoto 
} = useGallery({
  autoRefresh: true,
  refreshInterval: 30000
})
```

### Components

#### `GalleryScreen`

Main gallery screen component.

**Props:**
- `deviceModel?: string` - Display name for the device

#### `PhotoGrid`

Displays photos in a responsive grid.

**Props:**
- `photos: PhotoInfo[]` - Array of photos to display
- `onPhotoPress: (photo: PhotoInfo) => void` - Photo selection handler
- `onPhotoLongPress?: (photo: PhotoInfo) => void` - Long press handler

#### `PhotoModal`

Full-screen photo viewer modal.

**Props:**
- `visible: boolean` - Modal visibility
- `photo: PhotoInfo | null` - Photo to display
- `onClose: () => void` - Close handler

#### `ConnectionStatus`

Displays connection status and server info.

**Props:**
- `isConnected: boolean` - Connection status
- `isConnecting: boolean` - Connecting state
- `error?: string` - Error message
- `serverInfo?: ServerInfo` - Server information

#### `CameraControls`

Camera operation controls.

**Props:**
- `onTakePicture: () => Promise<void>` - Take picture handler
- `isConnected: boolean` - Connection status
- `isLoading?: boolean` - Loading state

### Services

#### `asgCameraApi`

Main API client for ASG Camera Server communication.

```typescript
// Set server
asgCameraApi.setServer('http://192.168.1.100', 8089)

// Take picture
await asgCameraApi.takePicture()

// Get gallery
const photos = await asgCameraApi.getGalleryPhotos()

// Check connection
const isReachable = await asgCameraApi.isServerReachable()
```

## 🎨 Theming

All components use the app's theme system and are fully customizable through the `ThemedStyle` system.

## 🔄 State Management

The package uses React hooks for state management:

- **Connection State**: Managed by `useConnection`
- **Gallery State**: Managed by `useGallery`
- **UI State**: Managed by individual components

## 🛠️ Development

### Adding New Features

1. **New Components**: Add to appropriate folder in `components/`
2. **New Hooks**: Add to `hooks/` folder
3. **New Services**: Add to `services/` folder
4. **New Types**: Add to `types/index.ts`
5. **Update Exports**: Add to `index.ts`

### Testing

Components are designed to be easily testable with clear interfaces and minimal dependencies.

## 🐛 Troubleshooting

### Common Issues

1. **Connection Failed**: Check WiFi connection and server status
2. **Photos Not Loading**: Verify server is running and accessible
3. **Modal Not Opening**: Ensure photo object is properly passed

### Debug Mode

Enable debug logging by checking console output with `[ASG Camera API]` prefix.

## 📝 Changelog

### v2.0.0 (Current)
- Complete refactoring with modular architecture
- Custom hooks for state management
- Reusable components
- Improved error handling
- Better TypeScript support

### v1.0.0 (Previous)
- Basic gallery functionality
- Simple API client
- Monolithic component structure 