package com.augmentos.asg_client.io.server.services;

import android.content.Context;
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
 * 
 * Follows SOLID principles with dependency injection and proper separation of concerns.
 */
public class AsgCameraServer extends AsgServer {

    private static final String TAG = "CameraWebServer";
    private static final int DEFAULT_PORT = 8089;
    
    // Package name for organizing camera files
    private static final String CAMERA_PACKAGE = "com.augmentos.asg_client.camera";
    
    // File management system
    private final FileManager fileManager;
    
    // Cache for latest photo metadata
    private FileMetadata latestPhotoMetadata;

    /** Callback interface for handling "take-picture" requests. */
    public interface OnPictureRequestListener {
        void onPictureRequest();
    }

    private OnPictureRequestListener pictureRequestListener;

    /**
     * Constructor for camera web server with dependency injection.
     * Follows Dependency Inversion Principle by depending on abstractions.
     * 
     * @param config Server configuration
     * @param networkProvider Network information provider
     * @param cacheManager Cache manager
     * @param rateLimiter Rate limiter
     * @param logger Logger
     * @param fileManager File manager for secure file operations
     */
    public AsgCameraServer(ServerConfig config, NetworkProvider networkProvider,
                           CacheManager cacheManager, RateLimiter rateLimiter, 
                           Logger logger, FileManager fileManager) {
        super(config, networkProvider, cacheManager, rateLimiter, logger);
        this.fileManager = fileManager;
        
        logger.info(getTag(), "📸 Camera server initialized with file manager");
        logger.info(getTag(), "📸 Camera package: " + CAMERA_PACKAGE);
        logger.info(getTag(), "📸 Base directory: " + fileManager.getAvailableSpace() + " bytes available");
    }

    /**
     * Constructor with default implementations.
     * 
     * @param context Android context
     * @param port Server port
     */
    public AsgCameraServer(Context context, int port) {
        this(createDefaultConfig(context, port), 
             createDefaultNetworkProvider(), 
             createDefaultCacheManager(), 
             createDefaultRateLimiter(), 
             createDefaultLogger(),
             FileManagerFactory.getInstance());
    }

    /**
     * Constructor with default port.
     * 
     * @param context Android context
     */
    public AsgCameraServer(Context context) {
        this(context, DEFAULT_PORT);
    }

    @Override
    protected String getTag() {
        return TAG;
    }

    // Helper methods for creating default implementations
    private static ServerConfig createDefaultConfig(Context context, int port) {
        return new DefaultServerConfig.Builder()
                .port(port)
                .serverName("CameraWebServer")
                .context(context)
                .build();
    }

    private static NetworkProvider createDefaultNetworkProvider() {
        Logger logger = createDefaultLogger();
        return new DefaultNetworkProvider(logger);
    }

    private static CacheManager createDefaultCacheManager() {
        Logger logger = createDefaultLogger();
        return new DefaultCacheManager(logger);
    }

    private static RateLimiter createDefaultRateLimiter() {
        Logger logger = createDefaultLogger();
        return new DefaultRateLimiter(100, 60000, logger);
    }

    private static Logger createDefaultLogger() {
        return LoggerFactory.createLogger();
    }


    /**
     * Set the listener that will be notified when someone clicks "take picture."
     */
    public void setOnPictureRequestListener(OnPictureRequestListener listener) {
        this.pictureRequestListener = listener;
        logger.debug(getTag(), "📸 Picture request listener " + (listener != null ? "set" : "cleared"));
    }

