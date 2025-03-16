// src/services/api.service.ts
import axios from "axios";
import { TPA } from "@/types/tpa";
import { AppI } from "@augmentos/sdk";

// Set default config
axios.defaults.baseURL = import.meta.env.VITE_API_URL || "http://localhost:8002";
axios.defaults.withCredentials = true;
console.log("API URL", axios.defaults.baseURL);

// Helper function to wait a specified time
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to retry a function with exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>, 
  retries = 3, 
  initialDelay = 300,
  maxDelay = 2000
): Promise<T> {
  let currentDelay = initialDelay;
  
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries - 1) throw error;
      
      // Check if this is an auth error, and if auth token might not be ready
      if (axios.isAxiosError(error) && (error.response?.status === 401 || error.response?.status === 403)) {
        console.log(`Auth error on attempt ${i+1}, retrying after ${currentDelay}ms...`);
        await delay(currentDelay);
        currentDelay = Math.min(currentDelay * 2, maxDelay);
      } else {
        throw error;
      }
    }
  }
  
  throw new Error('Max retries reached');
}

// Extended TPA interface for API responses
export interface AppResponse extends AppI {
  createdAt: string;
  updatedAt: string;
}

// API key response
export interface ApiKeyResponse {
  apiKey: string;
  createdAt: string;
}

// Developer user interface
export interface DeveloperUser {
  id: string;
  email: string;
  name?: string;
  createdAt: string;
}

const api = {
  // Authentication endpoints
  auth: {
    me: async (): Promise<DeveloperUser> => {
      const response = await axios.get("/api/dev/auth/me");
      return response.data;
    },
  },

  // TPA management endpoints
  apps: {
    // Get all TPAs for the current developer
    getAll: async (): Promise<AppResponse[]> => {
      return retryWithBackoff(async () => {
        const response = await axios.get("/api/dev/apps");
        return response.data;
      });
    },

    // Get a specific TPA by package name
    getByPackageName: async (packageName: string): Promise<AppResponse> => {
      const response = await axios.get(`/api/dev/apps/${packageName}`);
      return response.data;
    },

    // Create a new TPA
    // create: async (tpaData: Omit<TPA, "id">): Promise<{ tpa: TPAResponse; apiKey: string }> => {
    create: async (tpaData: AppI): Promise<{ tpa: AppResponse; apiKey: string }> => {
      const response = await axios.post("/api/dev/apps/register", tpaData);
      return response.data;
    },

    // Update an existing TPA
    update: async (packageName: string, tpaData: Partial<TPA>): Promise<AppResponse> => {
      const response = await axios.put(`/api/dev/apps/${packageName}`, tpaData);
      return response.data;
    },

    // Delete a TPA
    delete: async (packageName: string): Promise<void> => {
      await axios.delete(`/api/dev/apps/${packageName}`);
    },

    // API key management
    apiKey: {
      // Generate a new API key for a TPA
      regenerate: async (packageName: string): Promise<ApiKeyResponse> => {
        const response = await axios.post(`/api/dev/apps/${packageName}/api-key`);
        return response.data;
      },
    },
  },

  // Installation sharing endpoints
  sharing: {
    // Get a shareable installation link for a TPA
    getInstallLink: async (packageName: string): Promise<string> => {
      const response = await axios.get(`/api/dev/apps/${packageName}/share`);
      return response.data.installUrl;
    },

    // Track that a TPA has been shared with a specific email
    trackSharing: async (packageName: string, emails: string[]): Promise<void> => {
      await axios.post(`/api/dev/apps/${packageName}/share`, { emails });
    },
  },
};

export default api;