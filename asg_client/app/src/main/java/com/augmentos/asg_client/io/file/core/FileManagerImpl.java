package com.augmentos.asg_client.io.file.core;

import com.augmentos.asg_client.logging.Logger;
import com.augmentos.asg_client.io.file.managers.FileOperationsManager;
import com.augmentos.asg_client.io.file.managers.FileSecurityManager;
import com.augmentos.asg_client.io.file.managers.FileLockManager;
import com.augmentos.asg_client.io.file.managers.DirectoryManager;
import com.augmentos.asg_client.io.file.utils.FileOperationLogger;
import com.augmentos.asg_client.io.file.utils.MimeTypeRegistry;
import java.io.File;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.locks.ReadWriteLock;
import android.util.Log;
import java.util.Map;

/**
 * SOLID-compliant FileManager implementation that orchestrates focused managers.
 * Follows Single Responsibility Principle by delegating to specialized managers.
 */
public class FileManagerImpl implements FileManager {
    
    private static final String TAG = "FileManagerImpl";
    
    // Focused managers (SRP)
    private final FileOperationsManager operationsManager;
    private final FileSecurityManager securityManager;
    private final FileLockManager lockManager;
    private final DirectoryManager directoryManager;
    private final FileOperationLogger operationLogger;
    
    // Dependencies
    private final Logger logger;
    private final File baseDirectory;
    
    public FileManagerImpl(File baseDirectory, Logger logger) {
        this.baseDirectory = baseDirectory;
        this.logger = logger;
        
        // Initialize focused managers
        this.operationsManager = new FileOperationsManager(baseDirectory, logger);
        this.securityManager = new FileSecurityManager(logger);
        this.lockManager = new FileLockManager(logger);
        this.directoryManager = new DirectoryManager(baseDirectory, logger);
        this.operationLogger = new FileOperationLogger(logger);
        
        logger.info(TAG, "FileManagerImpl initialized with base directory: " + baseDirectory.getAbsolutePath());
    }
    
    // FileOperations implementation
    @Override
    public FileOperationResult saveFile(String packageName, String fileName, InputStream inputStream, String mimeType) {
        // Security validation
        if (!securityManager.validateOperation(packageName, fileName, "SAVE")) {
            return FileOperationResult.error("Security validation failed");
        }
        
        // MIME type validation
        if (!securityManager.validateMimeType(mimeType)) {
            return FileOperationResult.error("Invalid MIME type");
        }
        
        // Thread synchronization
        ReadWriteLock lock = lockManager.acquireWriteLock(packageName);
        try {
            // Ensure directory exists
            if (!directoryManager.ensurePackageDirectoryExists(packageName)) {
                return FileOperationResult.error("Failed to create package directory");
            }
            
            // Perform file operation
            return operationsManager.saveFile(packageName, fileName, inputStream, mimeType);
        } finally {
            lockManager.releaseWriteLock(lock, packageName);
        }
    }
    
    @Override
    public File getFile(String packageName, String fileName) {
        Log.d(TAG, "📁 getFile() called - Package: " + packageName + ", File: " + fileName);
        
        // Security validation
        if (!securityManager.validateOperation(packageName, fileName, "READ")) {
            Log.w(TAG, "❌ Security validation failed for file read");
            return null;
        }
        
        // Thread synchronization with timeout for web server operations
        ReadWriteLock lock = null;
        try {
            Log.d(TAG, "🔐 Acquiring read lock for file read operation");
            // Use a shorter timeout for web server operations to prevent blocking cleanup
            lock = lockManager.acquireReadLock(packageName, 2000, "FILE_READ"); // 2 second timeout
            if (lock == null) {
                Log.w(TAG, "⚠️ Failed to acquire read lock for file read - timeout");
                return null;
            }
            
            File packageDir = directoryManager.getPackageDirectory(packageName);
            if (!packageDir.exists() || !packageDir.isDirectory()) {
                Log.d(TAG, "📁 Package directory does not exist: " + packageDir.getAbsolutePath());
                return null;
            }
            
            File file = new File(packageDir, fileName);
            if (!file.exists() || !file.isFile()) {
                Log.d(TAG, "📁 File does not exist: " + file.getAbsolutePath());
                return null;
            }
            
            Log.d(TAG, "✅ File found: " + file.getAbsolutePath() + " (Size: " + file.length() + " bytes)");
            return file;
            
        } catch (Exception e) {
            Log.e(TAG, "💥 Error getting file", e);
            return null;
        } finally {
            if (lock != null) {
                Log.d(TAG, "🔓 Releasing read lock for file read operation");
                lockManager.releaseReadLock(lock, packageName);
            }
        }
    }
    
