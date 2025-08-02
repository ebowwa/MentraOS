package com.augmentos.asg_client.server;

import android.content.Context;
import com.augmentos.asg_client.io.media.core.CameraNeo;
import com.augmentos.asg_client.server.impl.AndroidLogger;
import com.augmentos.asg_client.server.impl.DefaultCacheManager;
import com.augmentos.asg_client.server.impl.DefaultNetworkProvider;
import com.augmentos.asg_client.server.impl.DefaultRateLimiter;
import com.augmentos.asg_client.server.impl.DefaultServerConfig;
import com.augmentos.asg_client.server.interfaces.*;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.text.SimpleDateFormat;
import java.util.*;

/**
 * Camera web server for ASG (AugmentOS Smart Glasses) applications.
 * Provides RESTful API for photo capture, gallery browsing, and file downloads.
 * Follows SOLID principles with dependency injection.
 */
public class AsgCameraServer extends AsgServer {

    private static final String TAG = "CameraWebServer";
    private static final int DEFAULT_PORT = 8089;

    private final String photoDirectory;

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
     */
    public AsgCameraServer(ServerConfig config, NetworkProvider networkProvider,
                           CacheManager cacheManager, RateLimiter rateLimiter, Logger logger) {
        super(config, networkProvider, cacheManager, rateLimiter, logger);
        this.photoDirectory = getPhotoDirectory();
        
        logger.info(getTag(), "📸 Photo directory: " + photoDirectory);
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
             createDefaultLogger());
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
        return new AndroidLogger();
    }

    /**
     * Set the listener that will be notified when someone clicks "take picture."
     */
    public void setOnPictureRequestListener(OnPictureRequestListener listener) {
        this.pictureRequestListener = listener;
        logger.debug(getTag(), "📸 Picture request listener " + (listener != null ? "set" : "cleared"));
    }

    /**
     * Handle specific camera-related requests.
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
            return createSuccessResponse(data);
        } else {
            logger.error(getTag(), "📸 ❌ Picture listener not available");
            return createErrorResponse(Response.Status.SERVICE_UNAVAILABLE, "Picture listener not available");
        }
    }

    /**
     * Serve the latest photo with caching and compression.
     */
    private Response serveLatestPhoto() {
        logger.debug(getTag(), "🖼️ =========================================");
        logger.debug(getTag(), "🖼️ LATEST PHOTO REQUEST HANDLER");
        logger.debug(getTag(), "🖼️ =========================================");
        
        String path = CameraNeo.getLastPhotoPath();
        logger.debug(getTag(), "🖼️ 📍 Last photo path: " + path);
        
        if (path == null || path.isEmpty()) {
            logger.warn(getTag(), "🖼️ ❌ No photo taken yet");
            return createErrorResponse(Response.Status.NOT_FOUND, "No photo taken yet");
        }

        File photoFile = new File(path);
        logger.debug(getTag(), "🖼️ 📁 Photo file: " + photoFile.getAbsolutePath());
        logger.debug(getTag(), "🖼️ 📁 File exists: " + photoFile.exists());
        logger.debug(getTag(), "🖼️ 📁 File size: " + (photoFile.exists() ? photoFile.length() : "N/A") + " bytes");
        
        if (!photoFile.exists()) {
            logger.warn(getTag(), "🖼️ ❌ Photo file not found");
            return createErrorResponse(Response.Status.NOT_FOUND, "Photo file not found");
        }

        try {
            // Check cache first
            String cacheKey = "latest_" + photoFile.lastModified();
            Object cachedData = cacheManager.get(cacheKey);
            
            if (cachedData != null) {
                byte[] cachedBytes = (byte[]) cachedData;
                logger.debug(getTag(), "🖼️ ✅ Serving latest photo from cache (" + cachedBytes.length + " bytes)");
                return newChunkedResponse(Response.Status.OK, "image/jpeg", new java.io.ByteArrayInputStream(cachedBytes));
            }

            // Read file and cache it
            logger.debug(getTag(), "🖼️ 📖 Reading photo file from disk...");
            byte[] fileData = Files.readAllBytes(photoFile.toPath());
            logger.debug(getTag(), "🖼️ 📖 File read successfully: " + fileData.length + " bytes");
            
            if (fileData.length <= MAX_FILE_SIZE) {
                logger.debug(getTag(), "🖼️ 💾 Caching photo data...");
                cacheManager.put(cacheKey, fileData, 300000); // Cache for 5 minutes
                
                logger.debug(getTag(), "🖼️ ✅ Serving latest photo: " + photoFile.getName() + " (" + fileData.length + " bytes)");
                return newChunkedResponse(Response.Status.OK, "image/jpeg", new java.io.ByteArrayInputStream(fileData));
            } else {
                logger.warn(getTag(), "🖼️ ❌ Photo file too large: " + fileData.length + " bytes (max: " + MAX_FILE_SIZE + ")");
                return createErrorResponse(Response.Status.PAYLOAD_TOO_LARGE, "Photo file too large");
            }
        } catch (IOException e) {
            logger.error(getTag(), "🖼️ 💥 Error reading latest photo: " + e.getMessage(), e);
            return createErrorResponse(Response.Status.INTERNAL_ERROR, "Error reading photo file");
        }
    }

    /**
     * Serve gallery listing with metadata.
     */
    private Response serveGallery() {
        logger.debug(getTag(), "📚 =========================================");
        logger.debug(getTag(), "📚 GALLERY REQUEST HANDLER");
        logger.debug(getTag(), "📚 =========================================");
        
        try {
            File photoDir = new File(photoDirectory);
            logger.debug(getTag(), "📚 📁 Photo directory: " + photoDir.getAbsolutePath());
            logger.debug(getTag(), "📚 📁 Directory exists: " + photoDir.exists());
            logger.debug(getTag(), "📚 📁 Is directory: " + (photoDir.exists() ? photoDir.isDirectory() : "N/A"));
            
            if (!photoDir.exists() || !photoDir.isDirectory()) {
                logger.warn(getTag(), "📚 ❌ Photo directory not found or not a directory");
                return createErrorResponse(Response.Status.NOT_FOUND, "Photo directory not found");
            }

            logger.debug(getTag(), "📚 🔍 Scanning for photo files...");
            File[] photoFiles = photoDir.listFiles((dir, name) -> 
                name.toLowerCase().endsWith(".jpg") || name.toLowerCase().endsWith(".jpeg"));
            
            logger.debug(getTag(), "📚 📊 Found " + (photoFiles != null ? photoFiles.length : 0) + " photo files");
            
            if (photoFiles == null || photoFiles.length == 0) {
                logger.debug(getTag(), "📚 📭 No photos found, returning empty gallery");
                Map<String, Object> data = new HashMap<>();
                data.put("photos", new ArrayList<>());
                return createSuccessResponse(data);
            }

            List<Map<String, Object>> photos = new ArrayList<>();
            SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US);
            
            logger.debug(getTag(), "📚 📋 Processing photo metadata...");
            for (File photo : photoFiles) {
                Map<String, Object> photoInfo = new HashMap<>();
                photoInfo.put("name", photo.getName());
                photoInfo.put("size", photo.length());
                photoInfo.put("modified", sdf.format(new Date(photo.lastModified())));
                photoInfo.put("url", "/api/photo?file=" + photo.getName());
                photoInfo.put("download", "/api/download?file=" + photo.getName());
                photos.add(photoInfo);
                
                logger.debug(getTag(), "📚 📸 Photo: " + photo.getName() + " (" + photo.length() + " bytes)");
            }

            // Sort by modification time (newest first)
            logger.debug(getTag(), "📚 🔄 Sorting photos by modification time...");
            photos.sort((a, b) -> {
                long timeA = new File(photoDirectory, (String) Objects.requireNonNull(a.get("name"))).lastModified();
                long timeB = new File(photoDirectory, (String) Objects.requireNonNull(b.get("name"))).lastModified();
                return Long.compare(timeB, timeA);
            });

            logger.debug(getTag(), "📚 ✅ Gallery served successfully with " + photos.size() + " photos");
            Map<String, Object> data = new HashMap<>();
            data.put("photos", photos);
            return createSuccessResponse(data);
        } catch (Exception e) {
            logger.error(getTag(), "📚 💥 Error serving gallery: " + e.getMessage(), e);
            return createErrorResponse(Response.Status.INTERNAL_ERROR, "Error reading gallery");
        }
    }

    /**
     * Serve a specific photo by filename.
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

        // Security: prevent directory traversal
        if (filename.contains("..") || filename.contains("/") || filename.contains("\\")) {
            logger.warn(getTag(), "🖼️ ❌ Invalid filename (directory traversal attempt): " + filename);
            return createErrorResponse(Response.Status.BAD_REQUEST, "Invalid filename");
        }

        File photoFile = new File(photoDirectory, filename);
        logger.debug(getTag(), "🖼️ 📁 Full file path: " + photoFile.getAbsolutePath());
        logger.debug(getTag(), "🖼️ 📁 File exists: " + photoFile.exists());
        logger.debug(getTag(), "🖼️ 📁 Is file: " + (photoFile.exists() ? photoFile.isFile() : "N/A"));
        logger.debug(getTag(), "🖼️ 📁 File size: " + (photoFile.exists() ? photoFile.length() : "N/A") + " bytes");
        
        if (!photoFile.exists() || !photoFile.isFile()) {
            logger.warn(getTag(), "🖼️ ❌ Photo file not found or not a file");
            return createErrorResponse(Response.Status.NOT_FOUND, "Photo not found");
        }

        try {
            logger.debug(getTag(), "🖼️ 📖 Reading photo file from disk...");
            byte[] fileData = Files.readAllBytes(photoFile.toPath());
            logger.debug(getTag(), "🖼️ 📖 File read successfully: " + fileData.length + " bytes");
            
            logger.debug(getTag(), "🖼️ ✅ Serving photo: " + filename + " (" + fileData.length + " bytes)");
            return newChunkedResponse(Response.Status.OK, "image/jpeg", new java.io.ByteArrayInputStream(fileData));
        } catch (IOException e) {
            logger.error(getTag(), "🖼️ 💥 Error reading photo " + filename + ": " + e.getMessage(), e);
            return createErrorResponse(Response.Status.INTERNAL_ERROR, "Error reading photo file");
        }
    }

    /**
     * Serve photo download with proper headers.
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

        // Security: prevent directory traversal
        if (filename.contains("..") || filename.contains("/") || filename.contains("\\")) {
            logger.warn(getTag(), "⬇️ ❌ Invalid filename (directory traversal attempt): " + filename);
            return createErrorResponse(Response.Status.BAD_REQUEST, "Invalid filename");
        }

        File photoFile = new File(photoDirectory, filename);
        logger.debug(getTag(), "⬇️ 📁 Full file path: " + photoFile.getAbsolutePath());
        logger.debug(getTag(), "⬇️ 📁 File exists: " + photoFile.exists());
        logger.debug(getTag(), "⬇️ 📁 Is file: " + (photoFile.exists() ? photoFile.isFile() : "N/A"));
        logger.debug(getTag(), "⬇️ 📁 File size: " + (photoFile.exists() ? photoFile.length() : "N/A") + " bytes");
        
        if (!photoFile.exists() || !photoFile.isFile()) {
            logger.warn(getTag(), "⬇️ ❌ Photo file not found or not a file");
            return createErrorResponse(Response.Status.NOT_FOUND, "Photo not found");
        }

        try {
            Map<String, String> headers = new HashMap<>();
            headers.put("Content-Disposition", "attachment; filename=\"" + filename + "\"");
            headers.put("Content-Type", "image/jpeg");
            headers.put("Content-Length", String.valueOf(photoFile.length()));
            
            logger.debug(getTag(), "⬇️ 📋 Response headers: " + headers);
            logger.debug(getTag(), "⬇️ ✅ Starting download: " + filename + " (" + photoFile.length() + " bytes)");
            return newChunkedResponse(Response.Status.OK, "image/jpeg", new FileInputStream(photoFile));
        } catch (IOException e) {
            logger.error(getTag(), "⬇️ 💥 Error downloading photo " + filename + ": " + e.getMessage(), e);
            return createErrorResponse(Response.Status.INTERNAL_ERROR, "Error downloading photo file");
        }
    }

    /**
     * Serve server status information.
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
            status.put("photo_directory", photoDirectory);
            status.put("server_url", getServerUrl());
            
            logger.debug(getTag(), "📊 📈 Server port: " + getListeningPort());
            logger.debug(getTag(), "📊 📈 Cache size: " + cacheManager.size());
            logger.debug(getTag(), "📊 📈 Photo directory: " + photoDirectory);
            logger.debug(getTag(), "📊 📈 Server URL: " + getServerUrl());
            
            // Get photo directory stats
            File photoDir = new File(photoDirectory);
            if (photoDir.exists()) {
                File[] photos = photoDir.listFiles((dir, name) -> 
                    name.toLowerCase().endsWith(".jpg") || name.toLowerCase().endsWith(".jpeg"));
                int totalPhotos = photos != null ? photos.length : 0;
                status.put("total_photos", totalPhotos);
                logger.debug(getTag(), "📊 📈 Total photos: " + totalPhotos);
            } else {
                status.put("total_photos", 0);
                logger.debug(getTag(), "📊 📈 Total photos: 0 (directory not found)");
            }

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
     * Get the photo directory path.
     */
    private String getPhotoDirectory() {
        // Try to get from CameraNeo first
        String lastPhotoPath = CameraNeo.getLastPhotoPath();
        if (lastPhotoPath != null && !lastPhotoPath.isEmpty()) {
            File lastPhoto = new File(lastPhotoPath);
            if (lastPhoto.exists()) {
                String parent = lastPhoto.getParent();
                if (parent != null) {
                    return parent;
                }
            }
        }
        
        // Fallback to default directory
        File externalDir = config.getContext().getExternalFilesDir(null);
        if (externalDir != null) {
            return externalDir.getAbsolutePath();
        }
        
        throw new IllegalStateException("Cannot determine photo directory");
    }
} 