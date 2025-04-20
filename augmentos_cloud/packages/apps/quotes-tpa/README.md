# Quotes TPA

This is a TPA that provides inspirational quotes to the AugmentOS dashboard.

## Overview

This TPA demonstrates how to use the AugmentOS SDK's Dashboard Content API to contribute quote content to the dashboard. It generates inspirational quotes periodically and in response to user's head position changes.

## Features

- Generates inspirational quotes using the AugmentOS Agent system
- Updates quotes periodically (every 10 minutes)
- Responds to user looking up by generating a new quote
- Remembers previous quotes to avoid repetition
- Supports all dashboard modes with appropriate content formatting
- Demonstrates proper use of SDK event handlers

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

- `POST /admin/generate-quote` - Force generate a new quote for a specific session
- `GET /admin/sessions` - Get a list of active sessions
- `GET /health` - Health check endpoint

## Environment Variables

- `PORT` - Port to run the server on (default: 3002)
- `CLOUD_HOST_NAME` - AugmentOS Cloud host name (default: "cloud")
- `AUGMENTOS_AUTH_JWT_SECRET` - API key for authentication