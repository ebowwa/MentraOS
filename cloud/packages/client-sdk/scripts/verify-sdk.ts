import { MentraClient, NodePlatform } from "../src";

async function main() {
    console.log("Initializing Mentra Client SDK...");

    const platform = new NodePlatform();
    const client = new MentraClient({
        host: "api.mentra.glass",
        secure: true,
        platform,
    });

    console.log("Client initialized successfully.");

    // Verify State Initialization
    const state = client.state.getState();
    console.log("Initial Device State:", state);

    // Verify Modules
    console.log("Auth Manager initialized:", !!client.auth);
    console.log("App Manager initialized:", !!client.appManager);
    console.log("System Manager initialized:", !!client.system);

    // Verify Hardware Access
    client.hardware.onEvent((event) => {
        console.log("Hardware Event:", event);
    });

    console.log("Simulating button press...");
    client.hardware.pressButton("main", "short");

    // Verify Token Storage (Mock)
    console.log("Setting mock token...");
    await client.auth.setCoreToken("mock-token-123");
    const token = await client.auth.getCoreToken();
    console.log("Retrieved token:", token);

    if (token === "mock-token-123") {
        console.log("SUCCESS: Token storage working.");
    } else {
        console.error("FAILURE: Token storage mismatch.");
        process.exit(1);
    }

    console.log("SDK Verification Complete.");
}

main().catch((err) => {
    console.error("Verification Failed:", err);
    process.exit(1);
});
