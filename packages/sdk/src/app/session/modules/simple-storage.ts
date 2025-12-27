/**
 * Simple Storage SDK Module for MentraOS Apps
 * Provides localStorage-like API with cloud synchronization
 */

import { AppSession } from "..";

/**
 * Response types for Simple Storage API
 */
interface StorageResponse {
  success: boolean;
  data?: Record<string, string>;
}

interface StorageOperationResponse {
  success: boolean;
}

/**
 * Key-value storage with local caching and cloud sync
 * Data is isolated by userId and packageName
 */
export class SimpleStorage {
  private storage: Record<string, string> | null = null;
  private appSession: AppSession;
  private userId: string;
  private packageName: string;
  private baseUrl: string;

  constructor(appSession: AppSession) {
    this.appSession = appSession;
    this.userId = appSession.userId;
    this.packageName = appSession.getPackageName();
    this.baseUrl = this.getBaseUrl();
  }

  // Convert WebSocket URL to HTTP for API calls
  private getBaseUrl(): string {
    const serverUrl = this.appSession.getServerUrl();
    if (!serverUrl) return "http://localhost:8002";
    return serverUrl.replace(/\/app-ws$/, "").replace(/^ws/, "http");
  }

  // Generate auth headers for API requests
  private getAuthHeaders() {
    const apiKey = (this.appSession as any).config?.apiKey || "unknown-api-key";
    return {
      Authorization: `Bearer ${this.packageName}:${apiKey}`,
      "Content-Type": "application/json",
    };
  }

  // Fetch all data from cloud and cache locally
  private async fetchStorageFromCloud(): Promise<void> {
    try {
      const response = await fetch(
        `${this.baseUrl}/api/sdk/simple-storage/${encodeURIComponent(
          this.userId,
        )}`,
        {
          headers: this.getAuthHeaders(),
        },
      );

      if (response.ok) {
        const result = (await response.json()) as StorageResponse;
        if (result.success && result.data) {
          this.storage = result.data;
        } else {
          this.storage = {};
        }
      } else {
        console.error(
          "Failed to fetch storage from cloud:",
          await response.text(),
        );
        this.storage = {};
      }
    } catch (error) {
      console.error("Error fetching storage from cloud:", error);
      this.storage = {};
    }
  }

  // Get item from cache or cloud
  public async get(key: string): Promise<string | undefined> {
    try {
      if (this.storage !== null && this.storage !== undefined) {
        return this.storage[key];
      }

      await this.fetchStorageFromCloud();
      return this.storage?.[key];
    } catch (error) {
      console.error("Error getting item:", error);
      return undefined;
    }
  }

  // Set item with optimistic update and cloud sync
  public async set(key: string, value: string): Promise<void> {
    try {
      if (this.storage === null || this.storage === undefined) {
        await this.fetchStorageFromCloud();
      }

      // Update cache immediately (optimistic update)
      if (this.storage) {
        this.storage[key] = value;
      }

      // Sync to cloud
      const response = await fetch(
        `${this.baseUrl}/api/sdk/simple-storage/${encodeURIComponent(
          this.userId,
        )}/${encodeURIComponent(key)}`,
        {
          method: "PUT",
          headers: this.getAuthHeaders(),
          body: JSON.stringify({ value }),
        },
      );

      if (!response.ok) {
        console.error("Failed to sync item to cloud:", await response.text());
      }
    } catch (error) {
      console.error("Error setting item:", error);
      throw error;
    }
  }

  // Delete item from cache and cloud
  public async delete(key: string): Promise<boolean> {
    try {
      if (this.storage === null || this.storage === undefined) {
        await this.fetchStorageFromCloud();
      }

      // Remove from cache
      if (this.storage) {
        delete this.storage[key];
      }

      // Sync to cloud
      const response = await fetch(
        `${this.baseUrl}/api/sdk/simple-storage/${encodeURIComponent(
          this.userId,
        )}/${encodeURIComponent(key)}`,
        {
          method: "DELETE",
          headers: this.getAuthHeaders(),
        },
      );

      if (response.ok) {
        const result = (await response.json()) as StorageOperationResponse;
        return result.success;
      } else {
        console.error(
          "Failed to delete item from cloud:",
          await response.text(),
        );
        return false;
      }
    } catch (error) {
      console.error("Error deleting item:", error);
      return false;
    }
  }

  // Clear all data from cache and cloud
  public async clear(): Promise<boolean> {
    try {
      this.storage = {};

      const response = await fetch(
        `${this.baseUrl}/api/sdk/simple-storage/${encodeURIComponent(
          this.userId,
        )}`,
        {
          method: "DELETE",
          headers: this.getAuthHeaders(),
        },
      );

      if (response.ok) {
        const result = (await response.json()) as StorageOperationResponse;
        return result.success;
      } else {
        console.error(
          "Failed to clear storage from cloud:",
          await response.text(),
        );
        return false;
      }
    } catch (error) {
      console.error("Error clearing storage:", error);
      return false;
    }
  }

  // Get all storage keys
  public async keys(): Promise<string[]> {
    try {
      if (this.storage === null || this.storage === undefined) {
        await this.fetchStorageFromCloud();
      }
      return Object.keys(this.storage || {});
    } catch (error) {
      console.error("Error getting keys:", error);
      return [];
    }
  }

  // Get number of stored items
  public async size(): Promise<number> {
    try {
      if (this.storage === null || this.storage === undefined) {
        await this.fetchStorageFromCloud();
      }
      return Object.keys(this.storage || {}).length;
    } catch (error) {
      console.error("Error getting storage size:", error);
      return 0;
    }
  }

  // Check if key exists
  public async hasKey(key: string): Promise<boolean> {
    try {
      if (this.storage === null || this.storage === undefined) {
        await this.fetchStorageFromCloud();
      }
      return key in (this.storage || {});
    } catch (error) {
      console.error("Error checking key:", error);
      return false;
    }
  }

  // Get copy of all stored data
  public async getAllData(): Promise<Record<string, string>> {
    try {
      if (this.storage === null || this.storage === undefined) {
        await this.fetchStorageFromCloud();
      }
      return { ...(this.storage || {}) };
    } catch (error) {
      console.error("Error getting all data:", error);
      return {};
    }
  }

  // Set multiple items at once
  public async setMultiple(data: Record<string, string>): Promise<void> {
    try {
      if (this.storage === null || this.storage === undefined) {
        await this.fetchStorageFromCloud();
      }

      // Update cache
      if (this.storage) {
        Object.assign(this.storage, data);
      }

      // Bulk upsert to cloud
      const response = await fetch(
        `${this.baseUrl}/api/sdk/simple-storage/${encodeURIComponent(
          this.userId,
        )}`,
        {
          method: "PUT",
          headers: this.getAuthHeaders(),
          body: JSON.stringify({ data }),
        },
      );

      if (!response.ok) {
        console.error(
          "Failed to upsert multiple items to cloud:",
          await response.text(),
        );
      }
    } catch (error) {
      console.error("Error setting multiple items:", error);
      throw error;
    }
  }
}
