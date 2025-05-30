---
sidebar_position: 3
---

# Build From Scratch

This guide will walk you through creating a simple "Hello, World" AugmentOS app that displays text on the AugmentOS smart glasses. This will introduce you to the basic structure of an app and how to use the SDK.

## Prerequisites

Make sure you have the following installed:

*   **Node.js:** (v18.0.0 or later)
*   **Bun:** [Install bun](https://bun.sh/docs/installation)
*   **A code editor:** (VS Code recommended)

## Part 1: Set Up Your Project

### 1. Create Project Directory

Create a new directory for your app and initialize a Node.js project:

```bash
mkdir my-first-augmentos-app
cd my-first-augmentos-app
bun init -y
```

This will create a package.json file.

### 2. Install the SDK

Install the @augmentos/sdk package:

```bash
bun add @augmentos/sdk
```

### 3. Install Additional Dependencies

Install TypeScript and other development dependencies:

```bash
bun add -d typescript tsx @types/node
```

### 4. Create Project Structure

Create the following project structure:

```
my-first-augmentos-app/
├── src/
│   └── index.ts
├── .env
└── package.json
```

### 5. Set Up Environment Configuration

Create a `.env` file:

```env
PORT=3000
PACKAGE_NAME=com.example.myfirstaugmentosapp
AUGMENTOS_API_KEY=your_api_key_from_console
```

Edit the `.env` file with your app details (you'll get these values when you register your app later).

### 6. Write Your App Code

Add the following code to `src/index.ts`:

```typescript
import { TpaServer, TpaSession } from '@augmentos/sdk';

// Load configuration from environment variables
const PACKAGE_NAME = process.env.PACKAGE_NAME || "com.example.myfirstaugmentosapp";
const PORT = parseInt(process.env.PORT || "3000");
const AUGMENTOS_API_KEY = process.env.AUGMENTOS_API_KEY;

if (!AUGMENTOS_API_KEY) {
    console.error("AUGMENTOS_API_KEY environment variable is required");
    process.exit(1);
}

/**
 * MyAugmentOSApp - A simple AugmentOS application that displays "Hello, World!"
 * Extends TpaServer to handle sessions and user interactions
 */
class MyAugmentOSApp extends TpaServer {
    /**
     * Handle new session connections
     * @param session - The TPA session instance
     * @param sessionId - Unique identifier for this session
     * @param userId - The user ID for this session
     */
    protected async onSession(session: TpaSession, sessionId: string, userId: string): Promise<void> {
        console.log(`New session: ${sessionId} for user ${userId}`);

        // Display "Hello, World!" on the glasses
        session.layouts.showTextWall("Hello, World!");

        // Log when the session is disconnected
        session.events.onDisconnected(() => {
            console.log(`Session ${sessionId} disconnected.`);
        });
    }
}

// Create and start the app server
const server = new MyAugmentOSApp({
    packageName: PACKAGE_NAME,
    apiKey: AUGMENTOS_API_KEY,
    port: PORT
});

server.start().catch(err => {
    console.error("Failed to start server:", err);
});
```

### 7. Configure TypeScript

Create a `tsconfig.json` file in the root of your project:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "moduleResolution": "node",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "baseUrl": ".",
    "paths": {}
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### 8. Set Up Build Scripts

Update your `package.json` with the following scripts:

```json
{
  "name": "my-first-augmentos-app",
  "version": "1.0.0",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "bun run dist/index.js",
    "dev": "bun --watch src/index.ts"
  },
  "dependencies": {
    "@augmentos/sdk": "^1.1.10"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0"
  }
}
```

## Part 2: Connect to AugmentOS

### 9. Install AugmentOS on Your Phone

Download and install the AugmentOS app from [AugmentOS.org/install](https://AugmentOS.org/install)

### 10. Set Up ngrok

To make your locally running app accessible from the internet:

1. Install ngrok: `brew install ngrok` (on macOS) or [install ngrok](https://ngrok.com/docs/getting-started/)
2. Create an ngrok account
3. [Set up a static address/URL in the ngrok dashboard](https://dashboard.ngrok.com/)

* Make sure you run the `ngrok config add-authtoken <your_authtoken>` line
* Make sure you select `Static Domain`, then generate a static domain

<center>
  <img width="75%" src="/img/ngrok_guide_1.png"></img>
</center>

### 11. Register Your App

![AugmentOS Console](https://github.com/user-attachments/assets/36192c2b-e1ba-423b-90de-47ff8cd91318)

1. Navigate to [console.AugmentOS.org](https://console.AugmentOS.org/)
2. Click "Sign In" and log in with the same account you're using for AugmentOS
3. Click "Create App"
4. Set a unique package name (e.g., `com.yourname.myfirstapp`)
5. For "Public URL", enter your ngrok static URL
6. After the app is created, you will be given an API key. Copy this key.
7. In the edit app screen, add the microphone permission

> **Note**: If your app needs access to device data like microphone, location, or notifications, you can configure permissions in the developer console. See the [Permissions](permissions) guide for details.

### 12. Update Your Environment Configuration

Edit your `.env` file with the values from your registered app:

```env
PORT=3000
PACKAGE_NAME=com.yourname.myfirstapp
AUGMENTOS_API_KEY=your_actual_api_key_from_console
```

Make sure the `PACKAGE_NAME` matches what you registered in the AugmentOS Console.

## Part 3: Run Your App

### 13. Install Dependencies and Run

Install all dependencies:

```bash
bun install
```

For development with automatic reloading:

```bash
bun run dev
```

Or build and run in production mode:

```bash
bun run build
bun run start
```

### 14. Make Your App Accessible

Expose your app to the internet with ngrok:

```bash
ngrok http --url=<YOUR_NGROK_URL_HERE> 3000
```

> Note: The port number (3000) must match the PORT in your `.env` file.

> **IMPORTANT:** After making changes to your app code or restarting your server, you must restart your app inside the AugmentOS phone app.

### 15. Set up App Permissions

Your app must declare which permissions it needs to access device capabilities like:

- **MICROPHONE**: For speech transcription, translation, and voice commands
- **LOCATION**: For GPS coordinates and location-based features
- **CALENDAR**: For calendar events and scheduling
- **NOTIFICATIONS**: For phone notifications and alerts

To add permissions to your app:

1. Go to [console.AugmentOS.org](https://console.AugmentOS.org/)
2. Click on your app to open its settings
3. Scroll to the **Required Permissions** section
4. Click **Add Permission** to add a new permission
5. Select the permission type (e.g., "MICROPHONE" for speech features)
6. Add a clear description explaining why your app needs this permission
7. Save your changes

For example, if your app will use voice commands, add:
- **Permission Type**: MICROPHONE
- **Description**: "Used for voice commands and speech recognition"

## Part 4: Setting Up App AI Tools for Mira

Mira, the AugmentOS AI assistant, can call functions in your app. This allows your application to extend Mira's capabilities with custom tools.

For a comprehensive guide on app AI tools, see [AI Tools](/tools).

## What's Next?

Congratulations! You've built your first AugmentOS app. To continue your journey:

### Learn More
- Explore [Core Concepts](core-concepts) to understand sessions, events, and the app lifecycle
- Dive into [Events](events) to handle user interactions and sensor data
- Master [Layouts](layouts) to create rich visual experiences on smart glasses
- Learn about [Permissions](permissions) to understand how to access device data securely

### Get Help
- Join our [Discord community](https://discord.gg/5ukNvkEAqT) for support
- Visit [AugmentOS.org](https://augmentos.org) for the latest updates
- Check out the [GitHub Organization](https://github.com/AugmentOS-Community) for examples
- For a more in-depth example with app settings support, see the [Extended Example](https://github.com/AugmentOS-Community/AugmentOS-Extended-Example-App)