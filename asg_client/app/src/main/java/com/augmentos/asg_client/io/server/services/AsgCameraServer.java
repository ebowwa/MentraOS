package com.augmentos.asg_client.io.server.services;

import android.content.Context;
import android.os.Build;

import com.augmentos.asg_client.camera.CameraNeo;
import com.augmentos.asg_client.io.server.core.AsgServer;
import com.augmentos.asg_client.io.server.core.DefaultCacheManager;
import com.augmentos.asg_client.io.server.core.DefaultNetworkProvider;
import com.augmentos.asg_client.io.server.core.DefaultRateLimiter;
import com.augmentos.asg_client.io.server.core.DefaultServerConfig;
import com.augmentos.asg_client.io.server.interfaces.*;
import com.augmentos.asg_client.logging.Logger;
import com.augmentos.asg_client.logging.LoggerFactory;
import com.augmentos.asg_client.io.file.core.FileManager;
import com.augmentos.asg_client.io.file.core.FileManagerFactory;
import com.augmentos.asg_client.io.file.core.FileManager.FileMetadata;
import com.augmentos.asg_client.io.file.core.FileManager.FileOperationResult;

import fi.iki.elonen.NanoHTTPD.IHTTPSession;
import fi.iki.elonen.NanoHTTPD.Response;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.*;

/**
 * Enhanced Camera web server for ASG (AugmentOS Smart Glasses) applications.
 * Provides RESTful API for photo capture, gallery browsing, and file downloads.
 * Integrates with the comprehensive file management system for better security,
 * performance, and maintainability.
 * <p>
 * Follows SOLID principles with dependency injection and proper separation of concerns.
 */
public class AsgCameraServer extends AsgServer {

    private static final String TAG = AsgCameraServer.class.getName();
    private static final int DEFAULT_PORT = 8089;

    // File management system
    private final FileManager fileManager;

    // Cache for latest photo metadata
    private FileMetadata latestPhotoMetadata;

    /**
     * Callback interface for handling "take-picture" requests.
     */
    public interface OnPictureRequestListener {
        void onPictureRequest();
    }

    private OnPictureRequestListener pictureRequestListener;

    /**
     * Constructor for camera web server with dependency injection.
     * Follows Dependency Inversion Principle by depending on abstractions.
     *
     * @param config          Server configuration
     * @param networkProvider Network information provider
     * @param cacheManager    Cache manager
     * @param rateLimiter     Rate limiter
     * @param logger          Logger
     * @param fileManager     File manager for secure file operations
     */
    public AsgCameraServer(ServerConfig config, NetworkProvider networkProvider,
                           CacheManager cacheManager, RateLimiter rateLimiter,
                           Logger logger, FileManager fileManager) {
        super(config, networkProvider, cacheManager, rateLimiter, logger);
        this.fileManager = fileManager;

        logger.info(TAG, "📸 Camera server initialized with file manager");
        logger.info(TAG, "📸 Camera package: " + fileManager.getDefaultPackageName());
        logger.info(TAG, "📸 Base directory: " + fileManager.getAvailableSpace() + " bytes available");
    }

    @Override
    protected String getTag() {
        return TAG;
    }

    /**
     * Set the listener that will be notified when someone clicks "take picture."
     */
    public void setOnPictureRequestListener(OnPictureRequestListener listener) {
        this.pictureRequestListener = listener;
        logger.debug(TAG, "📸 Picture request listener " + (listener != null ? "set" : "cleared"));
    }

