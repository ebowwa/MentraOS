import path from 'path';
import { TpaServer, TpaSession } from '@augmentos/sdk';
import axios from 'axios';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 80;
const CLOUD_HOST_NAME = process.env.CLOUD_HOST_NAME || "cloud";
const PACKAGE_NAME = "cloud.augmentos.aughog";
const API_KEY = 'test_key'; // In production, this would be securely stored
const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY || 'your_posthog_api_key';
const POSTHOG_HOST = process.env.POSTHOG_HOST || 'https://app.posthog.com';

// Define types for PostHog data
interface PostHogUser {
  id: string;
  created_at: string;
  distinct_ids: string[];
  properties: Record<string, any>;
}

// Keep track of the latest users
let latestUsers: PostHogUser[] = [];
let lastCheckedTime = Date.now();

async function fetchLatestUsers(): Promise<PostHogUser[]> {
  try {
    // Try to fetch from PostHog if API key is provided
    if (POSTHOG_API_KEY !== 'your_posthog_api_key') {
      const response = await axios.get(`${POSTHOG_HOST}/api/projects/@current/persons/`, {
        headers: {
          'Authorization': `Bearer ${POSTHOG_API_KEY}`
        },
        params: {
          limit: 10,
          order: '-created_at'
        }
      });
      
      latestUsers = response.data.results;
      lastCheckedTime = Date.now();
      return latestUsers;
    } else {
      // Use mock data if no API key is provided
      console.log('Using mock PostHog data (no valid API key provided)');
      
      // Generate mock data with timestamps within the last 24 hours
      const mockUsers: PostHogUser[] = Array.from({ length: 5 }, (_, i) => {
        // Random time within the last 24 hours
        const hoursAgo = Math.floor(Math.random() * 24);
        const minutesAgo = Math.floor(Math.random() * 60);
        const createdTime = new Date();
        createdTime.setHours(createdTime.getHours() - hoursAgo);
        createdTime.setMinutes(createdTime.getMinutes() - minutesAgo);
        
        return {
          id: `user-${i + 1}`,
          created_at: createdTime.toISOString(),
          distinct_ids: [`mock-id-${i + 1}`],
          properties: {
            $os_name: ['iOS', 'Android', 'Windows', 'macOS', 'Linux'][Math.floor(Math.random() * 5)],
            $browser: ['Chrome', 'Safari', 'Firefox', 'Edge'][Math.floor(Math.random() * 4)]
          }
        };
      });
      
      latestUsers = mockUsers;
      lastCheckedTime = Date.now();
      return mockUsers;
    }
  } catch (error) {
    console.error('Error fetching PostHog data:', error);
    
    // Fallback to mock data if fetch fails
    console.log('Falling back to mock data');
    const mockUsers: PostHogUser[] = Array.from({ length: 3 }, (_, i) => {
      const minutesAgo = Math.floor(Math.random() * 120);
      const createdTime = new Date(Date.now() - minutesAgo * 60000);
      
      return {
        id: `fallback-user-${i + 1}`,
        created_at: createdTime.toISOString(),
        distinct_ids: [`fallback-id-${i + 1}`],
        properties: {
          $os_name: ['iOS', 'Android', 'Web'][i % 3],
          $browser: ['Mobile App', 'Chrome', 'Safari'][i % 3]
        }
      };
    });
    
    latestUsers = mockUsers;
    return mockUsers;
  }
}

// Update data every 60 seconds
setInterval(fetchLatestUsers, 60000);

class PostHogViewerServer extends TpaServer {
  protected async onSession(session: TpaSession, sessionId: string, userId: string): Promise<void> {
    // Initial data fetch if we haven't already
    if (latestUsers.length === 0) {
      await fetchLatestUsers();
    }
    
    // Handle connection events
    session.events.onConnected(async (settings) => {
      console.log(`\n[User ${userId}] connected to PostHog Viewer\n`);
      session.layouts.showReferenceCard("PostHog Viewer", "Connected to PostHog Viewer", { durationMs: 2000 });
      
      // Show initial data
      this.showLatestUserInfo(session);
    });
    
    // Handle voice commands
    session.events.onTranscription((data) => {
      if (!data.isFinal) return;
      
      const command = data.text.toLowerCase();
      
      if (command.includes("refresh") || command.includes("update")) {
        fetchLatestUsers().then(() => {
          this.showLatestUserInfo(session);
          session.layouts.showReferenceCard("PostHog", "Data refreshed", { durationMs: 1500 });
        });
      } else if (command.includes("show users") || command.includes("latest users")) {
        this.showLatestUserInfo(session);
      }
      
      // Log transcription
      console.log(`[User ${userId}]: ${data.text}`);
    });

    // Handle head position for scrolling through users
    let currentUserIndex = 0;
    session.events.onHeadPosition((data) => {
      // Convert position to string for comparison
      const position = String(data.position).toLowerCase();
      
      // Use head position to navigate through users
      if (position === 'left' && currentUserIndex > 0) {
        currentUserIndex--;
        this.showUserAtIndex(session, currentUserIndex);
      } else if (position === 'right' && currentUserIndex < latestUsers.length - 1) {
        currentUserIndex++;
        this.showUserAtIndex(session, currentUserIndex);
      }
      
      console.log(`[User ${userId}] Head Position: ${data.position}`);
    });

    // Handle errors
    session.events.onError((error) => {
      console.error(`[User ${userId}] Error:`, error);
    });
  }
  
  private showLatestUserInfo(session: TpaSession) {
    if (latestUsers.length > 0) {
      this.showUserAtIndex(session, 0);
    } else {
      session.layouts.showReferenceCard("PostHog", "No users found", { durationMs: 3000 });
    }
  }
  
  private showUserAtIndex(session: TpaSession, index: number) {
    const user = latestUsers[index];
    if (!user) return;
    
    const firstSeenTime = new Date(user.created_at);
    const minutesAgo = Math.floor((Date.now() - firstSeenTime.getTime()) / (1000 * 60));
    
    const userIdDisplay = user.distinct_ids && user.distinct_ids[0] ? 
      user.distinct_ids[0].substring(0, 15) : 'Unknown';
    
    const userProperties = user.properties || {};
    const deviceInfo = userProperties.$os_name || userProperties.$browser || 'Unknown Device';
    
    session.layouts.showReferenceCard(
      `User ${index + 1}/${latestUsers.length}`,
      `ID: ${userIdDisplay}\nFirst seen: ${minutesAgo} mins ago\nDevice: ${deviceInfo}`,
      { durationMs: 5000 }
    );
  }
}

// Create and start the server
const server = new PostHogViewerServer({
  packageName: PACKAGE_NAME,
  apiKey: API_KEY,
  port: PORT,
  augmentOSWebsocketUrl: `ws://${CLOUD_HOST_NAME}/tpa-ws`,
  webhookPath: '/webhook',
  publicDir: path.join(__dirname, './public')
});

// Initialize data and start server
fetchLatestUsers().then(() => {
  server.start().catch(console.error);
});