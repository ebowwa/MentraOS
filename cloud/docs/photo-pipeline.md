# Photo Request Pipeline Documentation

This document describes the complete flow of a photo request from an app using the AugmentOS SDK through to the smart glasses and back. This pipeline supports specifying preferred photo dimensions and JPEG quality.

## Overview

The photo request pipeline follows this path:

1. **App → Cloud**: SDK sends request via WebSocket
2. **Cloud → Mobile**: Cloud forwards to mobile app
3. **Mobile → Glasses**: Mobile sends via Bluetooth
4. **Glasses → App**: Photo uploaded directly to app webhook
5. **App Processing**: App receives and processes photo

## Detailed Flow

### 1. App SDK Request

**File**: `cloud/packages/sdk/src/app/session/modules/camera.ts`

**Function**: `requestPhoto(options?: PhotoRequestOptions): Promise<PhotoData>`

**Types**:

```typescript
interface PhotoRequestOptions {
  saveToGallery?: boolean;
  preferredSize?: PhotoSize;
  quality?: number; // 1-100
}

interface PhotoSize {
  width: number;
  height: number;
}

interface PhotoRequest extends BaseMessage {
  type: AppToCloudMessageType.PHOTO_REQUEST;
  packageName: string;
  requestId: string;
  saveToGallery?: boolean;
  preferredSize?: PhotoSize;
  quality?: number;
}
```

The SDK generates a unique `requestId` and sends a `PhotoRequest` message via WebSocket.

### 2. Cloud Processing

#### 2.1 WebSocket Message Reception

**File**: `cloud/packages/cloud/src/services/websocket/websocket-app.service.ts`

**Function**: `handleAppMessage()` - handles `AppToCloudMessageType.PHOTO_REQUEST`

The service checks camera permissions and forwards to PhotoManager.

#### 2.2 Photo Manager

**File**: `cloud/packages/cloud/src/services/session/PhotoManager.ts`

**Function**: `requestPhoto(appRequest: PhotoRequest): Promise<string>`

**Types**:

```typescript
interface PhotoRequestToGlasses extends BaseMessage {
  type: CloudToGlassesMessageType.PHOTO_REQUEST;
  requestId: string;
  appId: string;
  webhookUrl?: string;
  preferredSize?: PhotoSize;
  quality?: number;
}
```

PhotoManager:

- Stores pending request with timeout
- Generates webhook URL: `${app.publicUrl}/photo-upload`
- Sends `PhotoRequestToGlasses` to mobile via WebSocket

### 3. Mobile App Processing

#### 3.1 Android Path

**File**: `android_core/app/src/main/java/com/augmentos/augmentos_core/augmentos_backend/ServerComms.java`

**Function**: `handleIncomingMessage()` - case "photo_request"

Extracts parameters:

- `requestId`, `appId`, `webhookUrl`
- `preferredSize.width`, `preferredSize.height`
- `quality` (defaults to 90)

**Callback Interface**: `ServerCommsCallback.onPhotoRequest(requestId, appId, webhookUrl, preferredWidth, preferredHeight, quality)`

**File**: `android_core/app/src/main/java/com/augmentos/augmentos_core/AugmentosService.java`

**Function**: `onPhotoRequest(requestId, appId, webhookUrl, preferredWidth, preferredHeight, quality)`

Forwards to SmartGlassesManager.

**File**: `android_core/app/src/main/java/com/augmentos/augmentos_core/smarterglassesmanager/SmartGlassesManager.java`

**Function**: `requestPhoto(requestId, appId, webhookUrl, preferredWidth, preferredHeight, quality)`

Routes to appropriate SmartGlassesCommunicator.

**File**: `android_core/app/src/main/java/com/augmentos/augmentos_core/smarterglassesmanager/smartglassescommunicators/MentraLiveSGC.java`

**Function**: `requestPhoto(requestId, appId, webhookUrl, preferredWidth, preferredHeight, quality)`

Creates BLE message:

```json
{
  "type": "take_photo",
  "requestId": "...",
  "appId": "...",
  "webhookUrl": "...",
  "preferredSize": {
    "width": 1920,
    "height": 1440
  },
  "quality": 95
}
```

#### 3.2 iOS Path

**File**: `mobile/ios/BleManager/ServerComms.swift`

**Function**: `handleIncomingMessage()` - case "photo_request"

