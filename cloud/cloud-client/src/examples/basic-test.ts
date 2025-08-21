/**
 * Basic usage example for the AugmentOS Cloud Client
 */

import { MentraClient } from "../MentraClient";
import { resolve } from "path";
import { AccountService } from "../services/AccountService";

async function basicTest() {
  const client = new MentraClient({
    email: "test@example.com",
    serverUrl: process.env.DEFAULT_SERVER_URL || "ws://localhost:8002",
    debug: {
      logLevel: "debug",
      saveMetrics: true,
      logWebSocketMessages: true,
    },
  });

  try {
    console.log("🔗 Connecting to AugmentOS cloud...");
    await client.connect();
    console.log("✅ Connected successfully!");

    // Listen for events
    client.on("display_event", (display) => {
      console.log("📱 Display update:", display.layout);
    });

    client.on("app_state_change", (state) => {
      console.log("📦 App state change:", {
        running: state.userSession.activeAppSessions,
        loading: state.userSession.loadingApps,
      });
    });

    // Test app lifecycle
    console.log("🚀 Starting translator app...");
    await client.startApp("com.augmentos.translator");
    console.log("✅ App started");

    // Test head position
    console.log("👀 Looking up (dashboard view)...");
    client.lookUp();
    await new Promise((resolve) => setTimeout(resolve, 1000));

    console.log("👀 Looking down (main view)...");
    client.lookDown();
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Test VAD signal
    console.log("🎤 Sending VAD signal...");
    client.startSpeaking();
    await new Promise((resolve) => setTimeout(resolve, 2000));
    client.stopSpeaking();

    // Test location update
    console.log("📍 Updating location...");
    client.updateLocation(37.7749, -122.4194); // San Francisco

    // Wait a bit
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Stop app
    console.log("🛑 Stopping translator app...");
    await client.stopApp("com.augmentos.translator");

    console.log("📱 Current visible content:", client.getVisibleContent());
    console.log("🏃 Running apps:", client.getRunningApps());
  } catch (error) {
    console.error("❌ Test failed:", error);
  } finally {
    console.log("🔌 Disconnecting...");
    await client.disconnect();
    console.log("✅ Disconnected");
  }
}

// Run the test if this file is executed directly
basicTest().catch(console.error);
