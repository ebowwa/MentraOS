package com.augmentos.asg_client.service.core.handlers;

import android.util.Log;
import com.augmentos.asg_client.service.communication.interfaces.ICommunicationManager;
import com.augmentos.asg_client.service.legacy.interfaces.ICommandHandler;
import com.augmentos.asg_client.service.legacy.managers.AsgClientServiceManager;
import com.augmentos.asg_client.io.file.core.FileManager;
import com.augmentos.asg_client.io.file.core.FileManager.FileMetadata;

import org.json.JSONObject;
import java.util.List;
import java.util.Set;

/**
 * Handler for gallery-related commands.
 * Provides gallery status information to the phone via BLE.
 */
public class GalleryCommandHandler implements ICommandHandler {
    private static final String TAG = "GalleryCommandHandler";
    
    private final AsgClientServiceManager serviceManager;
    private final ICommunicationManager communicationManager;

    public GalleryCommandHandler(AsgClientServiceManager serviceManager, 
                                ICommunicationManager communicationManager) {
        this.serviceManager = serviceManager;
        this.communicationManager = communicationManager;
    }

    @Override
    public Set<String> getSupportedCommandTypes() {
        return Set.of("query_gallery_status");
    }

    @Override
    public boolean handleCommand(String commandType, JSONObject data) {
        try {
            switch (commandType) {
                case "query_gallery_status":
                    return handleQueryGalleryStatus();
                default:
                    Log.e(TAG, "Unsupported gallery command: " + commandType);
                    return false;
            }
        } catch (Exception e) {
            Log.e(TAG, "Error handling gallery command: " + commandType, e);
            return false;
        }
    }

    /**
     * Handle query gallery status command.
     * Returns the count of photos and videos in the gallery using the same
     * FileManager approach as the HTTP server.
     */
    private boolean handleQueryGalleryStatus() {
        try {
            Log.d(TAG, "📸 Querying gallery status...");
            
            // Get FileManager from the camera server (same way HTTP server does it)
            FileManager fileManager = null;
            if (serviceManager != null && serviceManager.getCameraServer() != null) {
                fileManager = serviceManager.getCameraServer().getFileManager();
            }
            
            if (fileManager == null) {
                Log.e(TAG, "📸 FileManager not available");
                return sendEmptyGalleryStatus();
            }
            
            // Get all files using FileManager (same as HTTP server)
            List<FileMetadata> allFiles = fileManager.listFiles(fileManager.getDefaultPackageName());
            
            int photoCount = 0;
            int videoCount = 0;
            long totalSize = 0;
            
            // Count photos and videos using same logic as HTTP server
            for (FileMetadata metadata : allFiles) {
                String fileName = metadata.getFileName().toLowerCase();
                totalSize += metadata.getFileSize();
                
                if (isVideoFile(fileName)) {
                    videoCount++;
                } else {
                    photoCount++;  // Assume non-video files are photos
                }
            }
            
            // Build response
            JSONObject response = new JSONObject();
            response.put("type", "gallery_status");
            response.put("photos", photoCount);
            response.put("videos", videoCount);
            response.put("total", photoCount + videoCount);
            response.put("total_size", totalSize);
            response.put("has_content", (photoCount + videoCount) > 0);
            
            Log.d(TAG, "📸 Gallery status: " + photoCount + " photos, " + videoCount + " videos, " + 
                       formatBytes(totalSize) + " total size");
            
            // Send response
            boolean sent = communicationManager.sendBluetoothResponse(response);
            Log.d(TAG, "📸 " + (sent ? "✅ Gallery status sent successfully" : "❌ Failed to send gallery status"));
            
            return sent;
        } catch (Exception e) {
            Log.e(TAG, "📸 Error querying gallery status", e);
            return sendEmptyGalleryStatus();
        }
    }
    
    /**
     * Send empty gallery status when FileManager is not available
     */
    private boolean sendEmptyGalleryStatus() {
        try {
            JSONObject response = new JSONObject();
            response.put("type", "gallery_status");
            response.put("photos", 0);
            response.put("videos", 0);
            response.put("total", 0);
            response.put("total_size", 0);
            response.put("has_content", false);
            
            return communicationManager.sendBluetoothResponse(response);
        } catch (Exception e) {
            Log.e(TAG, "📸 Error sending empty gallery status", e);
            return false;
        }
    }
    
    /**
     * Check if a file is a video based on extension.
     * Uses same logic as the HTTP server.
     */
    private boolean isVideoFile(String fileName) {
        String lowerName = fileName.toLowerCase();
        return lowerName.endsWith(".mp4") || 
               lowerName.endsWith(".mov") || 
               lowerName.endsWith(".avi") || 
               lowerName.endsWith(".mkv") ||
               lowerName.endsWith(".webm") ||
               lowerName.endsWith(".3gp");
    }
    
    /**
     * Format bytes to human readable string
     */
    private String formatBytes(long bytes) {
        if (bytes < 1024) return bytes + " B";
        int exp = (int) (Math.log(bytes) / Math.log(1024));
        String pre = "KMGTPE".charAt(exp-1) + "";
        return String.format("%.1f %sB", bytes / Math.pow(1024, exp), pre);
    }
}