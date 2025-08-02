package com.augmentos.asg_client.io.file.interfaces;

/**
 * Interface for package-level operations.
 * Follows Interface Segregation Principle by focusing only on package operations.
 */
public interface PackageOperations {
    
    /**
     * Get the total size of all files in a package
     * @param packageName The package name
     * @return Total size in bytes
     */
    long getPackageSize(String packageName);
    
    /**
     * Clean up old files in a package based on age
     * @param packageName The package name
     * @param maxAgeMs Maximum age in milliseconds
     * @return Number of files cleaned up
     */
    int cleanupOldFiles(String packageName, long maxAgeMs);
} 