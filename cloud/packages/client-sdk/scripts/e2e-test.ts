import { MentraClient, NodePlatform } from "../src";
import { GlassesToCloudMessageType, CloudToGlassesMessageType } from "@mentra/types";
import * as fs from "fs";
import * as path from "path";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

// Load env from cloud root
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const APP_PACKAGE_NAME = "com.augmentos.livecaptions"; // Using a known app
const AUDIO_FILE_PATH = path.resolve(__dirname, "../assets/short-test-16khz.wav");

async function main() {
    console.log("🚀 Starting E2E Test...");

    const platform = new NodePlatform();
    const client = new MentraClient({
        host: "localhost:8002",
        secure: false,
        platform,
    });

    // 1. Connect
    console.log("🔗 Connecting...");

    // Generate Token
    const jwtSecret = process.env.AUGMENTOS_AUTH_JWT_SECRET || "my-secret-key";
    const token = jwt.sign({
        sub: "test-user-123",
        email: "test@example.com",
        organizations: [],
        defaultOrg: null,
        iat: Math.floor(Date.now() / 1000)
    }, jwtSecret);

    console.log("🔑 Generated Token:", token.substring(0, 20) + "...");
    await client.auth.setCoreToken(token);

    await client.connect();
    console.log("✅ Connected.");

    // 1.5 Report Device State (Connect Glasses)
    console.log("👓 Reporting device state...");
    await client.device.setDeviceState({
        modelName: "Even Realities G1",
        connected: true
    });
    console.log("✅ Device state reported.");

    // 2. Install App
    console.log(`📦 Installing app: ${APP_PACKAGE_NAME}...`);
    try {
        await client.apps.install(APP_PACKAGE_NAME);
        console.log("✅ Install request sent.");
    } catch (e) {
        console.error("❌ Install failed:", e);
    }

    // Listen for app state changes
    client.on(CloudToGlassesMessageType.APP_STATE_CHANGE, () => {
        console.log("[AppManager] Received APP_STATE_CHANGE, syncing apps...");
        client.apps.syncInstalledApps();
    });

    // 3. Start App
    console.log(`🚀 Starting app: ${APP_PACKAGE_NAME}...`);
    await client.apps.start(APP_PACKAGE_NAME);
    console.log("✅ App start request sent.");

    console.log("⏳ Waiting for app to start...");
    await new Promise<void>(resolve => {
        const check = () => {
            const running = client.apps.state.runningApps;
            if (running.includes(APP_PACKAGE_NAME)) {
                resolve();
            } else {
                setTimeout(check, 500);
            }
        };
        check();
    });

    // 4. Stream Audio
    console.log("🎤 Streaming audio...");
    if (!fs.existsSync(AUDIO_FILE_PATH)) {
        console.error(`❌ Audio file not found at ${AUDIO_FILE_PATH}`);
        process.exit(1);
    }

    // Send VAD start
    client.send({
        type: GlassesToCloudMessageType.VAD,
        status: true
    });

    const fileStream = fs.createReadStream(AUDIO_FILE_PATH, { highWaterMark: 3200 }); // 100ms chunks at 16kHz 16bit mono (32000 bytes/sec -> 3200 bytes/100ms)

    let chunksSent = 0;

    // Listen for display events to verify transcription
    let transcriptionReceived = false;
    client.on("display_event", (event) => {
        console.log("📱 Display Event:", JSON.stringify(event.layout));
        // Check for actual transcription content (text_wall)
        if (event.layout.layoutType === "text_wall" && event.layout.text && event.layout.text.length > 0) {
            transcriptionReceived = true;
            console.log(`✅ Transcription received: "${event.layout.text}"`);
        }
    });

    for await (const chunk of fileStream) {
        client.sendAudioChunk(chunk as Buffer);
        chunksSent++;
        await new Promise(r => setTimeout(r, 100)); // Real-time simulation
    }

    console.log(`✅ Sent ${chunksSent} audio chunks.`);

    // Send VAD stop
    client.send({
        type: GlassesToCloudMessageType.VAD,
        status: false
    });

    // Wait for results
    console.log("⏳ Waiting for transcription...");
    await new Promise(r => setTimeout(r, 5000));

    if (transcriptionReceived) {
        console.log("✅ E2E Test Passed!");
    } else {
        console.warn("⚠️ No transcription received. Check server logs.");
    }

    // 5. Stop App
    console.log("⏹️ Stopping app...");
    await client.apps.stop(APP_PACKAGE_NAME);

    client.disconnect();
    console.log("👋 Disconnected.");
}

main().catch(err => {
    console.error("❌ E2E Test Failed:", err);
    process.exit(1);
});
