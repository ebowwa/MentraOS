# MentraOS CLI Client Command Spec

Command to simulate a MentraOS user session for testing apps without physical smart glasses.

## Problem

Developers need smart glasses hardware to test their MentraOS apps:

- **Hardware dependency:**
  - Must own compatible smart glasses ($300-$500+)
  - Must have glasses charged and paired
  - Must physically wear glasses to test
  - Testing is slow (put on glasses, navigate UI, test feature, repeat)

- **Testing limitations:**
  - Can't easily test edge cases
  - Hard to reproduce specific scenarios
  - Team members without glasses can't test
  - Can't test during development without hardware

- **Current workarounds:**
  - Manual webhook POST with curl (limited, no WebSocket)
  - Postman collections (tedious, no event simulation)
  - No way to simulate full session lifecycle

**Target:** Simulate complete user session from terminal, enabling rapid iteration without hardware.

## Goals

### Primary

1. Simulate complete MentraOS session (webhook → WebSocket → events)
2. Send user events from available StreamTypes
3. Display app responses (layouts, audio requests, dashboard updates)
4. Support interactive CLI mode for manual testing
5. Work with local or remote app servers

### Non-Goals

- Replace physical hardware testing (complement, not replace)
- Full-featured glasses simulator with GUI (terminal only for MVP)
- Automated test scripts (Phase 2)
- Performance testing
- Multi-user simulation

## Architecture Overview

### How MentraOS Actually Works

```
User with Glasses
       ↓
┌──────────────┐
│ Mobile App   │  (BLE to glasses, manages connection)
│  (Phone)     │
└──────┬───────┘
       │ WebSocket + REST APIs
       ▼
┌──────────────┐      HTTP POST       ┌──────────────┐
│ MentraOS     │      (webhook)       │  Developer's │
│   Cloud      │─────────────────────→│  App Server  │
│              │                       │              │
│              │←─────────────────────│              │
│              │      WebSocket        │              │
└──────────────┘                       └──────────────┘
```

**Key Points:**

- Mobile app connects to cloud via WebSocket (for events) and REST APIs (for state management)
- Cloud handles complexity and abstracts functionality for the client
- Cloud sends webhooks to developer's app server
- App server connects back to cloud via WebSocket
- Cloud relays events between mobile client and app server

### What `mentra client` Simulates

```
┌──────────────┐
│mentra client │  (Simulates mobile app + glasses)
└──────┬───────┘
       │ WebSocket + REST APIs
       │ (same as mobile app uses)
       ▼
┌──────────────┐      HTTP POST       ┌──────────────┐
│ MentraOS     │      (webhook)       │  Developer's │
│   Cloud      │─────────────────────→│  App Server  │
│   (real)     │                       │   (local)    │
│              │←─────────────────────│              │
│              │      WebSocket        │              │
└──────┬───────┘                       └──────────────┘
       │
       │ Relays display/audio/dashboard updates
       ▼
┌──────────────┐
│mentra client │  (Displays in terminal)
└──────────────┘
```

### Implementation Approach

**`mentra client` will:**

1. Connect to MentraOS Cloud using the same APIs as mobile app
2. Send user events (transcription, button presses, etc.) to cloud
3. Cloud handles routing these to the app server
4. Receive display updates, audio requests, dashboard updates from cloud
5. Render these in the terminal

**Backend:**

- Always uses **real MentraOS Cloud backend**
- Can connect to remote cloud (production, staging)
- Can connect to local cloud (developers run `bun run dev` locally)
- No simulation of cloud behavior - always uses actual backend

**Key Requirement: Cloud Client Library**

To implement this, we need to create a **`cloud-client` package** that:

- Abstracts the client-to-cloud communication layer
- Can be used by both the mobile app (in future refactor) and CLI tool
- Handles WebSocket connection management
- Handles REST API calls to cloud
- Provides a clean interface for sending events and receiving updates

### API Surface Documentation Needed

Before implementing `mentra client`, we must document:

1. **Client → Cloud WebSocket Messages**
   - What messages does the client send to cloud?
   - Message format, types, and payloads
   - Reference: `websocket-glasses.service.ts` shows what cloud expects from client

