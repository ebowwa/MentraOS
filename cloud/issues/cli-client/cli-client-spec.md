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
       │ WebSocket
       ▼
┌──────────────┐      HTTP POST       ┌──────────────┐
│ MentraOS     │      (webhook)       │  Developer's │
│   Cloud      │─────────────────────→│  App Server  │
│              │                       │              │
│              │←─────────────────────│              │
│              │      WebSocket        │              │
└──────────────┘                       └──────────────┘
```

**Session Flow:**

1. User starts app on glasses
2. Cloud sends POST webhook to app's publicUrl: `{ type: "session_request", sessionId, userId }`
3. App receives webhook, connects to cloud via WebSocket
4. App sends `CONNECTION_INIT` message with sessionId, packageName, apiKey
5. Cloud validates and sends back `CONNECTION_ACK` with settings, capabilities
6. App subscribes to desired streams (e.g., transcription, button_press)
7. Cloud sends `DATA_STREAM` messages to app with event data
8. App sends `DISPLAY_REQUEST` messages to show content
9. Session ends when user stops app or disconnects

### What `mentra client` Simulates

```
┌──────────────┐
│mentra client │  (Simulates: mobile app + glasses + user)
└──────┬───────┘
       │ Triggers webhook + sends events
       ▼
┌──────────────┐      HTTP POST       ┌──────────────┐
│ MentraOS     │      (webhook)       │  Developer's │
│   Cloud      │─────────────────────→│  App Server  │
│   (real)     │                       │   (local)    │
│              │←─────────────────────│              │
│              │      WebSocket        │              │
└──────┬───────┘                       └──────────────┘
       │
       │ Relays app responses back to client
       ▼
┌──────────────┐
│mentra client │  (Displays layouts, logs messages)
└──────────────┘
```

**Note:** The exact implementation depends on whether we:

- Option A: Connect through real MentraOS Cloud (requires cloud API support)
- Option B: Simulate cloud locally and connect directly to app
- Option C: Hybrid approach

This spec remains flexible on implementation approach until we clarify with backend team.

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
├── session.ts            # Session management & WebSocket
├── events.ts             # Event simulation & sending
├── display.ts            # Layout rendering in terminal
├── interactive.ts        # Interactive mode REPL
└── capabilities.ts       # Device capability profiles
```

### Core Session Flow

```typescript
export class ClientSimulator {
  private appServerUrl: string
  private packageName: string
  private sessionId: string
  private userId: string
  private capabilities: Capabilities

  async start(): Promise<void> {
    // 1. Generate session ID
    this.sessionId = generateSessionId()

    // 2. Send webhook to app server
    await this.sendWebhook()

    // 3. Wait for app to connect to cloud (via intercepting WebSocket)
    // OR connect directly to app if implementing local simulation
    await this.waitForAppConnection()

    // 4. Monitor messages from app
    this.setupMessageHandlers()

    // 5. Enter interactive mode
    await this.startInteractiveMode()
  }

  private async sendWebhook(): Promise<void> {
    const webhook = {
      type: "session_request",
      sessionId: this.sessionId,
      userId: this.userId,
      timestamp: new Date().toISOString(),
    }

    await fetch(`${this.appServerUrl}/webhook`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(webhook),
    })
  }

  async sendEvent(streamType: StreamType, data: any): Promise<void> {
    // Send event to cloud which relays to app
    // OR send directly to app if implementing local mode
    const message = {
      type: "data_stream",
      streamType,
      sessionId: this.sessionId,
      data,
      timestamp: new Date(),
    }

    // Implementation depends on architecture choice
    await this.sendToCloud(message)
  }

  private setupMessageHandlers(): void {
    // Handle display requests from app
    this.on("display_request", (msg) => {
      this.renderLayout(msg.layout, msg.durationMs)
    })

    // Handle audio requests
    this.on("audio_playback", (msg) => {
      this.displayAudioRequest(msg)
    })

    // Handle dashboard updates
    this.on("dashboard_update", (msg) => {
      this.displayDashboard(msg)
    })
  }
}
```

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

## Implementation Approaches

### Option A: Cloud Integration (Ideal)

- `mentra client` connects to real MentraOS Cloud
- Cloud relays events to app
- App responses come back through cloud
- **Requires:** Backend API support for CLI clients

### Option B: Local Simulation (MVP)

- `mentra client` simulates cloud behavior locally
- Sends webhook to app server
- Intercepts/mocks WebSocket connection
- **Advantage:** Works without backend changes

### Option C: Hybrid

- Use real cloud for session management
- Direct WebSocket to app for messages
- **Balance:** Some cloud integration, some local control

**Recommendation:** Start with Option B (Local Simulation) for MVP, migrate to Option A when backend supports it.

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

## Open Questions

1. **Cloud integration approach** - Which option (A, B, or C)?
2. **WebSocket interception** - How to relay messages in local mode?
3. **Authentication** - Does mentra client need CLI auth token?
4. **Photo simulation** - How to simulate camera captures?

These questions should be answered before implementation begins.

## Resources

- [MentraOS Core Concepts](https://docs.mentra.glass/core-concepts)
- [App Lifecycle](https://docs.mentra.glass/app-lifecycle)
- [Events Reference](https://docs.mentra.glass/events)
- [Layouts Reference](https://docs.mentra.glass/layouts)
- [SDK Message Types](https://github.com/Mentra-Community/MentraOS/tree/main/cloud/packages/sdk/src/types)
