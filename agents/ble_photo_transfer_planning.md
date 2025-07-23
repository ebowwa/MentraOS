# BLE Photo Transfer Planning Document

## Overview

This document outlines the design for implementing photo transfer via BLE when glasses don't have WiFi connectivity. The system needs to handle photo capture on glasses, transfer via BLE to the phone, and then upload from phone to the destination webhook.

## Current State Analysis

### Photo Capture Flow

1. **Phone → Glasses Command Path:**
   - MentraLiveSGC.requestPhoto() sends JSON: `{"type": "take_photo", "requestId": "...", "appId": "...", "webhookUrl": "..."}`
   - AsgClientService receives command and calls MediaCaptureService.takePhotoAndUpload()
   - Photo is captured and uploaded directly from glasses when WiFi is available

2. **WiFi Status Tracking:**
   - Glasses track WiFi state in AsgClientService with debouncing (1 second)
   - Status is sent to phone via BLE: `{"type": "wifi_status", "connected": bool, "ssid": "...", "local_ip": "..."}`
   - Phone knows glasses WiFi status and can make routing decisions
   - WiFi state changes trigger immediate status updates over BLE

3. **Existing BLE File Transfer:**
   - Already implemented for firmware updates and other files
   - Uses K900ProtocolUtils for packet formatting
   - Supports 400-byte data packets with big-endian byte order
   - File transfer speed: ~22 KB/s
   - BES chip handles auto-acknowledgments

## Proposed Solution

### Architecture Overview

```
App Request → Phone → Glasses (no WiFi) → Photo Capture → Compress → BLE Transfer → Phone → Decode → Upload to Webhook
                 ↓
         Check WiFi Status
                 ↓
         Route Decision
```

### Implementation Approach

#### 1. Enhanced Photo Request Message

Modify the take_photo command to include transfer method and BLE image ID:

```json
{
  "type": "take_photo",
  "requestId": "uuid-123",
  "appId": "com.example.app",
  "webhookUrl": "https://api.example.com/photo",
  "transferMethod": "ble", // Optional: defaults to "direct" if not present
  "bleImgId": "IMG123456" // New field: 10 char max filename for BLE transfer
}
```

#### 2. Phone-Side Routing Logic (MentraLiveSGC.java)

```java
public void requestPhoto(String requestId, String appId, String webhookUrl) {
    // Check if glasses have WiFi
    boolean glassesHaveWifi = isGlassesConnectedToWifi(); // From status tracking

    JSONObject json = new JSONObject();
    json.put("type", "take_photo");
    json.put("requestId", requestId);
    json.put("appId", appId);
    json.put("webhookUrl", webhookUrl);

    if (glassesHaveWifi) {
        json.put("transferMethod", "direct");
    } else {
        json.put("transferMethod", "ble");
        // Generate short unique ID (10 chars max for K900 filename)
        // Format: "I" + 9 digit counter/random
        String bleImgId = "I" + String.format("%09d", System.currentTimeMillis() % 1000000000);
        json.put("bleImgId", bleImgId);

        // Track this transfer
        trackBlePhotoTransfer(bleImgId, requestId, webhookUrl);
    }

    sendJson(json, true);
}
```

#### 3. Glasses-Side Photo Capture with Compression (AsgClientService.java)

```java
case "take_photo":
    String requestId = dataToProcess.optString("requestId", "");
    String webhookUrl = dataToProcess.optString("webhookUrl", "");
    String transferMethod = dataToProcess.optString("transferMethod", "direct"); // Defaults to direct
    String bleImgId = dataToProcess.optString("bleImgId", "");

    if (requestId.isEmpty()) {
        Log.e(TAG, "Cannot take photo - missing requestId");
        return;
    }

    String timeStamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());
    String photoFilePath = getExternalFilesDir(null) + File.separator + "IMG_" + timeStamp + ".jpg";

    if ("ble".equals(transferMethod)) {
        // Take photo, compress with AVIF, and send via BLE
        mMediaCaptureService.takePhotoForBleTransfer(photoFilePath, requestId, bleImgId);
    } else {
        // Existing direct upload path
        mMediaCaptureService.takePhotoAndUpload(photoFilePath, requestId, webhookUrl);
    }
    break;
```

#### 4. Image Compression Strategy

On the glasses side (MediaCaptureService.java):

