/**
 * Simple Storage Routes for MentraOS Cloud
 * 
 * Provides key-value storage functionality for MentraOS Apps through REST API endpoints.
 * All routes are protected by SDK authentication middleware requiring valid package credentials.
 * 
 * Storage is organized by userId (email) and packageName, creating isolated storage spaces
 * for each App-user combination. Data is persisted in MongoDB using the SimpleStorage model.
 * 
 * @author MentraOS Team
 */

import { SimpleStorage } from '../models/simple-storage.model';
import { Router, Request, Response } from 'express';
import { sdkAuthMiddleware } from '../middleware/sdk.middleware';

const router = Router();

// Apply SDK authentication middleware to all routes
// This requires Authorization: Bearer <packageName>:<apiKey> header for all simple-storage endpoints
// The middleware validates the package name and API key before allowing access to storage operations
router.use(sdkAuthMiddleware);

/**
 * Placeholder function for future cloud storage synchronization
 * TODO: Implement cloud-to-cloud storage synchronization if needed
 * @returns {Promise<void>}
 */
async function fetchStorageFromCloud(): Promise<void> {
    // Reserved for future implementation of cross-cloud storage sync
}

// ================================================================================================
// CORE STORAGE OPERATIONS
// ================================================================================================

/**
 * Retrieves the complete storage object for a specific user and App package
 * 
 * @param {string} userId - User's email identifier
 * @param {string} packageName - App package name (e.g., "com.example.myapp")
 * @returns {Promise<object|null>} The complete simpleStorage object or null if not found
 * 
 * @description
 * Fetches the entire key-value storage for a specific user-package combination.
 * Returns the raw simpleStorage object containing all stored key-value pairs,
 * or null if no storage exists for this combination.
 */
async function getSimpleStorage(userId: string, packageName: string) {
    try {
        const storage = await SimpleStorage.findOne({
            email: userId,
            packageName: packageName
        });

        if (storage) {
            return storage.simpleStorage;
        } else {
            return null;
        }
    } catch (error) {
        console.error('Error getting SimpleStorage:', error);
        throw error;
    }
} 

/**
 * Retrieves a specific item from storage by key
 * 
 * @param {string} userId - User's email identifier
 * @param {string} packageName - App package name
 * @param {string} key - The storage key to retrieve
 * @returns {Promise<any|null>} The stored value or null if not found
 * 
 * @description
 * Fetches a single stored value by its key. Returns the exact value that was stored,
 * which could be a string, number, object, or any JSON-serializable type.
 * Returns null if the key doesn't exist or the storage doesn't exist.
 */
async function getItem(userId: string, packageName: string, key: string) {
    try {
        const storage = await SimpleStorage.findOne({
            email: userId,
            packageName: packageName
        });

        if (storage) {
            return storage.simpleStorage[key];
        } else {
            return null;
        }
    } catch (error) {
        console.error('Error getting item:', error);
        throw error;
    }
}

/**
 * Sets a single key-value pair in storage
 * 
 * @param {string} userId - User's email identifier
 * @param {string} packageName - App package name
 * @param {string} key - The storage key to set
 * @param {string} value - The value to store (will be JSON serialized)
 * @returns {Promise<void>}
 * 
 * @description
 * Stores or updates a single key-value pair in the user's storage.
 * Uses MongoDB's $set operation with dot notation to update only the specific key.
 * Creates the storage document if it doesn't exist (upsert: true).
 * The value can be any JSON-serializable data type.
 */
async function setItemSingle(userId: string, packageName: string, key: string, value: string) {
    try {
        await SimpleStorage.findOneAndUpdate(
            { email: userId, packageName },
            { $set: { [`simpleStorage.${key}`]: value } },
            { upsert: true, new: true }
        );
        console.log(`Single item set for ${userId}: ${key} = ${value}`);
    } catch (error) {
        console.error('Error setting single item:', error);
        throw error;
    }
}