    @Override
    public FileOperationResult deleteFile(String packageName, String fileName) {
        Log.d(TAG, "🗑️ deleteFile() called - Package: " + packageName + ", File: " + fileName);
        
        // Security validation
        if (!securityManager.validateOperation(packageName, fileName, "DELETE")) {
            Log.w(TAG, "❌ Security validation failed for file deletion");
            return FileOperationResult.error("Security validation failed");
        }
        
        // Thread synchronization
        ReadWriteLock lock = lockManager.acquireWriteLock(packageName);
        try {
            return operationsManager.deleteFile(packageName, fileName);
        } finally {
            lockManager.releaseWriteLock(lock, packageName);
        }
    }
    
    @Override
    public FileOperationResult updateFile(String packageName, String fileName, InputStream inputStream, String mimeType) {
        Log.d(TAG, "📝 updateFile() called - Package: " + packageName + ", File: " + fileName);
        
        // Security validation
        if (!securityManager.validateOperation(packageName, fileName, "UPDATE")) {
            Log.w(TAG, "❌ Security validation failed for file update");
            return FileOperationResult.error("Security validation failed");
        }
        
        // MIME type validation
        if (!securityManager.validateMimeType(mimeType)) {
            return FileOperationResult.error("Invalid MIME type");
        }
        
        // Thread synchronization
        ReadWriteLock lock = lockManager.acquireWriteLock(packageName);
        try {
            return operationsManager.updateFile(packageName, fileName, inputStream, mimeType);
        } finally {
            lockManager.releaseWriteLock(lock, packageName);
        }
    }
    
    // FileMetadataOperations implementation
    @Override
    public FileMetadata getFileMetadata(String packageName, String fileName) {
        Log.d(TAG, "📋 getFileMetadata() called - Package: " + packageName + ", File: " + fileName);
        
        // Security validation
        if (!securityManager.validateOperation(packageName, fileName, "METADATA")) {
            Log.w(TAG, "❌ Security validation failed for metadata request");
            return null;
        }
        
        // Thread synchronization with timeout for web server operations
        ReadWriteLock lock = null;
        try {
            Log.d(TAG, "🔐 Acquiring read lock for metadata operation");
            // Use a shorter timeout for web server operations to prevent blocking cleanup
            lock = lockManager.acquireReadLock(packageName, 2000, "FILE_METADATA"); // 2 second timeout
            if (lock == null) {
                Log.w(TAG, "⚠️ Failed to acquire read lock for metadata - timeout");
                return null;
            }
            
            File file = getFile(packageName, fileName);
            if (file == null || !file.exists()) {
                Log.d(TAG, "📋 File does not exist: " + fileName);
                return null;
            }
            
            Log.d(TAG, "📋 Creating metadata for file: " + fileName);
            FileMetadata metadata = new FileMetadata(
                fileName,
                file.getAbsolutePath(),
                file.length(),
                file.lastModified(),
                new MimeTypeRegistry().getMimeType(fileName),
                packageName
            );
            
            Log.d(TAG, "✅ Metadata created successfully: " + metadata);
            return metadata;
            
        } catch (Exception e) {
            Log.e(TAG, "💥 Error getting file metadata", e);
            return null;
        } finally {
            if (lock != null) {
                Log.d(TAG, "🔓 Releasing read lock for metadata operation");
                lockManager.releaseReadLock(lock, packageName);
            }
        }
    }
    
