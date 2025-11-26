export interface IStorage {
    /**
     * Save a value to storage
     * @param key Storage key
     * @param value Value to store (string)
     */
    setItem(key: string, value: string): Promise<void>;

    /**
     * Retrieve a value from storage
     * @param key Storage key
     * @returns The value or null if not found
     */
    getItem(key: string): Promise<string | null>;

    /**
     * Remove a value from storage
     * @param key Storage key
     */
    removeItem(key: string): Promise<void>;

    /**
     * Clear all stored values
     */
    clear(): Promise<void>;
}