    /**
     * Handle specific camera-related requests with enhanced file management.
     */
    @Override
    protected Response handleRequest(IHTTPSession session) {
        String uri = session.getUri();
        
        switch (uri) {
            case "/":
                logger.debug(getTag(), "📄 Serving index page");
                return serveIndexPage();
            case "/api/take-picture":
                logger.debug(getTag(), "📸 Handling take picture request");
                return handleTakePicture();
            case "/api/latest-photo":
                logger.debug(getTag(), "🖼️ Serving latest photo");
                return serveLatestPhoto();
            case "/api/gallery":
                logger.debug(getTag(), "📚 Serving photo gallery");
                return serveGallery();
            case "/api/photo":
                logger.debug(getTag(), "🖼️ Serving specific photo");
                return servePhoto(session);
            case "/api/download":
                logger.debug(getTag(), "⬇️ Serving photo download");
                return serveDownload(session);
            case "/api/status":
                logger.debug(getTag(), "📊 Serving server status");
                return serveStatus();
            case "/api/health":
                logger.debug(getTag(), "❤️ Serving health check");
                return serveHealth();
            case "/api/cleanup":
                logger.debug(getTag(), "🧹 Serving cleanup request");
                return serveCleanup(session);
            default:
                // Check if it's a static file request
                if (uri.startsWith("/static/")) {
                    logger.debug(getTag(), "📁 Serving static file: " + uri);
                    return serveStaticFile(uri, "static");
                } else {
                    logger.warn(getTag(), "❌ Endpoint not found: " + uri);
                    return createErrorResponse(Response.Status.NOT_FOUND, "Endpoint not found: " + uri);
                }
        }
    }

    /**
     * Handle take picture request with proper response.
     */
    private Response handleTakePicture() {
        logger.debug(getTag(), "📸 =========================================");
        logger.debug(getTag(), "📸 TAKE PICTURE REQUEST HANDLER");
        logger.debug(getTag(), "📸 =========================================");
        
        if (pictureRequestListener != null) {
            logger.debug(getTag(), "📸 ✅ Picture listener available, triggering photo capture");
            pictureRequestListener.onPictureRequest();
            logger.debug(getTag(), "📸 ✅ Photo capture request sent successfully");
            
            Map<String, Object> data = new HashMap<>();
            data.put("message", "Picture request received");
            data.put("timestamp", System.currentTimeMillis());
            return createSuccessResponse(data);
        } else {
            logger.error(getTag(), "📸 ❌ Picture listener not available");
            return createErrorResponse(Response.Status.SERVICE_UNAVAILABLE, "Picture listener not available");
        }
    }

    /**
     * Serve the latest photo using the file management system.
     */
    private Response serveLatestPhoto() {
        logger.debug(getTag(), "🖼️ =========================================");
        logger.debug(getTag(), "🖼️ LATEST PHOTO REQUEST HANDLER");
        logger.debug(getTag(), "🖼️ =========================================");
        
        try {
            // Get latest photo metadata
            FileMetadata latestPhoto = getLatestPhotoMetadata();
            if (latestPhoto == null) {
                logger.warn(getTag(), "🖼️ ❌ No photo taken yet");
                return createErrorResponse(Response.Status.NOT_FOUND, "No photo taken yet");
            }

            // Get the file using FileManager
            File photoFile = fileManager.getFile(CAMERA_PACKAGE, latestPhoto.getFileName());
            if (photoFile == null || !photoFile.exists()) {
                logger.warn(getTag(), "🖼️ ❌ Photo file not found");
                return createErrorResponse(Response.Status.NOT_FOUND, "Photo file not found");
            }

            // Check cache first
            String cacheKey = "latest_" + latestPhoto.getLastModified();
            Object cachedData = cacheManager.get(cacheKey);
            
            if (cachedData != null) {
                byte[] cachedBytes = (byte[]) cachedData;
                logger.debug(getTag(), "🖼️ ✅ Serving latest photo from cache (" + cachedBytes.length + " bytes)");
                return newChunkedResponse(Response.Status.OK, "image/jpeg", new java.io.ByteArrayInputStream(cachedBytes));
            }

            // Read file and cache it
            logger.debug(getTag(), "🖼️ 📖 Reading photo file from disk...");
            try (FileInputStream fis = new FileInputStream(photoFile)) {
                byte[] fileData = fis.readAllBytes();
                logger.debug(getTag(), "🖼️ 📖 File read successfully: " + fileData.length + " bytes");
                
                if (fileData.length <= MAX_FILE_SIZE) {
                    logger.debug(getTag(), "🖼️ 💾 Caching photo data...");
                    cacheManager.put(cacheKey, fileData, 300000); // Cache for 5 minutes
                    
                    logger.debug(getTag(), "🖼️ ✅ Serving latest photo: " + latestPhoto.getFileName() + " (" + fileData.length + " bytes)");
                    return newChunkedResponse(Response.Status.OK, "image/jpeg", new java.io.ByteArrayInputStream(fileData));
                } else {
                    logger.warn(getTag(), "🖼️ ❌ Photo file too large: " + fileData.length + " bytes (max: " + MAX_FILE_SIZE + ")");
                    return createErrorResponse(Response.Status.PAYLOAD_TOO_LARGE, "Photo file too large");
                }
            }
        } catch (Exception e) {
            logger.error(getTag(), "🖼️ 💥 Error reading latest photo: " + e.getMessage(), e);
            return createErrorResponse(Response.Status.INTERNAL_ERROR, "Error reading photo file");
        }
    }

