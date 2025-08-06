package com.augmentos.asg_client.io.file.core;

import com.augmentos.asg_client.logging.Logger;
import com.augmentos.asg_client.io.file.interfaces.FileOperations;
import com.augmentos.asg_client.io.file.interfaces.FileMetadataOperations;
import com.augmentos.asg_client.io.file.interfaces.PackageOperations;
import com.augmentos.asg_client.io.file.interfaces.StorageOperations;
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
            lockManager.releaseWriteLock(lock);
        }
    }
    
    @Override
    public File getFile(String packageName, String fileName) {
        // Security validation
        if (!securityManager.validateOperation(packageName, fileName, "GET")) {
            return null;
        }
        
        // Thread synchronization
        ReadWriteLock lock = lockManager.acquireReadLock(packageName);
        try {
            return operationsManager.getFile(packageName, fileName);
        } finally {
            lockManager.releaseReadLock(lock);
        }
    }
    
    @Override
    public FileOperationResult deleteFile(String packageName, String fileName) {
        // Security validation
        if (!securityManager.validateOperation(packageName, fileName, "DELETE")) {
            return FileOperationResult.error("Security validation failed");
        }
        
        // Thread synchronization
        ReadWriteLock lock = lockManager.acquireWriteLock(packageName);
        try {
            return operationsManager.deleteFile(packageName, fileName);
        } finally {
            lockManager.releaseWriteLock(lock);
        }
    }
    
    @Override
    public FileOperationResult updateFile(String packageName, String fileName, InputStream inputStream, String mimeType) {
        // Security validation
        if (!securityManager.validateOperation(packageName, fileName, "UPDATE")) {
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
            lockManager.releaseWriteLock(lock);
        }
    }
    
    // FileMetadataOperations implementation
    @Override
    public FileMetadata getFileMetadata(String packageName, String fileName) {
        File file = getFile(packageName, fileName);
        if (file == null) {
            return null;
        }
        
        String mimeType = new MimeTypeRegistry().getMimeType(fileName);
        return new FileMetadata(
            file.getName(),
            file.getAbsolutePath(),
            file.length(),
            file.lastModified(),
            mimeType,
            packageName
        );
    }
    
    @Override
    public List<FileMetadata> listFiles(String packageName) {
        // Security validation
        if (!securityManager.validateOperation(packageName, null, "LIST")) {
            return new ArrayList<>();
        }
        
        // Thread synchronization
        ReadWriteLock lock = lockManager.acquireReadLock(packageName);
        try {
            File packageDir = directoryManager.getPackageDirectory(packageName);
            if (!packageDir.exists() || !packageDir.isDirectory()) {
                return new ArrayList<>();
            }
            
            File[] files = packageDir.listFiles(File::isFile);
            List<FileMetadata> metadataList = new ArrayList<>();
            
            if (files != null) {
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
            return metadataList;
        } finally {
            lockManager.releaseReadLock(lock);
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
        // Security validation
        if (!securityManager.validateOperation(packageName, null, "SIZE")) {
            return 0;
        }
        
        // Thread synchronization
        ReadWriteLock lock = lockManager.acquireReadLock(packageName);
        try {
            File packageDir = directoryManager.getPackageDirectory(packageName);
            if (!packageDir.exists() || !packageDir.isDirectory()) {
                return 0;
            }
            
            File[] files = packageDir.listFiles(File::isFile);
            if (files == null) {
                return 0;
            }
            
            long totalSize = 0;
            for (File file : files) {
                totalSize += file.length();
            }
            
            return totalSize;
        } finally {
            lockManager.releaseReadLock(lock);
        }
    }
    
    @Override
    public int cleanupOldFiles(String packageName, long maxAgeMs) {
        // Security validation
        if (!securityManager.validateOperation(packageName, null, "CLEANUP")) {
            return 0;
        }
        
        // Thread synchronization
        ReadWriteLock lock = lockManager.acquireWriteLock(packageName);
        try {
            File packageDir = directoryManager.getPackageDirectory(packageName);
            if (!packageDir.exists() || !packageDir.isDirectory()) {
                return 0;
            }
            
            File[] files = packageDir.listFiles(File::isFile);
            if (files == null) {
                return 0;
            }
            
            long currentTime = System.currentTimeMillis();
            int cleanedCount = 0;
            
            for (File file : files) {
                if (currentTime - file.lastModified() > maxAgeMs) {
                    if (file.delete()) {
                        cleanedCount++;
                        operationLogger.logOperation("CLEANUP", packageName, file.getName(), file.length(), true);
                    }
                }
            }
            
            return cleanedCount;
        } finally {
            lockManager.releaseWriteLock(lock);
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
    public FileOperationLogger getOperationLogger() {
        return operationLogger;
    }
    
    @Override
    public String getDefaultPackageName() {
        return "com.augmentos.asg_client.camera";
    }
} 