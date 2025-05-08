# Dashboard System Usage Guide

This guide explains how to use the AugmentOS Dashboard System, which consists of the system Dashboard Manager and multiple content TPAs.

## Components

The dashboard system consists of these components:

1. **Dashboard Manager** (system TPA): Manages system information and dashboard mode
2. **Fun Facts TPA**: Provides interesting facts to the dashboard
3. **Quotes TPA**: Provides inspirational quotes to the dashboard
4. **Gratitude TPA**: Provides gratitude reminders to the dashboard

## Running the Dashboard System

### Option 1: Docker Compose

The easiest way to run all dashboard components is using Docker Compose:

```bash
# Make sure the required environment variables are set
export AUGMENTOS_AUTH_JWT_SECRET=your_api_key

# Start all dashboard components
docker-compose -f docker-compose.dashboard.yml up -d
```

### Option 2: Individual Components

You can also run each component separately:

```bash
# Dashboard Manager
cd dashboard
bun run dev

# Fun Facts TPA
cd fun-facts-tpa
bun run dev

# Quotes TPA
cd quotes-tpa
bun run dev

# Gratitude TPA
cd gratitude-tpa
bun run dev
```

## Dashboard Modes

The dashboard supports three modes that can be controlled by the Dashboard Manager:

1. **Main**: Complete dashboard with system info in corners and content in center
2. **Expanded**: More space for content with minimal system info
3. **Always-On**: Minimal overlay showing essential info alongside other content

## Adding Your Own Content TPA

You can create your own content TPA by following these steps:

1. Create a new project using the SDK
2. Use the Dashboard Content API to write content to the dashboard:

```typescript
// Send content to the main dashboard mode
session.dashboard.content.writeToMain("Your content here");

// Send content to the expanded dashboard mode
session.dashboard.content.writeToExpanded("Your expanded content here");

// Send content to the always-on dashboard mode
session.dashboard.content.writeToAlwaysOn("Your minimal content here");
```

## Debugging

Each TPA has debugging endpoints:

- **Health Check**: `GET /health` - Check if the TPA is running
- **Session List**: `GET /admin/sessions` - See active sessions
- **Force Content Update**: `POST /admin/generate-xxx` - Force generate new content

## Troubleshooting

If the dashboard isn't displaying content:

1. Check that all TPAs are running (`docker-compose ps` or check individual processes)
2. Verify that the correct API key is set
3. Check the logs for each TPA for errors
4. Ensure the dashboard mode is set correctly (should be Main mode by default)
5. Verify that the TPAs are successfully connecting to the Cloud server

## More Information

For more detailed information, see the following documentation:

- Dashboard Design Document: `/packages/cloud/src/services/dashboard/docs/dashboard-design.md`
- Display Guidelines: `/docs/tpa/DISPLAY-GUIDELINES.md`
- SDK Documentation: See individual TPA README files