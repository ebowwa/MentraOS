/**
 * Test actual connection to AugmentOS cloud using generated core token
 */

import { MentraClient, AccountService } from "../index";
import dotenv from "dotenv";
dotenv.config();

async function testConnection() {
  console.log("🔗 Testing connection to AugmentOS cloud...\n");

  try {
    // Get default test account
    const credentials = AccountService.getDefaultTestAccount();
    console.log(`📧 Using account: ${credentials.email}`);
    console.log(`🔑 Token: ${credentials.coreToken.substring(0, 30)}...\n`);

    // Create client with pre-generated token
    const client = new MentraClient({
      email: credentials.email,
      serverUrl: process.env.DEFAULT_SERVER_URL || "ws://localhost:8002",
      coreToken: credentials.coreToken,
      debug: {
        logLevel: "debug",
        saveMetrics: true,
        logWebSocketMessages: true,
      },
    });

    // Set up event listeners
    client.on("connection_ack", (ack) => {
      console.log("✅ Connection acknowledged!");
      console.log(`   Session ID: ${ack.sessionId}`);
      console.log(
        `   User Session: ${JSON.stringify(ack.userSession, null, 2)}`,
      );
    });

    client.on("error", (error) => {
      console.error("❌ Client error:", error);
    });

    client.on("display_event", (display) => {
      console.log("📱 Display event:", display);
    });

    // Test the connection
    console.log("🔌 Connecting...");
    await client.connect();
    console.log("✅ Connected successfully!\n");

    // Test basic functionality
    console.log("🧪 Testing basic functionality...");

    // Send VAD signal
    console.log("🎤 Sending VAD signal...");
    client.startSpeaking();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    client.stopSpeaking();
    console.log("✅ VAD test complete");

    // Test head position
    console.log("👀 Testing head position...");
    client.lookUp();
    await new Promise((resolve) => setTimeout(resolve, 500));
    client.lookDown();
    console.log("✅ Head position test complete");

    // Test location
    console.log("📍 Testing location...");
    client.updateLocation(37.7749, -122.4194); // San Francisco
    console.log("✅ Location test complete");

    // Wait a bit to see any responses
    console.log("\n⏳ Waiting for server responses...");
    await new Promise((resolve) => setTimeout(resolve, 3000));

    console.log("\n🎉 All tests completed successfully!");
  } catch (error) {
    console.error("❌ Connection test failed:", error);
  } finally {
    console.log("\n🔌 Disconnecting...");
    // Note: We'll add proper cleanup here
    process.exit(0);
  }
}

// Run the test if this file is executed directly
//if (import.meta.url === `file://${process.argv[1]}`) {
testConnection().catch(console.error);
//}

export { testConnection };