**Protocol**: `ServerCommsCallback.onPhotoRequest(requestId, appId, webhookUrl, preferredWidth, preferredHeight, quality)`

**File**: `mobile/ios/BleManager/AOSManager.swift`

**Function**: `onPhotoRequest(requestId, appId, webhookUrl, preferredWidth, preferredHeight, quality)`

**File**: `mobile/ios/BleManager/MentraLiveManager.swift`

**Function**: `requestPhoto(requestId, appId, webhookUrl, preferredWidth, preferredHeight, quality)`

Sends same BLE message format as Android.

### 4. Smart Glasses Processing

**File**: `asg_client/app/src/main/java/com/augmentos/asg_client/AsgClientService.java`

**Function**: `parseK900Command()` - case "take_photo"

Extracts all parameters and calls MediaCaptureService.

**File**: `asg_client/app/src/main/java/com/augmentos/asg_client/camera/MediaCaptureService.java`

**Function**: `takePhotoAndUpload(photoFilePath, requestId, webhookUrl, preferredWidth, preferredHeight, quality)`

**File**: `asg_client/app/src/main/java/com/augmentos/asg_client/camera/CameraNeo.java`

**Functions**:

- `takePictureWithCallback(context, filePath, preferredWidth, preferredHeight, quality, callback)`
- `setupCameraAndTakePicture(filePath, preferredWidth, preferredHeight, quality)`

CameraNeo:

- Uses Camera2 API
- Applies preferred dimensions (finds closest match)
- Sets JPEG quality
- Captures photo and saves to file

### 5. Photo Upload & Response

#### 5.1 Direct Upload to App

**File**: `asg_client/app/src/main/java/com/augmentos/asg_client/camera/MediaCaptureService.java`

**Function**: `uploadPhotoToWebhook(filePath, requestId, webhookUrl)`

Uploads photo directly to app's webhook URL with multipart form data:

- `photo`: File data
- `requestId`: Original request ID
- `type`: "photo_upload"

#### 5.2 App Server Reception

**File**: `cloud/packages/sdk/src/app/server/index.ts`

**Function**: `setupPhotoUploadEndpoint()` - POST `/photo-upload`

**Functions**:

- `extractImageDimensions(buffer, mimeType)` - Extracts actual dimensions from JPEG
- `extractJPEGDimensions(buffer)` - Parses JPEG headers for width/height

Creates PhotoData:

```typescript
interface PhotoData {
  buffer: Buffer;
  mimeType: string;
  filename: string;
  requestId: string;
  size: number;
  timestamp: Date;
  width?: number; // Actual captured width
  height?: number; // Actual captured height
}
```

#### 5.3 Delivery to App

**File**: `cloud/packages/sdk/src/app/session/modules/camera.ts`

**Function**: `handlePhotoReceived(photoData: PhotoData)`

Resolves the pending promise with complete PhotoData, including actual dimensions.

## Key Features

1. **Preferred Size**: Apps can request specific dimensions; glasses will use closest match
2. **Quality Control**: JPEG quality settable from 1-100
3. **Direct Upload**: Photos uploaded directly from glasses to app webhook
4. **Dimension Verification**: Actual captured dimensions returned in response
5. **Timeout Handling**: 30-second timeout for photo requests
6. **Backward Compatible**: All new parameters are optional

## Error Handling

- Permission checks at cloud level
- Timeout handling with promise rejection
- Connection state validation at each hop
- Graceful degradation if parameters not supported

## Message Formats

### SDK → Cloud

```json
{
  "type": "photo_request",
  "packageName": "com.example.app",
  "requestId": "photo_req_1234567890_abc123",
  "saveToGallery": false,
  "preferredSize": { "width": 1920, "height": 1440 },
  "quality": 95
}
```

### Cloud → Mobile

```json
{
  "type": "photo_request",
  "requestId": "photo_req_1234567890_abc123",
  "appId": "com.example.app",
  "webhookUrl": "https://app.example.com/photo-upload",
  "preferredSize": { "width": 1920, "height": 1440 },
  "quality": 95
}
```

### Mobile → Glasses (BLE)

```json
{
  "type": "take_photo",
  "requestId": "photo_req_1234567890_abc123",
  "appId": "com.example.app",
  "webhookUrl": "https://app.example.com/photo-upload",
  "preferredSize": { "width": 1920, "height": 1440 },
  "quality": 95
}
```