2. **Cloud → Client WebSocket Messages**
   - What messages does cloud send to client?
   - Display updates, audio playback, dashboard updates, etc.

3. **Client → Cloud REST APIs**
   - What HTTP endpoints does the mobile client use?
   - Currently scattered across `cloud/src/routes/` and `cloud/src/api/client/`
   - Need to identify full API surface

4. **Session Lifecycle**
   - How does client authenticate?
   - How does client start/stop app sessions?
   - How does client handle reconnection?

**Action Items:**

- [ ] Audit existing mobile client API usage
- [ ] Document complete client-cloud API interface
- [ ] Design `cloud-client` library interface
- [ ] Update this spec with concrete API details

**Notes:**

- Always connects to real MentraOS Cloud backend (no local simulation)
- Developers can run cloud locally for testing: `cd cloud && bun run dev`
- Spec intentionally remains vague on API details until we complete the API surface audit

## User Experience

### Interactive Mode

```bash
$ mentra client com.example.translator

MentraOS Client Simulator
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Connecting to app server...
✓ Webhook sent (session_request)
✓ App connected via WebSocket
✓ Received CONNECTION_ACK
✓ Session ID: abc-123-def-456

Capabilities: Display ✓ | Camera ✗ | Microphone ✓ | Speakers ✓

Session active. Type 'help' for commands.

mentra> say "hello world"
📤 Sending transcription (final)
   Text: "hello world"

📥 Display request received:
┌─────────────────────────────────────┐
│ TextWall                            │
├─────────────────────────────────────┤
│ You said: hello world               │
│                                     │
│ Duration: 5000ms                    │
└─────────────────────────────────────┘

mentra> button tap
📤 Sending button_press
   Type: tap

📥 Display request received:
┌─────────────────────────────────────┐
│ ReferenceCard                       │
├─────────────────────────────────────┤
│ Title: Button Pressed               │
│                                     │
│ You tapped the button!              │
└─────────────────────────────────────┘

mentra> location 37.7749 -122.4194
📤 Sending location_update
   Lat: 37.7749, Lon: -122.4194

📥 Display request received:
┌─────────────────────────────────────┐
│ TextWall                            │
├─────────────────────────────────────┤
│ Location: San Francisco, CA         │
└─────────────────────────────────────┘

mentra> dashboard
📥 Dashboard update received:
┌─────────────────────────────────────┐
│ Dashboard (Main Mode)               │
├─────────────────────────────────────┤
│ Battery      │ 85%                  │
│ Status       │ Connected            │
└─────────────────────────────────────┘

mentra> stats
Session Statistics:
  Duration:          3m 42s
  Events sent:       12
  Messages received: 15

Sent events:
  transcription:     8
  button_press:      2
  location_update:   1
  head_position:     1

Received messages:
  display_request:   10
  audio_playback:    3
  dashboard_update:  2

mentra> quit
Disconnecting...
✓ Session ended
```

### Command Flags & Options

```
mentra client <package-name> [options]

Arguments:
  <package-name>          Package name of app to test

Options:
  --url <url>             App server URL (default: from app publicUrl)
  --local                 Use localhost:3000
  --cloud <url>           MentraOS Cloud URL (default: from config)
  --session-id <id>       Use specific session ID (default: auto-generated)
  --user <email>          User email (default: test@example.com)
  --capabilities <json>   Device capabilities JSON file
  --display               Simulate device with display (default)
  --camera                Simulate device with camera
  --no-display            Simulate audio-only device
  --verbose               Show detailed message logs
  --quiet                 Minimal output
  --log-file <file>       Save session log to file
  -h, --help              Show help

Examples:
  mentra client com.example.app
  mentra client com.example.app --local
  mentra client com.example.app --camera --no-display
  mentra client com.example.app --verbose --log-file session.log
```

## Interactive Commands

Based on actual StreamTypes from MentraOS:

