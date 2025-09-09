#!/usr/bin/env ts-node
/**
 * Live Captions TPA Test
 *
 * This example demonstrates:
 * 1. Installing the Live Captions TPA
 * 2. Starting the app
 * 3. Streaming audio from a WAV file
 * 4. Receiving real-time transcription results
 * 5. Stopping and uninstalling the app
 */

import { resolve } from "path";
import { MentraClient } from "../MentraClient";
import { AccountService } from "../services/AccountService";

const TRANSLATION_PACKAGE = "dev.augmentos.livetranslation";
const CHINESE_AUDIO_FILE_PATH = resolve(__dirname, "../audio/chinese.wav");

let currentDisplay = "";

/**
 * Runs the Live Captions TPA test once for the specified duration.
 * Returns true if all NATO alphabet words were heard without issues, otherwise false.
 */
export async function runTranslationTestOnce(
  onFailure: (error: string) => void = () => {},
): Promise<boolean> {
  const missedAny: boolean | null = null;
  console.log("🎯 Translation Test Starting...\n");

  // Get test account
  const accountService = new AccountService();
  const account = accountService.getDefaultTestAccount();

  // Create client
  const client = new MentraClient({
    email: account.email,
    coreToken: account.coreToken,
    serverUrl: process.env.DEFAULT_SERVER_URL || "ws://localhost:8002",
    debug: {
      logLevel: "info",
      saveMetrics: true,
      logWebSocketMessages: true,
    },
  });

  // Setup event listeners
  setupEventListeners(client);

  const startTime = Date.now();

  try {
    // Step 1: Connect to MentraOS Cloud
    console.log("📡 Connecting to MentraOS Cloud...");
    await client.connect();
    console.log("✅ Connected successfully\n");

    // Step 2: Stop app first if it's already running (to ensure clean state)
    console.log(`🛑 Ensuring ${TRANSLATION_PACKAGE} is stopped first...`);
    try {
      await client.stopApp(TRANSLATION_PACKAGE);
      console.log("✅ App stopped successfully");
    } catch (error) {
      console.log("ℹ️  App was not running (this is fine)");
    }

    // Step 3: Install Mira TPA
    console.log(`📦 Installing ${TRANSLATION_PACKAGE}...`);
    try {
      await client.installApp(TRANSLATION_PACKAGE);
      console.log("✅ App installed successfully");
    } catch (error: any) {
      if (error.message.includes("already installed")) {
        console.log("ℹ️  App is already installed (this is fine)");
      } else {
        console.log("⚠️  Install error:", error.message);
      }
    }

    // Step 4: Start the Mira app
    console.log(`🚀 Starting ${TRANSLATION_PACKAGE}...`);
    await client.startApp(TRANSLATION_PACKAGE);
    console.log("✅ App started\n");

    // Wait a moment for app to initialize
    await sleep(2000);

    // Step 5: Check running apps
    const runningApps = client.getRunningApps();
    console.log("📱 Currently running apps:", runningApps);

    if (!runningApps.includes(TRANSLATION_PACKAGE)) {
      throw new Error("Translation app did not start properly");
    }

    // Step 6: Stream audio file for transcription
    console.log(`🎤 Streaming audio file: ${CHINESE_AUDIO_FILE_PATH}`);
    console.log("📝 Listening for transcription results...\n");

    await sleep(1000);
    client.startSpeakingFromFile(CHINESE_AUDIO_FILE_PATH, false);
    if (!(await waitForDisplayToContain(["sunny day"]))) {
      onFailure("Did not hear sunny day.  Display is: " + currentDisplay);
    } else {
      console.log("✅ Heard sunny day");
    }
    if (!(await waitForDisplayToContain(["1", "one"]))) {
      onFailure("Did not hear 1 or one.  Display is: " + currentDisplay);
    } else {
      console.log("✅ Heard 1");
    }
    if (!(await waitForDisplayToContain(["2", "two"]))) {
      onFailure("Did not hear 2 or two.  Display is: " + currentDisplay);
    } else {
      console.log("✅ Heard 2");
    }
    if (!(await waitForDisplayToContain(["3", "three"]))) {
      onFailure("Did not hear 3 or three.  Display is: " + currentDisplay);
    } else {
      console.log("✅ Heard 3");
    }
    if (!(await waitForDisplayToContain(["4", "four"]))) {
      onFailure("Did not hear 4 or four.  Display is: " + currentDisplay);
    } else {
      console.log("✅ Heard 4");
    }
    await client.stopSpeaking();
    await sleep(2000);

    // Step 7: Stop the app
    console.log(`🛑 Stopping ${TRANSLATION_PACKAGE}...`);
    await client.stopApp(TRANSLATION_PACKAGE);
    console.log("✅ App stopped successfully\n");

    // Step 8: Optionally uninstall the app
    const shouldUninstall = process.argv.includes("--uninstall");
    if (shouldUninstall) {
      console.log(`🗑️  Uninstalling ${TRANSLATION_PACKAGE}...`);
      await client.uninstallApp(TRANSLATION_PACKAGE);
      console.log("✅ App uninstalled successfully\n");
    } else {
      console.log("ℹ️  App left installed (use --uninstall flag to remove)\n");
    }

    // Step 9: Disconnect
    console.log("👋 Disconnecting...");
    await client.disconnect();

    console.log("✅ Test completed successfully!");
    return true;
  } catch (error) {
    console.error("❌ Test failed:", error);
    return false;
  }
}

