package com.augmentos.asg_client.io.file.managers;

import com.augmentos.asg_client.logging.Logger;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReadWriteLock;
import java.util.concurrent.locks.ReentrantReadWriteLock;

/**
 * Manages thread synchronization for file operations.
 * Follows Single Responsibility Principle by handling only lock management.
 */
public class FileLockManager {
    
    private static final String TAG = "FileLockManager";
    
    private final ConcurrentHashMap<String, ReadWriteLock> packageLocks;
    private final Logger logger;
    
    public FileLockManager(Logger logger) {
        this.packageLocks = new ConcurrentHashMap<>();
        this.logger = logger;
    }
    
    /**
     * Get a read-write lock for a specific package
     * @param packageName The package name
     * @return ReadWriteLock for the package
     */
    public ReadWriteLock getPackageLock(String packageName) {
        return packageLocks.computeIfAbsent(packageName, k -> {
            logger.debug(TAG, "Created new lock for package: " + packageName);
            return new ReentrantReadWriteLock();
        });
    }
    
    /**
     * Acquire read lock for a package
     * @param packageName The package name
     * @return The acquired lock
     */
    public ReadWriteLock acquireReadLock(String packageName) {
        ReadWriteLock lock = getPackageLock(packageName);
        lock.readLock().lock();
        logger.debug(TAG, "Acquired read lock for package: " + packageName);
        return lock;
    }
    
    /**
     * Acquire write lock for a package
     * @param packageName The package name
     * @return The acquired lock
     */
    public ReadWriteLock acquireWriteLock(String packageName) {
        ReadWriteLock lock = getPackageLock(packageName);
        lock.writeLock().lock();
        logger.debug(TAG, "Acquired write lock for package: " + packageName);
        return lock;
    }
    
    /**
     * Release read lock
     * @param lock The lock to release
     */
    public void releaseReadLock(ReadWriteLock lock) {
        if (lock != null && lock.readLock().tryLock()) {
            lock.readLock().unlock();
            logger.debug(TAG, "Released read lock");
        }
    }
    
    /**
     * Release write lock
     * @param lock The lock to release
     */
    public void releaseWriteLock(ReadWriteLock lock) {
        if (lock != null && lock.writeLock().tryLock()) {
            lock.writeLock().unlock();
            logger.debug(TAG, "Released write lock");
        }
    }
    
    /**
     * Get the number of active locks
     * @return Number of package locks
     */
    public int getActiveLockCount() {
        return packageLocks.size();
    }
    
    /**
     * Clear all locks (useful for testing)
     */
    public void clearLocks() {
        packageLocks.clear();
        logger.info(TAG, "All package locks cleared");
    }
} 