```
Stream Events (what glasses/phone send to cloud → app):

Text/Audio:
  say <text>                      Send transcription (final)
  say "<text>" --partial          Send partial transcription
  translate <text> --to <lang>    Send translation result

Hardware:
  button <type>                   Send button_press (tap, double_tap, hold)
  head up                         Send head_position: up
  head down                       Send head_position: down
  touch <event>                   Send touch_event

Location:
  location <lat> <lon>            Send location_update
  location <city>                 Geocode city to coordinates

Battery/Status:
  battery <percent>               Send glasses_battery_update
  phone-battery <percent>         Send phone_battery_update
  connection <state>              Send glasses_connection_state

Phone Events:
  notification <title> <text>     Send phone_notification
  calendar <event-json>           Send calendar_event

Advanced:
  photo --response <file>         Send photo_response (simulated capture)
  vad <state>                     Send VAD (voice activity detection)
  audio-chunk <file>              Send raw audio_chunk

Session:
  disconnect                      End session gracefully
  reconnect                       Disconnect and reconnect

Display:
  stats                           Show session statistics
  history                         Show message history
  capabilities                    Show device capabilities
  subscriptions                   Show app's active subscriptions
  clear                           Clear screen

Help:
  help                            Show all commands
  help <command>                  Show command details

Exit:
  quit, exit, q                   Exit simulator
```

## Event Data Structures

Based on actual MentraOS SDK types:

### TranscriptionData

```typescript
{
  type: "transcription",
  text: "hello world",
  isFinal: true,
  transcribeLanguage: "en",
  startTime: 1234567890,
  endTime: 1234567900,
  confidence: 0.95,
  provider: "soniox"
}
```

### ButtonPress

```typescript
{
  type: "button_press",
  buttonType: "tap" | "double_tap" | "hold" | "triple_tap"
}
```

### HeadPosition

```typescript
{
  type: "head_position",
  position: "up" | "down"
}
```

### LocationUpdate

```typescript
{
  type: "location_update",
  latitude: 37.7749,
  longitude: -122.4194,
  accuracy: 10,
  altitude?: 100,
  timestamp: Date
}
```

### PhoneNotification

```typescript
{
  type: "phone_notification",
  title: "New Message",
  text: "Hello from John",
  packageName: "com.android.messaging",
  timestamp: Date
}
```

### GlassesBatteryUpdate

```typescript
{
  type: "glasses_battery_update",
  batteryLevel: 85,
  isCharging: false
}
```

## Layout Rendering

Based on actual layout types from SDK:

### TextWall

```
┌─────────────────────────────────────┐
│ TextWall                            │
├─────────────────────────────────────┤
│ Hello, World!                       │
│                                     │
│ Duration: 5000ms                    │
└─────────────────────────────────────┘
```

### ReferenceCard

```
┌─────────────────────────────────────┐
│ ReferenceCard                       │
├─────────────────────────────────────┤
│ Meeting Reminder                    │
│                                     │
│ Team Standup in 5 minutes           │
│                                     │
│ Duration: -1 (persistent)           │
└─────────────────────────────────────┘
```

### DoubleTextWall

```
┌─────────────────────────────────────┐
│ DoubleTextWall                      │
├─────────────────────────────────────┤
│ Original Text:                      │
│ Hello, how are you?                 │
│                                     │
│ Translated Text:                    │
│ Hola, ¿cómo estás?                  │
└─────────────────────────────────────┘
```

### DashboardCard

```
┌─────────────────────────────────────┐
│ DashboardCard                       │
├─────────────────────────────────────┤
│ Battery Level        85%            │
└─────────────────────────────────────┘
```

### BitmapView

```
┌─────────────────────────────────────┐
│ BitmapView                          │
├─────────────────────────────────────┤
│ [Bitmap Image: 526x100 pixels]     │
│ Size: 8.2kb                         │
└─────────────────────────────────────┘
```

### Audio Playback

```
🔊 Audio playback request:
   Type: TTS
   Text: "Welcome to San Francisco"
   Voice: Rachel (ElevenLabs)
```

### Dashboard Update

```
📊 Dashboard update:
   Mode: main
   Content: { battery: "85%", status: "Connected" }
```

## Technical Implementation

### Command Structure