    @Override
    public List<FileMetadata> listFiles(String packageName) {
        Log.d(TAG, "📋 listFiles() called - Package: " + packageName);
        
        // Security validation
        if (!securityManager.validateOperation(packageName, null, "LIST")) {
            Log.w(TAG, "❌ Security validation failed for file listing");
            return new ArrayList<>();
        }
        
        // Thread synchronization with timeout
        ReadWriteLock lock = null;
        try {
            Log.d(TAG, "🔐 Acquiring read lock for file listing operation");
            lock = lockManager.acquireReadLock(packageName, 3000, "FILE_LIST"); // 3 second timeout
            if (lock == null) {
                Log.w(TAG, "⚠️ Failed to acquire read lock for file listing - timeout");
                return new ArrayList<>();
            }
            
            File packageDir = directoryManager.getPackageDirectory(packageName);
            if (!packageDir.exists() || !packageDir.isDirectory()) {
                Log.d(TAG, "📁 Package directory does not exist: " + packageDir.getAbsolutePath());
                return new ArrayList<>();
            }
            
            File[] files = packageDir.listFiles(File::isFile);
            List<FileMetadata> metadataList = new ArrayList<>();
            
            if (files != null) {
                Log.d(TAG, "📋 Found " + files.length + " files in package directory");
                for (File file : files) {
                    String mimeType = new MimeTypeRegistry().getMimeType(file.getName());
                    metadataList.add(new FileMetadata(
                        file.getName(),
                        file.getAbsolutePath(),
                        file.length(),
                        file.lastModified(),
                        mimeType,
                        packageName
                    ));
                }
            }
            
            operationLogger.logOperation("LIST", packageName, null, metadataList.size(), true);
            Log.d(TAG, "✅ File listing completed - " + metadataList.size() + " files");
            return metadataList;
        } catch (Exception e) {
            Log.e(TAG, "💥 Error listing files", e);
            return new ArrayList<>();
        } finally {
            if (lock != null) {
                Log.d(TAG, "🔓 Releasing read lock for file listing operation");
                lockManager.releaseReadLock(lock, packageName);
            }
        }
    }
    
    @Override
    public boolean fileExists(String packageName, String fileName) {
        return getFile(packageName, fileName) != null;
    }
    
    // PackageOperations implementation
    @Override
    public File getPackageDirectory(String packageName) {
        // Security validation
        if (!securityManager.validateOperation(packageName, null, "DIRECTORY")) {
            return null;
        }
        return directoryManager.getPackageDirectory(packageName);
    }
    
    @Override
    public boolean ensurePackageDirectoryExists(String packageName) {
        // Security validation
        if (!securityManager.validateOperation(packageName, null, "DIRECTORY")) {
            return false;
        }
        
        return directoryManager.ensurePackageDirectoryExists(packageName);
    }
    
    @Override
    public long getPackageSize(String packageName) {
        Log.d(TAG, "📊 getPackageSize() called - Package: " + packageName);
        
        // Security validation
        if (!securityManager.validateOperation(packageName, null, "SIZE")) {
            Log.w(TAG, "❌ Security validation failed for package size");
            return 0;
        }
        
        // Thread synchronization with timeout
        ReadWriteLock lock = null;
        try {
            Log.d(TAG, "🔐 Acquiring read lock for package size operation");
            lock = lockManager.acquireReadLock(packageName, 3000, "PACKAGE_SIZE"); // 3 second timeout
            if (lock == null) {
                Log.w(TAG, "⚠️ Failed to acquire read lock for package size - timeout");
                return 0;
            }
            
            File packageDir = directoryManager.getPackageDirectory(packageName);
            if (!packageDir.exists() || !packageDir.isDirectory()) {
                Log.d(TAG, "📁 Package directory does not exist: " + packageDir.getAbsolutePath());
                return 0;
            }
            
            File[] files = packageDir.listFiles(File::isFile);
            if (files == null) {
                Log.w(TAG, "⚠️ Failed to list files for package size calculation");
                return 0;
            }
            
            long totalSize = 0;
            for (File file : files) {
                totalSize += file.length();
            }
            
            Log.d(TAG, "✅ Package size calculated: " + totalSize + " bytes");
            return totalSize;
        } catch (Exception e) {
            Log.e(TAG, "💥 Error calculating package size", e);
            return 0;
        } finally {
            if (lock != null) {
                Log.d(TAG, "🔓 Releasing read lock for package size operation");
                lockManager.releaseReadLock(lock, packageName);
            }
        }
    }
    