/**
 * Deletes a specific key from storage
 * 
 * @param {string} userId - User's email identifier
 * @param {string} packageName - App package name
 * @param {string} key - The storage key to delete
 * @returns {Promise<boolean>} True if the storage document was found, false otherwise
 * 
 * @description
 * Removes a specific key-value pair from the user's storage using MongoDB's $unset operation.
 * Returns true if the storage document exists (regardless of whether the key existed),
 * false if the storage document doesn't exist at all.
 */
async function deleteItem(userId: string, packageName: string, key: string) {
    try {
        const result = await SimpleStorage.findOneAndUpdate(
            { email: userId, packageName },
            { $unset: { [`simpleStorage.${key}`]: 1 } },
            { new: true }
        );
        return !!result;
    } catch (error) {
        console.error('Error deleting item:', error);
        throw error;
    }
}

/**
 * Clears all stored data for a user-package combination
 * 
 * @param {string} userId - User's email identifier
 * @param {string} packageName - App package name
 * @returns {Promise<boolean>} True if the storage document was found and cleared
 * 
 * @description
 * Resets the entire simpleStorage object to an empty object, effectively
 * deleting all stored key-value pairs for this user-package combination.
 * The storage document itself remains in the database but with empty content.
 */
async function clearAllStorage(userId: string, packageName: string) {
    try {
        const result = await SimpleStorage.findOneAndUpdate(
            { email: userId, packageName },
            { $set: { simpleStorage: {} } },
            { new: true }
        );
        return !!result;
    } catch (error) {
        console.error('Error clearing storage:', error);
        throw error;
    }
}

/**
 * Retrieves all storage keys for a user-package combination
 * 
 * @param {string} userId - User's email identifier
 * @param {string} packageName - App package name
 * @returns {Promise<string[]>} Array of all storage keys, empty array if no storage exists
 * 
 * @description
 * Returns an array containing all the keys currently stored in the user's storage.
 * Useful for Apps that need to enumerate all stored items or implement their own
 * key management logic. Returns empty array if no storage exists.
 */
async function getKeys(userId: string, packageName: string) {
    try {
        const storage = await SimpleStorage.findOne({
            email: userId,
            packageName: packageName
        });

        if (storage) {
            return Object.keys(storage.simpleStorage);
        } else {
            return [];
        }
    } catch (error) {
        console.error('Error getting keys:', error);
        throw error;
    }
}

/**
 * Gets the number of stored items for a user-package combination
 * 
 * @param {string} userId - User's email identifier
 * @param {string} packageName - App package name
 * @returns {Promise<number>} Count of stored key-value pairs
 * 
 * @description
 * Returns the total number of key-value pairs stored for this user-package combination.
 * This is equivalent to the length of the keys array, but more efficient as it doesn't
 * need to return the actual keys. Returns 0 if no storage exists.
 */
async function getStorageSize(userId: string, packageName: string) {
    try {
        const storage = await SimpleStorage.findOne({
            email: userId,
            packageName: packageName
        });

        if (storage) {
            return Object.keys(storage.simpleStorage).length;
        } else {
            return 0;
        }
    } catch (error) {
        console.error('Error getting storage size:', error);
        throw error;
    }
}

/**
 * Checks if a specific key exists in storage
 * 
 * @param {string} userId - User's email identifier
 * @param {string} packageName - App package name
 * @param {string} key - The key to check for existence
 * @returns {Promise<boolean>} True if the key exists, false otherwise
 * 
 * @description
 * Determines whether a specific key exists in the user's storage without
 * retrieving the actual value. This is useful for conditional logic in Apps.
 * Returns false if the key doesn't exist OR if the storage doesn't exist.
 */
async function hasKey(userId: string, packageName: string, key: string) {
    try {
        const storage = await SimpleStorage.findOne({
            email: userId,
            packageName: packageName
        });

        if (storage) {
            return key in storage.simpleStorage;
        } else {
            return false;
        }
    } catch (error) {
        console.error('Error checking key:', error);
        throw error;
    }
}



// ================================================================================================
// REST API ENDPOINTS
// ================================================================================================