    /**
     * Handle specific camera-related requests with enhanced file management.
     */
    @Override
    protected Response handleRequest(IHTTPSession session) {
        String uri = session.getUri();

        switch (uri) {
            case "/":
                logger.debug(TAG, "📄 Serving index page");
                return serveIndexPage();
            case "/api/take-picture":
                logger.debug(TAG, "📸 Handling take picture request");
                return handleTakePicture();
            case "/api/latest-photo":
                logger.debug(TAG, "🖼️ Serving latest photo");
                return serveLatestPhoto();
            case "/api/gallery":
                logger.debug(TAG, "📚 Serving photo gallery");
                return serveGallery();
            case "/api/photo":
                logger.debug(TAG, "🖼️ Serving specific photo");
                return servePhoto(session);
            case "/api/download":
                logger.debug(TAG, "⬇️ Serving photo download");
                return serveDownload(session);
            case "/api/status":
                logger.debug(TAG, "📊 Serving server status");
                return serveStatus();
            case "/api/health":
                logger.debug(TAG, "❤️ Serving health check");
                return serveHealth();
            case "/api/cleanup":
                logger.debug(TAG, "🧹 Serving cleanup request");
                return serveCleanup(session);
            default:
                // Check if it's a static file request
                if (uri.startsWith("/static/")) {
                    logger.debug(TAG, "📁 Serving static file: " + uri);
                    return serveStaticFile(uri, "static");
                } else {
                    logger.warn(TAG, "❌ Endpoint not found: " + uri);
                    return createErrorResponse(Response.Status.NOT_FOUND, "Endpoint not found: " + uri);
                }
        }
    }

    /**
     * Handle take picture request with proper response.
     */
    private Response handleTakePicture() {
        logger.debug(TAG, "📸 =========================================");
        logger.debug(TAG, "📸 TAKE PICTURE REQUEST HANDLER");
        logger.debug(TAG, "📸 =========================================");

        if (pictureRequestListener != null) {
            logger.debug(TAG, "📸 ✅ Picture listener available, triggering photo capture");
            pictureRequestListener.onPictureRequest();
            logger.debug(TAG, "📸 ✅ Photo capture request sent successfully");

            Map<String, Object> data = new HashMap<>();
            data.put("message", "Picture request received");
            data.put("timestamp", System.currentTimeMillis());
            return createSuccessResponse(data);
        } else {
            logger.error(TAG, "📸 ❌ Picture listener not available");
            return createErrorResponse(Response.Status.SERVICE_UNAVAILABLE, "Picture listener not available");
        }
    }

