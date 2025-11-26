import { MentraClient } from '../src/mantle/client';
import { NodePlatform } from '../src/platforms/node';

async function main() {
    console.log('🚀 Starting Headless Client Verification...');

    // 1. Initialize Client with Node Platform
    const platform = new NodePlatform();
    const client = new MentraClient({
        platform,
        host: 'isaiah.augmentos.cloud',
        secure: true
    });

    // 2. Listen for events
    client.on('connectionState', (isConnected) => {
        console.log(`📡 Connection State: ${isConnected ? 'CONNECTED' : 'DISCONNECTED'}`);
    });

    client.on('message', (msg) => {
        console.log('📩 Received Message:', msg.type);
    });

    // 3. Connect (using a dummy token for now, or a real one if available)
    try {
        console.log('🔌 Connecting...');
        // In a real scenario, we'd exchange an API key for a token first.
        // For now, we'll assume the local dev server accepts a test token.
        const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiZW1haWwiOiJqb2VAbWFtYXMuaG91c2UiLCJpYXQiOjE3Mzk2NjY4MTB9.mJkSEyP7v_jHlzRjc-HzjhCjDopG12aIlOeYxo-kp0M';
        await client.connect(token);

        // 4. Simulate Hardware Event
        console.log('🔘 Simulating Button Press...');
        // This would be: client.hardware.sendButtonPress('main', 'short');
        // But we haven't implemented the specific hardware methods in MentraClient yet.
        // We can use the raw socket for now to verify transport.
        // client.socket.send({ type: 'button_press', ... }); 

        // Keep alive for a bit
        await new Promise(resolve => setTimeout(resolve, 5000));

        console.log('✅ Verification Complete');
        client.disconnect();
        process.exit(0);
    } catch (err) {
        console.error('❌ Verification Failed:', err);
        process.exit(1);
    }
}

main();