/**
 * GET /getSimpleStorage
 * Retrieves the complete storage object for a user-package combination
 * 
 * Query Parameters:
 * - userId: User's email identifier (required)
 * - packageName: App package name (required)
 * 
 * Responses:
 * - 200: Success with storage data
 * - 400: Missing required parameters
 * - 404: Storage not found
 * - 500: Internal server error
 */
router.get('/getSimpleStorage', async (req: Request, res: Response) => {
    try {
        const { userId, packageName } = req.query;
        
        // Validate required parameters
        if (!userId || !packageName) {
            return res.status(400).json({
                error: 'Missing required fields: userId, packageName'
            });
        }

        const storage = await getSimpleStorage(userId as string, packageName as string);
        
        if (storage) {
            res.status(200).json({
                success: true,
                data: storage
            });
        } else {
            res.status(404).json({
                success: false,
                message: 'Storage not found'
            });
        }
    } catch (error) {
        console.error('Router error:', error);
        res.status(500).json({
            error: 'Failed to get storage'
        });
    }
});

/**
 * GET /getItem
 * Retrieves a specific item from storage by key
 * 
 * Query Parameters:
 * - userId: User's email identifier (required)
 * - packageName: App package name (required)
 * - key: Storage key to retrieve (required)
 * 
 * Responses:
 * - 200: Success with item data
 * - 400: Missing required parameters
 * - 404: Item not found
 * - 500: Internal server error
 */
router.get('/getItem', async (req: Request, res: Response) => {
    try {
        const { userId, packageName, key } = req.query;
        
        // Validate required parameters
        if (!userId || !packageName || !key) {
            return res.status(400).json({
                error: 'Missing required fields: userId, packageName, key'
            });
        }

        const item = await getItem(userId as string, packageName as string, key as string);
        
        // Check for both null and undefined to handle different "not found" states
        if (item !== null && item !== undefined) {
            res.status(200).json({
                success: true,
                data: item
            });
        } else {
            res.status(404).json({
                success: false,
                message: 'Item not found'
            });
        }
    } catch (error) {
        console.error('Router error:', error);
        res.status(500).json({
            error: 'Failed to get item'
        });
    }
});

/**
 * POST /setItem
 * Sets a single key-value pair in storage
 * 
 * Request Body:
 * - userId: User's email identifier (required)
 * - packageName: App package name (required)
 * - key: Storage key to set (required)
 * - value: Value to store (required, can be any JSON-serializable type)
 * 
 * Responses:
 * - 200: Success
 * - 400: Missing required parameters
 * - 500: Internal server error
 */
router.post('/setItem', async (req: Request, res: Response) => {
    try {
        const { userId, packageName, key, value } = req.body;
        
        // Validate required parameters (note: value can be falsy but not undefined)
        if (!userId || !packageName || !key || value === undefined) {
            return res.status(400).json({
                error: 'Missing required fields: userId, packageName, key, value'
            });
        }

        await setItemSingle(userId, packageName, key, value);
        
        res.status(200).json({
            success: true,
            message: `Item ${key} set successfully`
        });
    } catch (error) {
        console.error('Router error:', error);
        res.status(500).json({
            error: 'Failed to set item'
        });
    }
});

/**
 * DELETE /deleteItem
 * Deletes a specific key from storage
 * 
 * Request Body:
 * - userId: User's email identifier (required)
 * - packageName: App package name (required)
 * - key: Storage key to delete (required)
 * 
 * Responses:
 * - 200: Success (key deleted)
 * - 400: Missing required parameters
 * - 404: Storage not found
 * - 500: Internal server error
 */
router.delete('/deleteItem', async (req: Request, res: Response) => {
    try {
        const { userId, packageName, key } = req.body;
        
        // Validate required parameters
        if (!userId || !packageName || !key) {
            return res.status(400).json({
                error: 'Missing required fields: userId, packageName, key'
            });
        }

        const deleted = await deleteItem(userId, packageName, key);
        
        if (deleted) {
            res.status(200).json({
                success: true,
                message: `Item ${key} deleted successfully`
            });
        } else {
            res.status(404).json({
                success: false,
                message: 'Storage not found'
            });
        }
    } catch (error) {
        console.error('Router error:', error);
        res.status(500).json({
            error: 'Failed to delete item'
        });
    }
});