```java
public void takePhotoForBleTransfer(String photoFilePath, String requestId, String bleImgId) {
    CameraNeo.takePictureWithCallback(mContext, photoFilePath, new CameraNeo.PhotoCaptureCallback() {
        @Override
        public void onPhotoCaptured(String filePath) {
            // Compress for BLE transfer
            compressAndSendViaBle(filePath, requestId, bleImgId);
        }
    });
}

private void compressAndSendViaBle(String originalPath, String requestId, String bleImgId) {
    new Thread(() -> {
        try {
            // 1. Load original image
            Bitmap original = BitmapFactory.decodeFile(originalPath);

            // 2. Calculate new dimensions maintaining aspect ratio
            // AGGRESSIVE: Use 320x240 as base resolution
            int targetWidth = 320;
            int targetHeight = 240;
            float aspectRatio = (float) original.getWidth() / original.getHeight();

            if (aspectRatio > targetWidth / (float) targetHeight) {
                targetHeight = (int) (targetWidth / aspectRatio);
            } else {
                targetWidth = (int) (targetHeight * aspectRatio);
            }

            // 3. Resize bitmap
            Bitmap resized = Bitmap.createScaledBitmap(original, targetWidth, targetHeight, true);
            original.recycle();

            // 4. Encode as AVIF with aggressive settings
            // AVIF quality: 30 (low quality for fast BLE transfer)
            byte[] avifData = encodeAsAvif(resized, 30); // quality param
            resized.recycle();

            // 5. Send via BLE using existing file transfer
            String avifPath = getExternalFilesDir(null) + "/" + bleImgId + ".avif";
            FileOutputStream fos = new FileOutputStream(avifPath);
            fos.write(avifData);
            fos.close();

            // Use K900BluetoothManager to send file with bleImgId as filename
            if (bluetoothManager instanceof K900BluetoothManager) {
                K900BluetoothManager k900 = (K900BluetoothManager) bluetoothManager;
                k900.sendImageFile(avifPath, bleImgId); // Uses bleImgId as filename in protocol
            }

        } catch (Exception e) {
            Log.e(TAG, "Error compressing photo for BLE", e);
            sendPhotoError(requestId, e.getMessage());
        }
    }).start();
}
```

#### 5. Phone-Side Reception and Decoding

In MentraLiveSGC.java, handle the BLE photo reception:

```java
// Track BLE photo transfers by bleImgId
private Map<String, BlePhotoTransfer> blePhotoTransfers = new HashMap<>();

private class BlePhotoTransfer {
    String bleImgId;
    String requestId;
    String webhookUrl;
    FileTransferSession session;
}

// When we initiate a BLE transfer
private void trackBlePhotoTransfer(String bleImgId, String requestId, String webhookUrl) {
    BlePhotoTransfer transfer = new BlePhotoTransfer();
    transfer.bleImgId = bleImgId;
    transfer.requestId = requestId;
    transfer.webhookUrl = webhookUrl;
    blePhotoTransfers.put(bleImgId, transfer);
}

// In processFilePacket - check if this is a tracked photo
private void processFilePacket(byte[] data) {
    FilePacketInfo packetInfo = K900ProtocolUtils.extractFilePacket(data);

    // Check if this is a BLE photo transfer we're tracking
    BlePhotoTransfer photoTransfer = blePhotoTransfers.get(packetInfo.fileName);
    if (photoTransfer != null) {
        // Process as photo transfer
        if (photoTransfer.session == null) {
            photoTransfer.session = new FileTransferSession(packetInfo.fileName, packetInfo.fileSize);
        }

        photoTransfer.session.addPacket(packetInfo);

        if (photoTransfer.session.isComplete()) {
            // Decode AVIF and upload
            decodeAndUploadPhoto(photoTransfer);
            blePhotoTransfers.remove(packetInfo.fileName);
        }
    }
}

private void decodeAndUploadPhoto(BlePhotoTransfer transfer) {
    // Delegate to separate utility class
    byte[] avifData = transfer.session.getCompleteData();
    BlePhotoUploadService.processAndUploadPhoto(
        avifData,
        transfer.requestId,
        transfer.webhookUrl,
        getCoreToken(),
        new BlePhotoUploadService.UploadCallback() {
            @Override
            public void onSuccess(String requestId) {
                Log.d(TAG, "Photo uploaded successfully via phone relay");
                sendPhotoUploadSuccess(requestId);
            }

            @Override
            public void onError(String requestId, String error) {
                Log.e(TAG, "Photo upload failed: " + error);
                sendPhotoUploadError(requestId, error);
            }
        }
    );
}
```

