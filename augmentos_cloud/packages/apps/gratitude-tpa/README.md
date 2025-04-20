# Gratitude TPA

This is a TPA that provides gratitude reminders to the AugmentOS dashboard.

## Overview

This TPA demonstrates how to use the AugmentOS SDK's Dashboard Content API to contribute gratitude reminders and reflections to the dashboard. It helps users cultivate a practice of gratitude through periodic reminders.

## Features

- Generates thoughtful gratitude reminders using the AugmentOS Agent system
- Updates reminders periodically (every 20 minutes)
- Responds to user looking up by displaying a new gratitude prompt
- Remembers previous prompts to provide a varied experience
- Supports all dashboard modes with appropriately formatted content
- Implements the SDK best practices for event handling

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

- `POST /admin/generate-reminder` - Force generate a new gratitude reminder for a specific session
- `GET /admin/sessions` - Get a list of active sessions
- `GET /health` - Health check endpoint

## Environment Variables

- `PORT` - Port to run the server on (default: 3003)
- `CLOUD_HOST_NAME` - AugmentOS Cloud host name (default: "cloud")
- `AUGMENTOS_AUTH_JWT_SECRET` - API key for authentication