/**
 * DELETE /clear
 * Clears all stored data for a user-package combination
 * 
 * Request Body:
 * - userId: User's email identifier (required)
 * - packageName: App package name (required)
 * 
 * Responses:
 * - 200: Success (storage cleared)
 * - 400: Missing required parameters
 * - 404: Storage not found
 * - 500: Internal server error
 */
router.delete('/clear', async (req: Request, res: Response) => {
    try {
        const { userId, packageName } = req.body;
        
        // Validate required parameters
        if (!userId || !packageName) {
            return res.status(400).json({
                error: 'Missing required fields: userId, packageName'
            });
        }

        const cleared = await clearAllStorage(userId, packageName);
        
        if (cleared) {
            res.status(200).json({
                success: true,
                message: 'Storage cleared successfully'
            });
        } else {
            res.status(404).json({
                success: false,
                message: 'Storage not found'
            });
        }
    } catch (error) {
        console.error('Router error:', error);
        res.status(500).json({
            error: 'Failed to clear storage'
        });
    }
});

/**
 * GET /keys
 * Retrieves all storage keys for a user-package combination
 * 
 * Query Parameters:
 * - userId: User's email identifier (required)
 * - packageName: App package name (required)
 * 
 * Responses:
 * - 200: Success with array of keys (empty array if no storage)
 * - 400: Missing required parameters
 * - 500: Internal server error
 */
router.get('/keys', async (req: Request, res: Response) => {
    try {
        const { userId, packageName } = req.query;
        
        // Validate required parameters
        if (!userId || !packageName) {
            return res.status(400).json({
                error: 'Missing required fields: userId, packageName'
            });
        }

        const keys = await getKeys(userId as string, packageName as string);
        
        res.status(200).json({
            success: true,
            data: keys
        });
    } catch (error) {
        console.error('Router error:', error);
        res.status(500).json({
            error: 'Failed to get keys'
        });
    }
});

/**
 * GET /size
 * Gets the number of stored items for a user-package combination
 * 
 * Query Parameters:
 * - userId: User's email identifier (required)
 * - packageName: App package name (required)
 * 
 * Responses:
 * - 200: Success with size count (0 if no storage)
 * - 400: Missing required parameters
 * - 500: Internal server error
 */
router.get('/size', async (req: Request, res: Response) => {
    try {
        const { userId, packageName } = req.query;
        
        // Validate required parameters
        if (!userId || !packageName) {
            return res.status(400).json({
                error: 'Missing required fields: userId, packageName'
            });
        }

        const size = await getStorageSize(userId as string, packageName as string);
        
        res.status(200).json({
            success: true,
            data: { size }
        });
    } catch (error) {
        console.error('Router error:', error);
        res.status(500).json({
            error: 'Failed to get storage size'
        });
    }
});

/**
 * GET /hasKey
 * Checks if a specific key exists in storage
 * 
 * Query Parameters:
 * - userId: User's email identifier (required)
 * - packageName: App package name (required)
 * - key: Key to check for existence (required)
 * 
 * Responses:
 * - 200: Success with exists boolean (false if storage doesn't exist)
 * - 400: Missing required parameters
 * - 500: Internal server error
 */
router.get('/hasKey', async (req: Request, res: Response) => {
    try {
        const { userId, packageName, key } = req.query;
        
        // Validate required parameters
        if (!userId || !packageName || !key) {
            return res.status(400).json({
                error: 'Missing required fields: userId, packageName, key'
            });
        }

        const exists = await hasKey(userId as string, packageName as string, key as string);
        
        res.status(200).json({
            success: true,
            data: { exists }
        });
    } catch (error) {
        console.error('Router error:', error);
        res.status(500).json({
            error: 'Failed to check key'
        });
    }
});

export default router;
