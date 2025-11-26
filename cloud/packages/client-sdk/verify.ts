import { MentraClient } from "./src";

async function main() {
    console.log("Initializing MentraClient...");

    const client = new MentraClient({
        host: "localhost:3000",
        token: "test-token",
        secure: false,
        deviceInfo: {
            modelName: "Verification Script",
            firmwareVersion: "1.0.0"
        }
    });

    console.log("Client initialized successfully.");
    console.log("Hardware module available:", !!client.hardware);
    console.log("State module available:", !!client.state);
    console.log("Capabilities module available:", !!client.capabilities);
    console.log("Battery level:", client.state.batteryLevel);
    console.log("Has Camera:", client.capabilities.getCapabilities().hasCamera);

    client.on("connected", () => {
        console.log("Connected to Cloud!");
    });

    client.on("error", (err) => {
        console.log("Connection error (expected if no server running):", err.message);
    });

    try {
        console.log("Attempting connection...");
        // We expect this to fail or hang if no server, but we just want to verify runtime execution
        client.connect().catch(err => {
            console.log("Connect promise rejected (expected):", err.message);
        });

        // Simulate sending a button press
        console.log("Sending button press...");
        try {
            client.hardware.pressButton("main", "short");
        } catch (e: any) {
            console.log("Send failed as expected (not connected):", e.message);
        }

    } catch (err) {
        console.error("Runtime error:", err);
    }
}

main();