#### 6. BLE Photo Upload Service (New File)

Create `BlePhotoUploadService.java` to handle AVIF decoding and webhook upload:

```java
public class BlePhotoUploadService {
    private static final String TAG = "BlePhotoUploadService";

    public interface UploadCallback {
        void onSuccess(String requestId);
        void onError(String requestId, String error);
    }

    public static void processAndUploadPhoto(byte[] avifData, String requestId,
                                            String webhookUrl, String authToken,
                                            UploadCallback callback) {
        new Thread(() -> {
            try {
                // 1. Decode AVIF to Bitmap
                Bitmap bitmap = decodeAvif(avifData);

                // 2. Convert to JPEG for upload
                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                bitmap.compress(Bitmap.CompressFormat.JPEG, 90, baos);
                byte[] jpegData = baos.toByteArray();
                bitmap.recycle();

                // 3. Upload to webhook
                uploadToWebhook(jpegData, requestId, webhookUrl, authToken);
                callback.onSuccess(requestId);

            } catch (Exception e) {
                Log.e(TAG, "Error processing BLE photo", e);
                callback.onError(requestId, e.getMessage());
            }
        }).start();
    }

    private static Bitmap decodeAvif(byte[] avifData) {
        // AVIF decoding implementation
        // Requires Android API 31+ or external library
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return BitmapFactory.decodeByteArray(avifData, 0, avifData.length);
        } else {
            // Fallback or throw exception
            throw new UnsupportedOperationException("AVIF not supported on this Android version");
        }
    }

    private static void uploadToWebhook(byte[] jpegData, String requestId,
                                       String webhookUrl, String authToken) throws IOException {
        OkHttpClient client = new OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build();

        RequestBody requestBody = new MultipartBody.Builder()
            .setType(MultipartBody.FORM)
            .addFormDataPart("requestId", requestId)
            .addFormDataPart("photo", requestId + ".jpg",
                RequestBody.create(MediaType.parse("image/jpeg"), jpegData))
            .build();

        Request request = new Request.Builder()
            .url(webhookUrl)
            .post(requestBody)
            .addHeader("Authorization", "Bearer " + authToken)
            .build();

        try (Response response = client.newCall(request).execute()) {
            if (!response.isSuccessful()) {
                throw new IOException("Upload failed: " + response.code());
            }
        }
    }
}
```

#### 7. Completion Notification

After the glasses complete the BLE transfer, send a completion message:

```java
// On glasses side, after BLE transfer completes
private void sendBleTransferComplete(String requestId, String bleImgId, boolean success) {
    JSONObject json = new JSONObject();
    json.put("type", "ble_photo_complete");
    json.put("requestId", requestId);
    json.put("bleImgId", bleImgId);
    json.put("success", success);

    bluetoothManager.sendData(json.toString().getBytes());
}
```

## Performance Considerations

1. **Image Compression Benefits**:
   - Original photo: 2-5 MB
   - Resized to 320x240: ~75 KB (JPEG equivalent)
   - AVIF encoded (quality 30): ~10-20 KB
   - Transfer time: 0.5-1 second at 22 KB/s (vs 90-230 seconds uncompressed)

2. **AVIF Advantages**:
   - 50-70% smaller than JPEG at same quality
   - Better quality at lower bitrates
   - Android native support (API 31+)
   - Quality 30 provides recognizable images sufficient for most use cases

3. **Processing Time**:
   - Resize: ~50-100ms (smaller target size)
   - AVIF encode: ~300-500ms
   - Total overhead: <1 second (massive transfer speed improvement)

## Implementation Phases

### Phase 1: Basic BLE Photo Transfer

- Add BLE transfer method to take_photo command
- Implement basic image resizing
- Use JPEG compression initially (if AVIF not available)
- Track transfers by bleImgId

### Phase 2: AVIF Integration

- Add AVIF encoding on glasses
- Add AVIF decoding on phone
- Fallback to JPEG if AVIF unavailable

### Phase 3: Optimization

- Fine-tune compression parameters
- Add progress tracking
- Implement transfer cancellation

## Key Benefits of This Approach

1. **Simplicity**: Using bleImgId as filename eliminates complex mapping
2. **Performance**: AVIF compression reduces transfer time by 90%+
3. **Reliability**: Leverages existing proven BLE file transfer
4. **Compatibility**: Falls back gracefully if compression unavailable