```
cli/src/commands/client/
├── index.ts              # Main client command
├── session.ts            # Session management using cloud-client
├── events.ts             # Event simulation helpers
├── display.ts            # Layout rendering in terminal
├── interactive.ts        # Interactive mode REPL
└── capabilities.ts       # Device capability profiles

cloud-client/             # NEW: Shared client library
├── src/
│   ├── connection.ts     # WebSocket connection management
│   ├── api.ts            # REST API client
│   ├── events.ts         # Event sending interface
│   ├── session.ts        # Session lifecycle management
│   └── types.ts          # Message types
```

### Core Session Flow (High-Level)

```typescript
// Using the cloud-client library
import {CloudClient} from "@mentra/cloud-client"

export class ClientSimulator {
  private cloudClient: CloudClient
  private packageName: string

  async start(): Promise<void> {
    // 1. Create cloud client (handles connection to MentraOS Cloud)
    this.cloudClient = new CloudClient({
      userId: this.userId,
      // ... auth/config
    })

    // 2. Connect to cloud
    await this.cloudClient.connect()

    // 3. Start app session (cloud handles webhook to app server)
    await this.cloudClient.startApp(this.packageName)

    // 4. Set up listeners for updates from app (via cloud)
    this.setupMessageHandlers()

    // 5. Enter interactive mode
    await this.startInteractiveMode()
  }

  async sendEvent(streamType: StreamType, data: any): Promise<void> {
    // Send event to cloud using cloud-client library
    await this.cloudClient.sendEvent({
      streamType,
      data,
    })
  }

  private setupMessageHandlers(): void {
    // Listen for messages from cloud (which come from app)
    this.cloudClient.on("display_update", (msg) => {
      this.renderLayout(msg)
    })

    this.cloudClient.on("audio_request", (msg) => {
      this.displayAudioRequest(msg)
    })

    this.cloudClient.on("dashboard_update", (msg) => {
      this.displayDashboard(msg)
    })
  }
}
```

**Notes:**

- Connects to real cloud backend (local or remote)
- Actual implementation details depend on completing the API surface documentation

### Event Simulation

```typescript
interface EventSimulator {
  sendTranscription(text: string, isFinal: boolean): Promise<void>
  sendButtonPress(type: ButtonType): Promise<void>
  sendHeadPosition(position: "up" | "down"): Promise<void>
  sendLocation(lat: number, lon: number): Promise<void>
  sendBattery(level: number): Promise<void>
  sendNotification(title: string, text: string): Promise<void>
}
```

### Display Renderer

```typescript
class TerminalRenderer {
  renderLayout(layout: Layout, duration?: number): void {
    switch (layout.layoutType) {
      case "text_wall":
        this.renderTextWall(layout)
        break
      case "reference_card":
        this.renderReferenceCard(layout)
        break
      case "double_text_wall":
        this.renderDoubleTextWall(layout)
        break
      case "dashboard_card":
        this.renderDashboardCard(layout)
        break
      case "bitmap_view":
        this.renderBitmap(layout)
        break
    }
  }

  private renderTextWall(layout: TextWall): void {
    const width = 40
    console.log("┌" + "─".repeat(width) + "┐")
    console.log("│ TextWall" + " ".repeat(width - 9) + "│")
    console.log("├" + "─".repeat(width) + "┤")

    const lines = this.wrapText(layout.text, width - 2)
    lines.forEach((line) => {
      console.log("│ " + line.padEnd(width - 1) + "│")
    })

    console.log("└" + "─".repeat(width) + "┘")
  }
}
```

### Capabilities Profiles

```typescript
// Predefined device profiles
const CAPABILITY_PROFILES = {
  "even-realities-g1": {
    hasDisplay: true,
    hasCamera: false,
    hasMicrophone: true,
    hasSpeakers: true,
    modelName: "Even Realities G1",
  },
  "mentra-live": {
    hasDisplay: false,
    hasCamera: true,
    hasMicrophone: true,
    hasSpeakers: true,
    modelName: "Mentra Live",
  },
  "vuzix-z100": {
    hasDisplay: true,
    hasCamera: false,
    hasMicrophone: true,
    hasSpeakers: true,
    modelName: "Vuzix Z100",
  },
}
```

