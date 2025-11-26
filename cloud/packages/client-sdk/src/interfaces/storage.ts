export interface IStorage {
    /**
     * Get a value from storage.
     */
    getItem(key: string): Promise<string | null>;

    /**
     * Set a value in storage.
     */
    setItem(key: string, value: string): Promise<void>;

    /**
     * Remove a value from storage.
     */
    removeItem(key: string): Promise<void>;

    /**
     * Clear all storage.
     */
    clear(): Promise<void>;
}