    /**
     * Serve gallery listing using the file management system.
     */
    private Response serveGallery() {
        logger.debug(getTag(), "📚 =========================================");
        logger.debug(getTag(), "📚 GALLERY REQUEST HANDLER");
        logger.debug(getTag(), "📚 =========================================");
        
        try {
            // Get all photos using FileManager
            List<FileMetadata> photoMetadataList = fileManager.listFiles(CAMERA_PACKAGE);
            logger.debug(getTag(), "📚 📊 Found " + photoMetadataList.size() + " photo files");
            
            if (photoMetadataList.isEmpty()) {
                logger.debug(getTag(), "📚 📭 No photos found, returning empty gallery");
                Map<String, Object> data = new HashMap<>();
                data.put("photos", new ArrayList<>());
                data.put("total_count", 0);
                data.put("total_size", 0);
                return createSuccessResponse(data);
            }

            List<Map<String, Object>> photos = new ArrayList<>();
            SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US);
            long totalSize = 0;
            
            logger.debug(getTag(), "📚 📋 Processing photo metadata...");
            for (FileMetadata photoMetadata : photoMetadataList) {
                Map<String, Object> photoInfo = new HashMap<>();
                photoInfo.put("name", photoMetadata.getFileName());
                photoInfo.put("size", photoMetadata.getFileSize());
                photoInfo.put("modified", sdf.format(new Date(photoMetadata.getLastModified())));
                photoInfo.put("mime_type", photoMetadata.getMimeType());
                photoInfo.put("url", "/api/photo?file=" + photoMetadata.getFileName());
                photoInfo.put("download", "/api/download?file=" + photoMetadata.getFileName());
                photos.add(photoInfo);
                
                totalSize += photoMetadata.getFileSize();
                logger.debug(getTag(), "📚 📸 Photo: " + photoMetadata.getFileName() + " (" + photoMetadata.getFileSize() + " bytes)");
            }

            // Sort by modification time (newest first)
            logger.debug(getTag(), "📚 🔄 Sorting photos by modification time...");
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

            logger.debug(getTag(), "📚 ✅ Gallery served successfully with " + photos.size() + " photos");
            Map<String, Object> data = new HashMap<>();
            data.put("photos", photos);
            data.put("total_count", photos.size());
            data.put("total_size", totalSize);
            data.put("package_name", CAMERA_PACKAGE);
            return createSuccessResponse(data);
        } catch (Exception e) {
            logger.error(getTag(), "📚 💥 Error serving gallery: " + e.getMessage(), e);
            return createErrorResponse(Response.Status.INTERNAL_ERROR, "Error reading gallery");
        }
    }

    /**
     * Serve a specific photo by filename using the file management system.
     */
    private Response servePhoto(IHTTPSession session) {
        logger.debug(getTag(), "🖼️ =========================================");
        logger.debug(getTag(), "🖼️ SPECIFIC PHOTO REQUEST HANDLER");
        logger.debug(getTag(), "🖼️ =========================================");
        
        Map<String, String> params = session.getParms();
        String filename = params.get("file");
        
        logger.debug(getTag(), "🖼️ 📝 Requested filename: " + filename);
        logger.debug(getTag(), "🖼️ 📝 All parameters: " + params);
        
        if (filename == null || filename.isEmpty()) {
            logger.warn(getTag(), "🖼️ ❌ File parameter missing or empty");
            return createErrorResponse(Response.Status.BAD_REQUEST, "File parameter required");
        }

        try {
            // Get file using FileManager (security validation is handled automatically)
            File photoFile = fileManager.getFile(CAMERA_PACKAGE, filename);
            if (photoFile == null || !photoFile.exists()) {
                logger.warn(getTag(), "🖼️ ❌ Photo file not found: " + filename);
                return createErrorResponse(Response.Status.NOT_FOUND, "Photo not found");
            }

            // Get metadata for MIME type
            FileMetadata metadata = fileManager.getFileMetadata(CAMERA_PACKAGE, filename);
            String mimeType = metadata != null ? metadata.getMimeType() : "image/jpeg";

            logger.debug(getTag(), "🖼️ 📖 Reading photo file from disk...");
            try (FileInputStream fis = new FileInputStream(photoFile)) {
                byte[] fileData = fis.readAllBytes();
                logger.debug(getTag(), "🖼️ 📖 File read successfully: " + fileData.length + " bytes");
                
                logger.debug(getTag(), "🖼️ ✅ Serving photo: " + filename + " (" + fileData.length + " bytes)");
                return newChunkedResponse(Response.Status.OK, mimeType, new java.io.ByteArrayInputStream(fileData));
            }
        } catch (Exception e) {
            logger.error(getTag(), "🖼️ 💥 Error reading photo " + filename + ": " + e.getMessage(), e);
            return createErrorResponse(Response.Status.INTERNAL_ERROR, "Error reading photo file");
        }
    }

    /**
     * Serve photo download with proper headers using the file management system.
     */
    private Response serveDownload(IHTTPSession session) {
        logger.debug(getTag(), "⬇️ =========================================");
        logger.debug(getTag(), "⬇️ DOWNLOAD REQUEST HANDLER");
        logger.debug(getTag(), "⬇️ =========================================");
        
        Map<String, String> params = session.getParms();
        String filename = params.get("file");
        
        logger.debug(getTag(), "⬇️ 📝 Requested filename: " + filename);
        logger.debug(getTag(), "⬇️ 📝 All parameters: " + params);
        
        if (filename == null || filename.isEmpty()) {
            logger.warn(getTag(), "⬇️ ❌ File parameter missing or empty");
            return createErrorResponse(Response.Status.BAD_REQUEST, "File parameter required");
        }

        try {
            // Get file using FileManager (security validation is handled automatically)
            File photoFile = fileManager.getFile(CAMERA_PACKAGE, filename);
            if (photoFile == null || !photoFile.exists()) {
                logger.warn(getTag(), "⬇️ ❌ Photo file not found: " + filename);
                return createErrorResponse(Response.Status.NOT_FOUND, "Photo not found");
            }

            // Get metadata for MIME type
            FileMetadata metadata = fileManager.getFileMetadata(CAMERA_PACKAGE, filename);
            String mimeType = metadata != null ? metadata.getMimeType() : "image/jpeg";

            Map<String, String> headers = new HashMap<>();
            headers.put("Content-Disposition", "attachment; filename=\"" + filename + "\"");
            headers.put("Content-Type", mimeType);
            headers.put("Content-Length", String.valueOf(photoFile.length()));
            
            logger.debug(getTag(), "⬇️ 📋 Response headers: " + headers);
            logger.debug(getTag(), "⬇️ ✅ Starting download: " + filename + " (" + photoFile.length() + " bytes)");
            return newChunkedResponse(Response.Status.OK, mimeType, new FileInputStream(photoFile));
        } catch (Exception e) {
            logger.error(getTag(), "⬇️ 💥 Error downloading photo " + filename + ": " + e.getMessage(), e);
            return createErrorResponse(Response.Status.INTERNAL_ERROR, "Error downloading photo file");
        }
    }

    /**
     * Serve cleanup request to remove old photos.
     */
    private Response serveCleanup(IHTTPSession session) {
        logger.debug(getTag(), "🧹 =========================================");
        logger.debug(getTag(), "🧹 CLEANUP REQUEST HANDLER");
        logger.debug(getTag(), "🧹 =========================================");
        
        Map<String, String> params = session.getParms();
        String maxAgeParam = params.get("max_age_hours");
        
        // Default to 24 hours if not specified
        long maxAgeHours = 24;
        if (maxAgeParam != null && !maxAgeParam.isEmpty()) {
            try {
                maxAgeHours = Long.parseLong(maxAgeParam);
            } catch (NumberFormatException e) {
                logger.warn(getTag(), "🧹 ❌ Invalid max_age_hours parameter: " + maxAgeParam);
                return createErrorResponse(Response.Status.BAD_REQUEST, "Invalid max_age_hours parameter");
            }
        }
        
        long maxAgeMs = maxAgeHours * 60 * 60 * 1000; // Convert to milliseconds
        
        try {
            logger.debug(getTag(), "🧹 🗑️ Cleaning up photos older than " + maxAgeHours + " hours...");
            int cleanedCount = fileManager.cleanupOldFiles(CAMERA_PACKAGE, maxAgeMs);
            
            logger.debug(getTag(), "🧹 ✅ Cleanup completed: " + cleanedCount + " files removed");
            
            Map<String, Object> data = new HashMap<>();
            data.put("message", "Cleanup completed successfully");
            data.put("files_removed", cleanedCount);
            data.put("max_age_hours", maxAgeHours);
            data.put("timestamp", System.currentTimeMillis());
            
            return createSuccessResponse(data);
        } catch (Exception e) {
            logger.error(getTag(), "🧹 💥 Error during cleanup: " + e.getMessage(), e);
            return createErrorResponse(Response.Status.INTERNAL_ERROR, "Error during cleanup");
        }
    }

    /**
     * Serve enhanced server status information with file management metrics.
     */
    private Response serveStatus() {
        logger.debug(getTag(), "📊 =========================================");
        logger.debug(getTag(), "📊 STATUS REQUEST HANDLER");
        logger.debug(getTag(), "📊 =========================================");
        
        try {
            Map<String, Object> status = new HashMap<>();
            status.put("server", "CameraWebServer");
            status.put("port", getListeningPort());
            status.put("uptime", System.currentTimeMillis() - getStartTime());
            status.put("cache_size", cacheManager.size());
            status.put("server_url", getServerUrl());
            
            // File management metrics
            status.put("package_name", CAMERA_PACKAGE);
            status.put("total_photos", fileManager.listFiles(CAMERA_PACKAGE).size());
            status.put("package_size", fileManager.getPackageSize(CAMERA_PACKAGE));
            status.put("available_space", fileManager.getAvailableSpace());
            status.put("total_space", fileManager.getTotalSpace());
            
            // Performance metrics from file manager
            var performanceStats = fileManager.getOperationLogger().getPerformanceStats();
            status.put("file_operations_total", performanceStats.totalOperations);
            status.put("file_operations_success_rate", performanceStats.successRate);
            status.put("file_operations_bytes_processed", performanceStats.totalBytesProcessed);
            
            logger.debug(getTag(), "📊 📈 Server port: " + getListeningPort());
            logger.debug(getTag(), "📊 📈 Cache size: " + cacheManager.size());
            logger.debug(getTag(), "📊 📈 Total photos: " + status.get("total_photos"));
            logger.debug(getTag(), "📊 📈 Package size: " + status.get("package_size") + " bytes");
            logger.debug(getTag(), "📊 📈 Available space: " + status.get("available_space") + " bytes");
            logger.debug(getTag(), "📊 📈 Success rate: " + performanceStats.successRate + "%");

            logger.debug(getTag(), "📊 ✅ Status served successfully");
            return createSuccessResponse(status);
        } catch (Exception e) {
            logger.error(getTag(), "📊 💥 Error serving status: " + e.getMessage(), e);
            return createErrorResponse(Response.Status.INTERNAL_ERROR, "Error getting status");
        }
    }

    /**
     * Serve health check endpoint.
     */
    private Response serveHealth() {
        logger.debug(getTag(), "❤️ =========================================");
        logger.debug(getTag(), "❤️ HEALTH CHECK REQUEST HANDLER");
        logger.debug(getTag(), "❤️ =========================================");
        
        long timestamp = System.currentTimeMillis();
        logger.debug(getTag(), "❤️ ✅ Health check passed at timestamp: " + timestamp);
        
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
        logger.debug(getTag(), "📄 =========================================");
        logger.debug(getTag(), "📄 INDEX PAGE REQUEST HANDLER");
        logger.debug(getTag(), "📄 =========================================");
        
        try {
            logger.debug(getTag(), "📄 📖 Reading index.html from assets...");
            InputStream inputStream = config.getContext().getAssets().open("index.html");
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            int nRead;
            byte[] data = new byte[1024];
            while ((nRead = inputStream.read(data, 0, data.length)) != -1) {
                buffer.write(data, 0, nRead);
            }
            buffer.flush();

            String html = new String(buffer.toByteArray(), StandardCharsets.UTF_8);
            logger.debug(getTag(), "📄 📖 HTML file read successfully: " + html.length() + " characters");
            
            // Replace placeholders with dynamic content
            String serverUrl = getServerUrl();
            String serverPort = String.valueOf(getListeningPort());
            
            logger.debug(getTag(), "📄 🔄 Replacing placeholders...");
            logger.debug(getTag(), "📄 🔄 Server URL: " + serverUrl);
            logger.debug(getTag(), "📄 🔄 Server Port: " + serverPort);
            
            String finalHtml = html.replace("{{SERVER_URL}}", serverUrl)
                .replace("{{SERVER_PORT}}", serverPort);

            logger.debug(getTag(), "📄 ✅ Index page served successfully");
            logger.debug(getTag(), "📄 📄 Final HTML size: " + finalHtml.length() + " characters");
            
            return newFixedLengthResponse(Response.Status.OK, "text/html", finalHtml);
        } catch (IOException e) {
            logger.error(getTag(), "📄 💥 Error reading index.html from assets", e);
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
                if (fileManager.fileExists(CAMERA_PACKAGE, latestPhotoMetadata.getFileName())) {
                    return latestPhotoMetadata;
                }
            }
            
            // Get all photos and find the latest one
            List<FileMetadata> photos = fileManager.listFiles(CAMERA_PACKAGE);
            if (photos.isEmpty()) {
                return null;
            }
            
            // Sort by modification time (newest first) and return the latest
            photos.sort((a, b) -> Long.compare(b.getLastModified(), a.getLastModified()));
            latestPhotoMetadata = photos.get(0);
            
            return latestPhotoMetadata;
        } catch (Exception e) {
            logger.error(getTag(), "Error getting latest photo metadata: " + e.getMessage(), e);
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
        return CAMERA_PACKAGE;
    }
} 