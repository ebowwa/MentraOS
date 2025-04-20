# Fun Facts TPA

This is a simple TPA that provides fun facts to the AugmentOS dashboard.

## Overview

This TPA demonstrates how to use the AugmentOS SDK's Dashboard Content API to contribute content to the dashboard. It generates fun facts periodically and in response to user's head movement (looking up).

## Features

- Generates interesting fun facts using the AugmentOS Agent system
- Updates facts periodically (every 5 minutes)
- Responds to user looking up by generating a new fact
- Remembers previous facts to avoid repetition
- Sends content to all dashboard modes (main, expanded, and always-on)

## Setup

```bash
# Install dependencies
bun install

# Start in development mode
bun run dev

# Build for production
bun run build

# Start in production mode
bun run start
```

## API Endpoints

### Core Endpoints

- `POST /webhook` - Entry point for the TPA, called by AugmentOS Cloud when a session starts

### Admin Endpoints

- `POST /admin/generate-fact` - Force generate a new fact for a specific session
- `GET /admin/sessions` - Get a list of active sessions
- `GET /health` - Health check endpoint

## Environment Variables

- `PORT` - Port to run the server on (default: 3001)
- `CLOUD_HOST_NAME` - AugmentOS Cloud host name (default: "cloud")
- `AUGMENTOS_AUTH_JWT_SECRET` - API key for authentication