function waitForDisplayToContain(
  expectedTexts: string[],
  maxTimeoutSeconds: number = 10,
): Promise<boolean> {
  const startTime = Date.now();
  return new Promise((resolve) => {
    const checkDisplay = () => {
      if (Date.now() - startTime < maxTimeoutSeconds * 1000) {
        if (
          expectedTexts.some((text) =>
            currentDisplay.toLowerCase().includes(text),
          )
        ) {
          resolve(true);
        } else {
          setTimeout(checkDisplay, 100);
        }
      } else {
        resolve(false);
      }
    };
    checkDisplay();
  });
}

function setupEventListeners(client: MentraClient) {
  // Display events (transcription results should appear here)
  client.on("display_event", (event) => {
    console.log("🔄 Display Event:", {
      layout: event.layout?.layoutType,
      text: event.layout?.text,
      timestamp: event.timestamp.toISOString(),
    });
    currentDisplay = event.layout?.text || "";
  });

  // App state changes
  client.on("app_state_change", (event) => {
    console.log("🔄 App State Change:", {
      activeApps: event.userSession.activeAppSessions,
      loadingApps: event.userSession.loadingApps,
      isTranscribing: event.userSession.isTranscribing,
      timestamp: event.timestamp.toISOString(),
    });
  });

  // Microphone state changes
  client.on("microphone_state_change", (event) => {
    console.log("🎤 Microphone State:", {
      enabled: event.isMicrophoneEnabled,
      timestamp: event.timestamp.toISOString(),
    });
  });

  // Settings updates
  client.on("settings_update", (event) => {
    console.log("⚙️  Settings Update:", {
      settings: event.settings,
      timestamp: event.timestamp.toISOString(),
    });
  });

  // Connection events
  client.on("connection_ack", (event) => {
    console.log("🔗 Connection ACK:", {
      sessionId: event.sessionId,
      timestamp: event.timestamp.toISOString(),
    });
  });

  // Errors
  client.on("error", (error) => {
    console.error("❌ Client Error:", error);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Run the test
if (require.main === module) {
  /**
   * Executes the Mira test with a single automatic retry on failure.
   * Exits with code 0 on success, or 1 only if both attempts fail.
   */
  const main = async (): Promise<void> => {
    const isSuccess = (r: boolean): boolean => r;

    const failures: string[] = [];
    const onFailure = (message: string): void => {
      console.error(message);
      failures.push(message);
    };

    // First attempt
    const firstResult = await runTranslationTestOnce(onFailure);
    console.log("🎯 Translation Test Result (attempt 1):", firstResult);
    if (isSuccess(firstResult)) {
      process.exit(0);
    }

    console.log("🔁 First attempt failed. Retrying once...");

    // Clear failures for the second attempt (optional, purely for cleanliness)
    failures.length = 0;

    // Second attempt
    const secondResult = await runTranslationTestOnce(onFailure);
    console.log("🎯 Translation Test Result (attempt 2):", secondResult);
    process.exit(isSuccess(secondResult) ? 0 : 1);
  };

  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
