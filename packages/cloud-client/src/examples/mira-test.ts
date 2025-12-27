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

const MIRA_PACKAGE = "cloud.augmentos.mira";
const HEY_MIRA_AUDIO_FILE_PATH = resolve(__dirname, "../audio/hey-mira.wav");
const WHAT_TIME_IS_IT_AUDIO_FILE_PATH = resolve(
  __dirname,
  "../audio/what-time-is-it.wav",
);
const SF_LAT = 37.774929;
const SF_LNG = -122.419416;

let currentDisplay = "";

export interface MiraTestResult {
  didHearListening: boolean;
  didHearWhatTime: boolean;
  didSeeTime: boolean;
}

/**
 * Runs the Live Captions TPA test once for the specified duration.
 * Returns true if all NATO alphabet words were heard without issues, otherwise false.
 */
export async function runMiraTestOnce(
  onFailure: (error: string) => void = () => {},
): Promise<MiraTestResult> {
  const missedAny: boolean | null = null;
  console.log("🎯 Mira Test Starting...\n");

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
  const result: MiraTestResult = {
    didHearListening: false,
    didHearWhatTime: false,
    didSeeTime: false,
  };

  try {
    // Step 1: Connect to MentraOS Cloud
    console.log("📡 Connecting to MentraOS Cloud...");
    await client.connect();
    console.log("✅ Connected successfully\n");

    // Step 2: Stop app first if it's already running (to ensure clean state)
    console.log(`🛑 Ensuring ${MIRA_PACKAGE} is stopped first...`);
    try {
      await client.stopApp(MIRA_PACKAGE);
      console.log("✅ App stopped successfully");
    } catch (error) {
      console.log("ℹ️  App was not running (this is fine)");
    }

    // Step 3: Install Mira TPA
    console.log(`📦 Installing ${MIRA_PACKAGE}...`);
    try {
      await client.installApp(MIRA_PACKAGE);
      console.log("✅ App installed successfully");
    } catch (error: any) {
      if (error.message.includes("already installed")) {
        console.log("ℹ️  App is already installed (this is fine)");
      } else {
        console.log("⚠️  Install error:", error.message);
      }
    }

    // Step 4: Start the Mira app
    console.log(`🚀 Starting ${MIRA_PACKAGE}...`);
    await client.startApp(MIRA_PACKAGE);
    console.log("✅ App started\n");

    // Wait a moment for app to initialize
    await sleep(2000);

    // Step 5: Check running apps
    const runningApps = client.getRunningApps();
    console.log("📱 Currently running apps:", runningApps);

    if (!runningApps.includes(MIRA_PACKAGE)) {
      throw new Error("Mira app did not start properly");
    }

    // Step 6: Stream audio file for transcription
    console.log(`🎤 Streaming audio file: ${HEY_MIRA_AUDIO_FILE_PATH}`);
    console.log("📝 Listening for transcription results...\n");

    await client.updateLocation(SF_LAT, SF_LNG);
    await sleep(10000);
    await client.updateLocation(SF_LAT, SF_LNG);
    await client.startSpeaking();
    await sleep(2000);
    await client.startSpeakingFromFile(HEY_MIRA_AUDIO_FILE_PATH, false);
    await sleep(1000);
    client.startSpeakingFromFile(HEY_MIRA_AUDIO_FILE_PATH, false);
    if (!(await waitForDisplayToContain("listening"))) {
      result.didHearListening = false;
      onFailure("Did not hear listening.  Display is: " + currentDisplay);
    } else {
      result.didHearListening = true;
    }

    await client.startSpeakingFromFile(WHAT_TIME_IS_IT_AUDIO_FILE_PATH, false);
    if (!(await waitForDisplayToContain("what time"))) {
      result.didHearWhatTime = false;
      onFailure("Did not hear what time is it?  Display is: " + currentDisplay);
    } else {
      result.didHearWhatTime = true;
    }
    await client.stopSpeaking();
    await sleep(2000);

    // Current hour in San Francisco (America/Los_Angeles), 12-hour clock (1-12), DST-aware
    const currentPacificTimeHours: number = parseInt(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Los_Angeles",
        hour: "numeric",
        hour12: true,
      }).format(new Date()),
      10,
    );
    const currentPacificTimeMinutes: number = parseInt(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Los_Angeles",
        minute: "numeric",
      }).format(new Date()),
      10,
    );
    let didSeeTime = false;
    let timeDisplay = "";
    let waitedSeconds = 0;
    const expectedTime = `${currentPacificTimeHours}:${currentPacificTimeMinutes.toString().padStart(2, "0")}`;
    while (waitedSeconds < 10 || currentDisplay.trim() !== "") {
      if (currentDisplay.trim() !== "") {
        timeDisplay = currentDisplay;
        if (currentDisplay.toLowerCase().includes(expectedTime)) {
          didSeeTime = true;
          break;
        }
      }
      await sleep(1000);
      waitedSeconds++;
    }
    if (!didSeeTime) {
      onFailure(
        `Did not see time.  Expected: ${expectedTime}.  Display was: ` +
          timeDisplay,
      );
    } else {
      result.didSeeTime = true;
    }

    // Step 7: Stop the app
    console.log(`🛑 Stopping ${MIRA_PACKAGE}...`);
    await client.stopApp(MIRA_PACKAGE);
    console.log("✅ App stopped successfully\n");

    // Step 8: Optionally uninstall the app
    const shouldUninstall = process.argv.includes("--uninstall");
    if (shouldUninstall) {
      console.log(`🗑️  Uninstalling ${MIRA_PACKAGE}...`);
      await client.uninstallApp(MIRA_PACKAGE);
      console.log("✅ App uninstalled successfully\n");
    } else {
      console.log("ℹ️  App left installed (use --uninstall flag to remove)\n");
    }

    // Step 9: Disconnect
    console.log("👋 Disconnecting...");
    await client.disconnect();

    console.log("✅ Test completed successfully!");
    return result;
  } catch (error) {
    console.error("❌ Test failed:", error);
    return result;
  }
}

function waitForDisplayToContain(
  expectedText: string,
  maxTimeoutSeconds: number = 10,
): Promise<boolean> {
  const startTime = Date.now();
  return new Promise((resolve) => {
    const checkDisplay = () => {
      if (Date.now() - startTime < maxTimeoutSeconds * 1000) {
        if (currentDisplay.toLowerCase().includes(expectedText)) {
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
    const isSuccess = (r: MiraTestResult): boolean =>
      r.didHearListening && r.didHearWhatTime && r.didSeeTime;

    const failures: string[] = [];
    const onFailure = (message: string): void => {
      console.error(message);
      failures.push(message);
    };

    // First attempt
    const firstResult = await runMiraTestOnce(onFailure);
    console.log("🎯 Mira Test Result (attempt 1):", firstResult);
    if (isSuccess(firstResult)) {
      process.exit(0);
    }

    console.log("🔁 First attempt failed. Retrying once...");

    // Clear failures for the second attempt (optional, purely for cleanliness)
    failures.length = 0;

    // Second attempt
    const secondResult = await runMiraTestOnce(onFailure);
    console.log("🎯 Mira Test Result (attempt 2):", secondResult);
    process.exit(isSuccess(secondResult) ? 0 : 1);
  };

  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