    @Override
    public int cleanupOldFiles(String packageName, long maxAgeMs) {
        Log.d(TAG, "🧹 cleanupOldFiles() started - Package: " + packageName + ", MaxAge: " + maxAgeMs + "ms");
        
        // Calculate max age in hours for logging
        long maxAgeHours = maxAgeMs / (1000 * 60 * 60);
        Log.d(TAG, "📊 Max age in hours: " + maxAgeHours + " hours");
        
        // Security validation
        Log.d(TAG, "🔒 Performing security validation for cleanup operation");
        if (!securityManager.validateOperation(packageName, null, "CLEANUP")) {
            Log.e(TAG, "❌ Security validation failed for package: " + packageName);
            return 0;
        }
        Log.d(TAG, "✅ Security validation passed for package: " + packageName);
        
        // Acquire write lock with timeout
        ReadWriteLock lock = null;
        long lockStartTime = System.currentTimeMillis();
        Log.d(TAG, "🔐 Attempting to acquire write lock for package: " + packageName);
        
        long lockTimeoutMs = 5000; // 5 seconds timeout for cleanup
        try {
            String lockInfo = lockManager.getLockInfo(packageName);
            Log.d(TAG, "📋 Lock status before acquisition: " + lockInfo);
            
            int expiredLocksReleased = lockManager.releaseExpiredLocks(packageName);
            if (expiredLocksReleased > 0) {
                Log.w(TAG, "🧹 Released " + expiredLocksReleased + " expired locks before cleanup");
            }
            
            lock = lockManager.acquireWriteLock(packageName, lockTimeoutMs, "FILE_CLEANUP");
            long lockAcquisitionTime = System.currentTimeMillis() - lockStartTime;
            
            if (lock != null) {
                Log.d(TAG, "✅ Write lock acquired successfully in " + lockAcquisitionTime + "ms");
                if (lockAcquisitionTime > 1000) {
                    Log.w(TAG, "⚠️ Write lock acquisition took longer than expected: " + lockAcquisitionTime + "ms");
                }
            } else {
                Log.e(TAG, "❌ Failed to acquire write lock within " + lockTimeoutMs + "ms timeout");
                Log.d(TAG, "🏁 cleanupOldFiles() completed - Lock acquisition timeout");
                
                // Log all active lock holders for debugging
                Map<String, ?> allHolders = lockManager.getAllLockHolders();
                if (!allHolders.isEmpty()) {
                    Log.w(TAG, "🔍 Active lock holders across all packages:");
                    for (Map.Entry<String, ?> entry : allHolders.entrySet()) {
                        Log.w(TAG, "  " + entry.getKey() + " -> " + entry.getValue());
                    }
                }
                
                // Log detailed lock statistics
                String lockStats = lockManager.getLockStatistics(packageName);
                Log.w(TAG, "📊 Lock Statistics:\n" + lockStats);
                
                // Try emergency lock release for this specific package
                Log.w(TAG, "🚨 Attempting emergency lock release for package: " + packageName);
                int forceReleased = lockManager.forceReleaseAllLocks(packageName);
                if (forceReleased > 0) {
                    Log.w(TAG, "⚠️ Force released " + forceReleased + " locks for package: " + packageName);
                    Log.w(TAG, "⚠️ This may indicate a deadlock or stuck operation");
                    
                    // Log updated statistics after force release
                    String updatedStats = lockManager.getLockStatistics(packageName);
                    Log.w(TAG, "📊 Updated Lock Statistics:\n" + updatedStats);
                }
                
                return 0;
            }
        } catch (Exception e) {
            Log.e(TAG, "💥 Exception during write lock acquisition for package: " + packageName, e);
            Log.d(TAG, "🏁 cleanupOldFiles() completed - Lock acquisition exception");
            return 0;
        } finally {
            if (lock != null) {
                Log.d(TAG, "🔓 Releasing write lock for package: " + packageName);
                try {
                    lockManager.releaseWriteLock(lock, packageName);
                    Log.d(TAG, "✅ Write lock released successfully");
                } catch (Exception e) {
                    Log.e(TAG, "💥 Error releasing write lock for package: " + packageName, e);
                }
            } else {
                Log.w(TAG, "⚠️ Cannot release write lock - lock is null");
            }
        }
        
        // Proceed with cleanup under lock
        try {
            // Get package directory
            File packageDir = directoryManager.getPackageDirectory(packageName);
            if (!packageDir.exists() || !packageDir.isDirectory()) {
                Log.w(TAG, "⚠️ Package directory does not exist: " + packageDir.getAbsolutePath());
                return 0;
            }
            
            Log.d(TAG, "📁 Scanning directory: " + packageDir.getAbsolutePath());
            
            // Calculate cutoff time
            long cutoffTime = System.currentTimeMillis() - maxAgeMs;
            Log.d(TAG, "⏰ Cutoff time: " + new java.util.Date(cutoffTime));
            
            // Scan for old files
            File[] files = packageDir.listFiles();
            if (files == null) {
                Log.w(TAG, "⚠️ Cannot list files in directory: " + packageDir.getAbsolutePath());
                return 0;
            }
            
            int deletedCount = 0;
            long totalDeletedSize = 0;
            
            Log.d(TAG, "🔍 Scanning " + files.length + " files for cleanup...");
            
            for (File file : files) {
                if (file.isFile()) {
                    long lastModified = file.lastModified();
                    if (lastModified < cutoffTime) {
                        long fileSize = file.length();
                        Log.d(TAG, "🗑️ Deleting old file: " + file.getName() + " (last modified: " + new java.util.Date(lastModified) + ", size: " + fileSize + " bytes)");
                        
                        try {
                            if (file.delete()) {
                                deletedCount++;
                                totalDeletedSize += fileSize;
                                Log.d(TAG, "✅ Successfully deleted: " + file.getName());
                                
                                // Log the deletion
                                operationLogger.logFileOperation(packageName, file.getName(), "DELETE", "Old file cleanup", fileSize);
                            } else {
                                Log.w(TAG, "❌ Failed to delete file: " + file.getName());
                            }
                        } catch (Exception e) {
                            Log.e(TAG, "💥 Exception deleting file: " + file.getName(), e);
                        }
                    }
                }
            }
            
            Log.i(TAG, "✅ Cleanup completed: " + deletedCount + " files deleted, " + totalDeletedSize + " bytes freed");
            return deletedCount;
            
        } catch (Exception e) {
            Log.e(TAG, "💥 Exception during file cleanup for package: " + packageName, e);
            return 0;
        }
    }
    
    // StorageOperations implementation
    @Override
    public long getAvailableSpace() {
        return baseDirectory.getFreeSpace();
    }
    
    @Override
    public long getTotalSpace() {
        return baseDirectory.getTotalSpace();
    }

    @Override
    public File getDefaultMediaDirectory() {
        ensurePackageDirectoryExists(getDefaultPackageName());
        return getPackageDirectory(getDefaultPackageName());
    }

    @Override
    public FileOperationLogger getOperationLogger() {
        return operationLogger;
    }
    
    @Override
    public String getDefaultPackageName() {
        return "com.augmentos.asg_client.camera";
    }
} 