## Cloud Client Library Design

The `cloud-client` library will be a **headless client** that abstracts the MentraOS Cloud API.

### Purpose

- Shared library used by both mobile app and CLI tool
- Handles all client-to-cloud communication
- Provides clean, typed interface for client applications

### Key Responsibilities

1. WebSocket connection management to cloud
2. REST API calls to cloud
3. Event sending (transcription, button presses, etc.)
4. Message receiving (display updates, audio, dashboard)
5. Session lifecycle (start/stop apps)
6. Authentication and token management
7. Reconnection and error handling

### Benefits

- **Code reuse:** Mobile app and CLI share same cloud interface
- **Maintainability:** Single source of truth for cloud API
- **Type safety:** Strongly typed API surface
- **Testing:** Can mock cloud-client for app testing

### Before Implementation

We must first:

1. **Audit mobile client code** to identify all cloud APIs used
2. **Document WebSocket message protocol** (client ↔ cloud)
3. **Document REST endpoints** used by client
4. **Design cloud-client API interface**
5. **Update this spec** with concrete implementation details

## Success Criteria

1. ✅ Simulates complete session lifecycle (webhook → WebSocket → events)
2. ✅ Sends all major StreamType events
3. ✅ Displays all layout types correctly in terminal
4. ✅ Shows audio playback requests
5. ✅ Shows dashboard updates
6. ✅ Interactive mode is intuitive
7. ✅ Works with localhost apps
8. ✅ Clear visual output

## Error Handling

```bash
# App server not running
$ mentra client com.example.app --local
✗ Failed to connect to app server
  Is your app running? Try: bun run dev

# Invalid package name
$ mentra client invalid-name
✗ Invalid package name format
  Use reverse-domain notation: com.example.app

# App doesn't handle webhook
$ mentra client com.example.app
✗ Webhook failed: 404 Not Found
  Ensure your app has /webhook endpoint configured

# WebSocket connection timeout
$ mentra client com.example.app
⚠  App did not connect via WebSocket
  Check app logs for connection errors
```

## Future Enhancements (Phase 2)

- [ ] Scripted test scenarios (JSON files)
- [ ] Session recording and replay
- [ ] Multiple simultaneous sessions
- [ ] Network simulation (latency, drops)
- [ ] Integration with mentra tunnel
- [ ] CI/CD test runner mode
- [ ] Snapshot testing for layouts
- [ ] Browser-based simulator UI (Phase 3)

## Related Commands

- `mentra init` - Creates app project
- `mentra tunnel` - Exposes app server
- `mentra app create` - Registers app

## Open Questions & Next Steps

### Critical Prerequisites

1. **API Surface Audit**
   - What WebSocket messages does client send/receive to/from cloud?
   - What REST APIs does mobile client use?
   - Where is this code? (Scattered across `routes/` and `api/client/`)

2. **Authentication Model**
   - How does mentra client authenticate with cloud?
   - Use CLI token? Separate client token? Test user credentials?

3. **Session Management**
   - How does client tell cloud to start/stop an app?
   - What's the actual message protocol?

4. **Device Capabilities**
   - How does client tell cloud what hardware it has?
   - When/how are capabilities sent?

### Implementation Blockers

- Cannot implement `mentra client` without knowing client-cloud API
- Cannot design `cloud-client` library without API documentation
- Current mobile client code needs to be audited

### Action Plan

1. Audit mobile client WebSocket usage (`websocket-glasses.service.ts` shows cloud side)
2. Audit mobile client REST API usage
3. Document complete API surface
4. Design `cloud-client` library interface
5. Update this spec with concrete details
6. Begin implementation

**Status:** Spec is intentionally incomplete pending API surface documentation.

## Resources

- [MentraOS Core Concepts](https://docs.mentra.glass/core-concepts)
- [App Lifecycle](https://docs.mentra.glass/app-lifecycle)
- [Events Reference](https://docs.mentra.glass/events)
- [Layouts Reference](https://docs.mentra.glass/layouts)
- [SDK Message Types](https://github.com/Mentra-Community/MentraOS/tree/main/cloud/packages/sdk/src/types)