    /**
     * Serve the latest photo using the file management system.
     */
    private Response serveLatestPhoto() {
        logger.debug(TAG, "🖼️ =========================================");
        logger.debug(TAG, "🖼️ LATEST PHOTO REQUEST HANDLER");
        logger.debug(TAG, "🖼️ =========================================");

        try {
            // Get latest photo metadata
            FileMetadata latestPhoto = getLatestPhotoMetadata();
            if (latestPhoto == null) {
                logger.warn(TAG, "🖼️ ❌ No photo taken yet");
                return createErrorResponse(Response.Status.NOT_FOUND, "No photo taken yet");
            }

            // Get the file using FileManager
            File photoFile = fileManager.getFile(fileManager.getDefaultPackageName(), latestPhoto.getFileName());
            if (photoFile == null || !photoFile.exists()) {
                logger.warn(TAG, "🖼️ ❌ Photo file not found");
                return createErrorResponse(Response.Status.NOT_FOUND, "Photo file not found");
            }

            // Check cache first
            String cacheKey = "latest_" + latestPhoto.getLastModified();
            Object cachedData = cacheManager.get(cacheKey);

            if (cachedData != null) {
                byte[] cachedBytes = (byte[]) cachedData;
                logger.debug(TAG, "🖼️ ✅ Serving latest photo from cache (" + cachedBytes.length + " bytes)");
                return newChunkedResponse(Response.Status.OK, "image/jpeg", new java.io.ByteArrayInputStream(cachedBytes));
            }

            // Read file and cache it
            logger.debug(TAG, "🖼️ 📖 Reading photo file from disk...");
            try (FileInputStream fis = new FileInputStream(photoFile)) {
                byte[] fileData = null;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    fileData = fis.readAllBytes();
                } else {
                    fileData = new byte[(int) photoFile.length()];
                    fis.read(fileData);
                }
                logger.debug(TAG, "🖼️ 📖 File read successfully: " + fileData.length + " bytes");

                if (fileData.length <= MAX_FILE_SIZE) {
                    logger.debug(TAG, "🖼️ 💾 Caching photo data...");
                    cacheManager.put(cacheKey, fileData, 300000); // Cache for 5 minutes

                    logger.debug(TAG, "🖼️ ✅ Serving latest photo: " + latestPhoto.getFileName() + " (" + fileData.length + " bytes)");
                    return newChunkedResponse(Response.Status.OK, "image/jpeg", new java.io.ByteArrayInputStream(fileData));
                } else {
                    logger.warn(TAG, "🖼️ ❌ Photo file too large: " + fileData.length + " bytes (max: " + MAX_FILE_SIZE + ")");
                    return createErrorResponse(Response.Status.PAYLOAD_TOO_LARGE, "Photo file too large");
                }
            }
        } catch (Exception e) {
            logger.error(TAG, "🖼️ 💥 Error reading latest photo: " + e.getMessage(), e);
            return createErrorResponse(Response.Status.INTERNAL_ERROR, "Error reading photo file");
        }
    }

    /**
     * Serve gallery listing using the file management system.
     */
    private Response serveGallery() {
        logger.debug(TAG, "📚 Gallery request started");

        long startTime = System.currentTimeMillis();
        long timeoutMs = 5000; // 5 second timeout for gallery requests

        try {
            // Get all photos using FileManager with timeout
            List<FileMetadata> photoMetadataList = fileManager.listFiles(fileManager.getDefaultPackageName());
            
            long fetchTime = System.currentTimeMillis() - startTime;
            logger.debug(TAG, "📚 Found " + photoMetadataList.size() + " photos in " + fetchTime + "ms");

            if (photoMetadataList.isEmpty()) {
                logger.debug(TAG, "📚 No photos found, returning empty gallery");
                Map<String, Object> data = new HashMap<>();
                data.put("photos", new ArrayList<>());
                data.put("total_count", 0);
                data.put("total_size", 0);
                return createSuccessResponse(data);
            }

            // Check timeout before processing
            if (System.currentTimeMillis() - startTime > timeoutMs) {
                logger.warn(TAG, "📚 Gallery request timeout after " + (System.currentTimeMillis() - startTime) + "ms");
                return createErrorResponse(Response.Status.REQUEST_TIMEOUT, "Gallery request timeout");
            }

            List<Map<String, Object>> photos = new ArrayList<>();
            SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US);
            long totalSize = 0;

            for (FileMetadata photoMetadata : photoMetadataList) {
                // Check timeout during processing
                if (System.currentTimeMillis() - startTime > timeoutMs) {
                    logger.warn(TAG, "📚 Gallery processing timeout after " + (System.currentTimeMillis() - startTime) + "ms");
                    return createErrorResponse(Response.Status.REQUEST_TIMEOUT, "Gallery processing timeout");
                }
                
                Map<String, Object> photoInfo = new HashMap<>();
                photoInfo.put("name", photoMetadata.getFileName());
                photoInfo.put("size", photoMetadata.getFileSize());
                photoInfo.put("modified", sdf.format(new Date(photoMetadata.getLastModified())));
                photoInfo.put("mime_type", photoMetadata.getMimeType());
                photoInfo.put("url", "/api/photo?file=" + photoMetadata.getFileName());
                photoInfo.put("download", "/api/download?file=" + photoMetadata.getFileName());
                photos.add(photoInfo);

                totalSize += photoMetadata.getFileSize();
            }

            // Sort by modification time (newest first)
            photos.sort((a, b) -> {
                String timeAStr = (String) a.get("modified");
                String timeBStr = (String) b.get("modified");
                try {
                    Date dateA = sdf.parse(timeAStr);
                    Date dateB = sdf.parse(timeBStr);
                    return Long.compare(dateB.getTime(), dateA.getTime());
                } catch (Exception e) {
                    return 0; // Keep original order if parsing fails
                }
            });

            long totalTime = System.currentTimeMillis() - startTime;
            logger.debug(TAG, "📚 Gallery served successfully with " + photos.size() + " photos in " + totalTime + "ms");
            
            Map<String, Object> data = new HashMap<>();
            data.put("photos", photos);
            data.put("total_count", photos.size());
            data.put("total_size", totalSize);
            data.put("package_name", fileManager.getDefaultPackageName());
            data.put("processing_time_ms", totalTime);
            return createSuccessResponse(data);
        } catch (Exception e) {
            long totalTime = System.currentTimeMillis() - startTime;
            logger.error(TAG, "📚 Error serving gallery after " + totalTime + "ms: " + e.getMessage(), e);
            return createErrorResponse(Response.Status.INTERNAL_ERROR, "Error reading gallery");
        }
    }

    /**
     * Serve a specific photo by filename using the file management system.
     */
    private Response servePhoto(IHTTPSession session) {
        logger.debug(TAG, "🖼️ Photo request started");

        Map<String, String> params = session.getParms();
        String filename = params.get("file");

        logger.debug(TAG, "🖼️ Requested filename: " + filename);

        if (filename == null || filename.isEmpty()) {
            logger.warn(TAG, "🖼️ File parameter missing or empty");
            return createErrorResponse(Response.Status.BAD_REQUEST, "File parameter required");
        }

        try {
            // Get file using FileManager (security validation is handled automatically)
            File photoFile = fileManager.getFile(fileManager.getDefaultPackageName(), filename);
            if (photoFile == null || !photoFile.exists()) {
                logger.warn(TAG, "🖼️ Photo file not found: " + filename);
                return createErrorResponse(Response.Status.NOT_FOUND, "Photo not found");
            }

            // Get metadata for MIME type
            FileMetadata metadata = fileManager.getFileMetadata(fileManager.getDefaultPackageName(), filename);
            String mimeType = metadata != null ? metadata.getMimeType() : "image/jpeg";

            logger.debug(TAG, "🖼️ Reading photo file from disk...");
            try (FileInputStream fis = new FileInputStream(photoFile)) {
                byte[] fileData = null;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    fileData = fis.readAllBytes();
                } else {
                    fileData = new byte[(int) photoFile.length()];
                    fis.read(fileData);
                }
                logger.debug(TAG, "🖼️ File read successfully: " + fileData.length + " bytes");

                logger.debug(TAG, "🖼️ Serving photo: " + filename + " (" + fileData.length + " bytes)");
                return newChunkedResponse(Response.Status.OK, mimeType, new java.io.ByteArrayInputStream(fileData));
            }
        } catch (Exception e) {
            logger.error(TAG, "🖼️ Error reading photo " + filename + ": " + e.getMessage(), e);
            return createErrorResponse(Response.Status.INTERNAL_ERROR, "Error reading photo file");
        }
    }

    /**
     * Serve photo download with proper headers using the file management system.
     */
    private Response serveDownload(IHTTPSession session) {
        logger.debug(TAG, "⬇️ ========================================\");\n" +
                "        logger.debug(TAG, \"⬇\uFE0F DOWNLOAD REQUE=ST HANDLER");
        logger.debug(TAG, "⬇️ =========================================");

        Map<String, String> params = session.getParms();
        String filename = params.get("file");

        logger.debug(TAG, "⬇️ 📝 Requested filename: " + filename);
        logger.debug(TAG, "⬇️ 📝 All parameters: " + params);

        if (filename == null || filename.isEmpty()) {
            logger.warn(TAG, "⬇️ ❌ File parameter missing or empty");
            return createErrorResponse(Response.Status.BAD_REQUEST, "File parameter required");
        }

        try {
            // Get file using FileManager (security validation is handled automatically)
            File photoFile = fileManager.getFile(fileManager.getDefaultPackageName(), filename);
            if (photoFile == null || !photoFile.exists()) {
                logger.warn(TAG, "⬇️ ❌ Photo file not found: " + filename);
                return createErrorResponse(Response.Status.NOT_FOUND, "Photo not found");
            }

            // Get metadata for MIME type
            FileMetadata metadata = fileManager.getFileMetadata(fileManager.getDefaultPackageName(), filename);
            String mimeType = metadata != null ? metadata.getMimeType() : "image/jpeg";

            Map<String, String> headers = new HashMap<>();
            headers.put("Content-Disposition", "attachment; filename=\"" + filename + "\"");
            headers.put("Content-Type", mimeType);
            headers.put("Content-Length", String.valueOf(photoFile.length()));

            logger.debug(TAG, "⬇️ 📋 Response headers: " + headers);
            logger.debug(TAG, "⬇️ ✅ Starting download: " + filename + " (" + photoFile.length() + " bytes)");
            return newChunkedResponse(Response.Status.OK, mimeType, new FileInputStream(photoFile));
        } catch (Exception e) {
            logger.error(TAG, "⬇️ 💥 Error downloading photo " + filename + ": " + e.getMessage(), e);
            return createErrorResponse(Response.Status.INTERNAL_ERROR, "Error downloading photo file");
        }
    }

    /**
     * Serve cleanup request to remove old photos.
     */
    private Response serveCleanup(IHTTPSession session) {
        logger.debug(TAG, "🧹 =========================================");
        logger.debug(TAG, "🧹 CLEANUP REQUEST HANDLER");
        logger.debug(TAG, "🧹 =========================================");

        Map<String, String> params = session.getParms();
        String maxAgeParam = params.get("max_age_hours");

        // Default to 24 hours if not specified
        long maxAgeHours = 24;
        if (maxAgeParam != null && !maxAgeParam.isEmpty()) {
            try {
                maxAgeHours = Long.parseLong(maxAgeParam);
            } catch (NumberFormatException e) {
                logger.warn(TAG, "🧹 ❌ Invalid max_age_hours parameter: " + maxAgeParam);
                return createErrorResponse(Response.Status.BAD_REQUEST, "Invalid max_age_hours parameter");
            }
        }

        long maxAgeMs = maxAgeHours * 60 * 60 * 1000; // Convert to milliseconds

        try {
            logger.debug(TAG, "🧹 🗑️ Cleaning up photos older than " + maxAgeHours + " hours...");
            int cleanedCount = fileManager.cleanupOldFiles(fileManager.getDefaultPackageName(), maxAgeMs);

            logger.debug(TAG, "🧹 ✅ Cleanup completed: " + cleanedCount + " files removed");

            Map<String, Object> data = new HashMap<>();
            data.put("message", "Cleanup completed successfully");
            data.put("files_removed", cleanedCount);
            data.put("max_age_hours", maxAgeHours);
            data.put("timestamp", System.currentTimeMillis());

            return createSuccessResponse(data);
        } catch (Exception e) {
            logger.error(TAG, "🧹 💥 Error during cleanup: " + e.getMessage(), e);
            return createErrorResponse(Response.Status.INTERNAL_ERROR, "Error during cleanup");
        }
    }

    /**
     * Serve enhanced server status information with file management metrics.
     */
    private Response serveStatus() {
        logger.debug(TAG, "📊 =========================================");
        logger.debug(TAG, "📊 STATUS REQUEST HANDLER");
        logger.debug(TAG, "📊 =========================================");

        try {
            Map<String, Object> status = new HashMap<>();
            status.put("server", "CameraWebServer");
            status.put("port", getListeningPort());
            status.put("uptime", System.currentTimeMillis() - getStartTime());
            status.put("cache_size", cacheManager.size());
            status.put("server_url", getServerUrl());

            // File management metrics
            status.put("package_name", fileManager.getDefaultPackageName());
            status.put("total_photos", fileManager.listFiles(fileManager.getDefaultPackageName()).size());
            status.put("package_size", fileManager.getPackageSize(fileManager.getDefaultPackageName()));
            status.put("available_space", fileManager.getAvailableSpace());
            status.put("total_space", fileManager.getTotalSpace());

            // Performance metrics from file manager
            var performanceStats = fileManager.getOperationLogger().getPerformanceStats();
            status.put("file_operations_total", performanceStats.totalOperations);
            status.put("file_operations_success_rate", performanceStats.successRate);
            status.put("file_operations_bytes_processed", performanceStats.totalBytesProcessed);

            logger.debug(TAG, "📊 📈 Server port: " + getListeningPort());
            logger.debug(TAG, "📊 📈 Cache size: " + cacheManager.size());
            logger.debug(TAG, "📊 📈 Total photos: " + status.get("total_photos"));
            logger.debug(TAG, "📊 📈 Package size: " + status.get("package_size") + " bytes");
            logger.debug(TAG, "📊 📈 Available space: " + status.get("available_space") + " bytes");
            logger.debug(TAG, "📊 📈 Success rate: " + performanceStats.successRate + "%");

            logger.debug(TAG, "📊 ✅ Status served successfully");
            return createSuccessResponse(status);
        } catch (Exception e) {
            logger.error(TAG, "📊 💥 Error serving status: " + e.getMessage(), e);
            return createErrorResponse(Response.Status.INTERNAL_ERROR, "Error getting status");
        }
    }

    /**
     * Serve health check endpoint.
     */
    private Response serveHealth() {
        logger.debug(TAG, "❤️ =========================================");
        logger.debug(TAG, "❤️ HEALTH CHECK REQUEST HANDLER");
        logger.debug(TAG, "❤️ =========================================");

        long timestamp = System.currentTimeMillis();
        logger.debug(TAG, "❤️ ✅ Health check passed at timestamp: " + timestamp);

        return newFixedLengthResponse(
                Response.Status.OK,
                "application/json",
                "{\"status\":\"healthy\",\"timestamp\":" + timestamp + "}"
        );
    }

    /**
     * Serve the enhanced index page with gallery and better UI.
     */
    private Response serveIndexPage() {
        logger.debug(TAG, "📄 =========================================");
        logger.debug(TAG, "📄 INDEX PAGE REQUEST HANDLER");
        logger.debug(TAG, "📄 =========================================");

        try {
            logger.debug(TAG, "📄 📖 Reading index.html from assets...");
            InputStream inputStream = config.getContext().getAssets().open("index.html");
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            int nRead;
            byte[] data = new byte[1024];
            while ((nRead = inputStream.read(data, 0, data.length)) != -1) {
                buffer.write(data, 0, nRead);
            }
            buffer.flush();

            String html = new String(buffer.toByteArray(), StandardCharsets.UTF_8);
            logger.debug(TAG, "📄 📖 HTML file read successfully: " + html.length() + " characters");

            // Replace placeholders with dynamic content
            String serverUrl = getServerUrl();
            String serverPort = String.valueOf(getListeningPort());

            logger.debug(TAG, "📄 🔄 Replacing placeholders...");
            logger.debug(TAG, "📄 🔄 Server URL: " + serverUrl);
            logger.debug(TAG, "📄 🔄 Server Port: " + serverPort);

            String finalHtml = html.replace("{{SERVER_URL}}", serverUrl)
                    .replace("{{SERVER_PORT}}", serverPort);

            logger.debug(TAG, "📄 ✅ Index page served successfully");
            logger.debug(TAG, "📄 📄 Final HTML size: " + finalHtml.length() + " characters");

            return newFixedLengthResponse(Response.Status.OK, "text/html", finalHtml);
        } catch (IOException e) {
            logger.error(TAG, "📄 💥 Error reading index.html from assets", e);
            return newFixedLengthResponse(Response.Status.INTERNAL_ERROR, "text/plain", "Failed to load index.html");
        }
    }

    /**
     * Get the latest photo metadata with caching.
     */
    private FileMetadata getLatestPhotoMetadata() {
        try {
            // Check if we have a cached latest photo
            if (latestPhotoMetadata != null) {
                // Verify it still exists
                if (fileManager.fileExists(fileManager.getDefaultPackageName(), latestPhotoMetadata.getFileName())) {
                    return latestPhotoMetadata;
                }
            }

            // Get all photos and find the latest one
            List<FileMetadata> photos = fileManager.listFiles(fileManager.getDefaultPackageName());
            if (photos.isEmpty()) {
                return null;
            }

            // Sort by modification time (newest first) and return the latest
            photos.sort((a, b) -> Long.compare(b.getLastModified(), a.getLastModified()));
            latestPhotoMetadata = photos.get(0);

            return latestPhotoMetadata;
        } catch (Exception e) {
            logger.error(TAG, "Error getting latest photo metadata: " + e.getMessage(), e);
            return null;
        }
    }

    /**
     * Get the FileManager instance for external access.
     */
    public FileManager getFileManager() {
        return fileManager;
    }

    /**
     * Get the camera package name.
     */
    public String getCameraPackage() {
        return fileManager.getDefaultPackageName();
    }
} 