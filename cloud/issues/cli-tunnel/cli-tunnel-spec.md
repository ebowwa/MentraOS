# MentraOS CLI Tunnel Command Spec

Command to expose local development server to the internet, replacing ngrok in the MentraOS development workflow.

## Problem

Developers need to expose their local app server to the internet so MentraOS Cloud can send webhooks and establish connections:

- **Current workflow is painful:**
  1. Install ngrok
  2. Create ngrok account
  3. Generate static domain in dashboard
  4. Run `ngrok http --url=<static-url> 3000`
  5. Copy URL from ngrok output
  6. Go to console.mentra.glass
  7. Update app's publicUrl
  8. Restart app in MentraOS mobile app
- **Every time server restarts:**
  - Re-run ngrok command
  - URL might change (if not using static domain)
  - Must update console again
- **Problems:**
  - 5-10 minutes of setup for new developers
  - External dependency (ngrok account)
  - Easy to forget steps
  - Context switching between terminal, browser, and ngrok dashboard
  - Costs money for persistent URLs

**Target:** One command (`mentra tunnel`) replaces entire ngrok workflow in < 30 seconds.

## Goals

### Primary

1. Single command to expose local server
2. Persistent URLs per project (stored in `.mentrarc`)
3. Auto-update app's `publicUrl` in MentraOS console
4. Zero external dependencies or accounts needed
5. Automatic SSL/TLS (HTTPS)
6. Works on all platforms (macOS, Linux, Windows)
7. Clear status display with public URL

### Non-Goals

- Custom domain names (use tunnel subdomains)
- Load balancing (single developer use case)
- Advanced networking features (VPNs, etc.)
- Monitoring/analytics dashboard
- Webhook inspection UI (Phase 2)

## User Experience

### First Run (No .mentrarc)

```bash
$ mentra tunnel
🔍 No tunnel configuration found
? Which app is this for?
  ○ com.example.translator
  ● com.example.myapp
  ○ com.example.captions
  ○ Create new app

? Server port: (3000) › 3000

🌐 Creating tunnel...
✓ Tunnel established
✓ SSL certificate provisioned

Local:      http://localhost:3000
Public URL: https://dev-a8f3d2e1.mentra.dev

✓ Updated app publicUrl in console
✓ Saved tunnel config to .mentrarc

Tunnel is ready! Press Ctrl+C to stop.

[Tunnel running, showing request logs...]
```

### Subsequent Runs (Has .mentrarc)

```bash
$ mentra tunnel
🔍 Found tunnel config for: com.example.myapp

Local:      http://localhost:3000
Public URL: https://dev-a8f3d2e1.mentra.dev

✓ Tunnel connected
✓ App publicUrl is up to date

Tunnel is ready! Press Ctrl+C to stop.

[13:45:32] POST /webhook (session_request) - 200 OK in 45ms
[13:45:33] WebSocket connected - session: abc-123
[13:45:35] POST /webhook (session_request) - 200 OK in 23ms
```

### Different Port

```bash
$ mentra tunnel --port 8080
🔍 Found tunnel config for: com.example.myapp
⚠  Port changed from 3000 to 8080

Local:      http://localhost:8080
Public URL: https://dev-a8f3d2e1.mentra.dev

✓ Tunnel connected
✓ Updated .mentrarc with new port

Tunnel is ready! Press Ctrl+C to stop.
```

### Status Check

```bash
$ mentra tunnel status
Tunnel Status: CONNECTED
App:           com.example.myapp
Local:         http://localhost:3000
Public:        https://dev-a8f3d2e1.mentra.dev
Uptime:        2h 34m
Requests:      1,247
Last request:  3 seconds ago

$ mentra tunnel status
Tunnel Status: DISCONNECTED
Last connected: 5 minutes ago
```

### Stop Tunnel

```bash
$ mentra tunnel stop
✓ Tunnel stopped

# Or just Ctrl+C when running
^C
⚠  Tunnel stopped
ℹ  Run 'mentra tunnel' to restart
```

### Show URL Only

```bash
$ mentra tunnel url
https://dev-a8f3d2e1.mentra.dev

# Useful for scripting
$ export PUBLIC_URL=$(mentra tunnel url)
```

## Flags & Options

```
mentra tunnel [options]

Options:
  --port <port>         Local port to tunnel (default: from .mentrarc or 3000)
  --app <package>       Package name of app to tunnel for
  --no-update           Don't auto-update app publicUrl in console
  --persist             Create persistent URL (reuse across sessions)
  --subdomain <name>    Request specific subdomain (e.g., myapp.mentra.dev)
  --log-requests        Show detailed request logs
  --quiet               Minimal output
  -h, --help            Show help

Commands:
  mentra tunnel          Start tunnel (default command)
  mentra tunnel status   Check tunnel status
  mentra tunnel stop     Stop running tunnel
  mentra tunnel url      Print public URL only
  mentra tunnel reset    Reset tunnel config (get new URL)
```

## Implementation Architecture

### Tunnel Architecture Options

#### Option A: Cloudflare Tunnel (Recommended)

**Pros:**

- Free tier available
- Excellent performance (CDN)
- Built-in DDoS protection
- Auto SSL/TLS
- Cloudflare's infrastructure

**Cons:**

- External dependency on Cloudflare
- Requires cloudflared binary (can bundle)

**Implementation:**

```typescript
import {spawn} from "child_process"

class CloudflareTunnel {
  private process: ChildProcess

  async start(localPort: number): Promise<string> {
    // Start cloudflared tunnel
    this.process = spawn("cloudflared", ["tunnel", "--url", `http://localhost:${localPort}`, "--no-autoupdate"])

    // Parse output for tunnel URL
    return this.waitForUrl()
  }
}
```

#### Option B: Custom Tunnel Server (Full Control)

**Pros:**

- No external dependencies
- Full control over infrastructure
- Can offer free persistent URLs
- Integrated with MentraOS auth

**Cons:**

- Must operate tunnel infrastructure
- Need to handle SSL certificates
- Need to implement tunnel protocol

**Architecture:**

```
┌─────────────────────┐
│ Developer Machine   │
│                     │
│ mentra tunnel       │
│   ↓ WebSocket       │
└─────────────────────┘
         ↓
┌─────────────────────┐
│ tunnel.mentra.dev   │
│ (Tunnel Server)     │
│                     │
│ - Route requests    │
│ - Manage tunnels    │
│ - Issue subdomains  │
└─────────────────────┘
         ↓
┌─────────────────────┐
│ MentraOS Cloud      │
│ Sends webhooks →    │
│ dev-abc123.mentra.dev
└─────────────────────┘
```

#### Option C: ngrok SDK Wrapper (Quick MVP)

**Pros:**

- Fastest to implement
- Battle-tested
- Good free tier

**Cons:**

- Still requires ngrok account for static URLs
- External dependency
- Defeats purpose of "zero setup"

**Not recommended** - goes against project goals.

### Recommended: Hybrid Approach

**Phase 1 (MVP):** Use Cloudflare Tunnel

- Bundle `cloudflared` binary with CLI
- No user account needed
- Fast implementation

**Phase 2:** Custom Tunnel Server

- Migrate to Mentra-hosted infrastructure
- Persistent URLs for registered apps
- Better integration with MentraOS auth

## Technical Implementation

### File Structure

```
cli/src/commands/tunnel/
├── index.ts              # Main tunnel command
├── cloudflare.ts         # Cloudflare Tunnel implementation
├── status.ts             # Status checking
└── config.ts             # Tunnel configuration

cli/bin/
├── cloudflared-linux     # Bundled binaries
├── cloudflared-darwin
└── cloudflared-win.exe
```

### Tunnel Configuration (`.mentrarc`)

```json
{
  "version": "1.0",
  "packageName": "com.example.myapp",
  "port": 3000,
  "tunnel": {
    "id": "a8f3d2e1-4b5c-6d7e-8f9a-0b1c2d3e4f5a",
    "url": "https://dev-a8f3d2e1.mentra.dev",
    "createdAt": "2024-01-15T10:30:00Z",
    "provider": "cloudflare"
  }
}
```

### Core Logic

```typescript
export class TunnelCommand {
  async start(options: TunnelOptions): Promise<void> {
    // 1. Load or create tunnel config
    const config = await this.loadTunnelConfig(options)

    // 2. Check if app exists in console
    const app = await this.getApp(config.packageName)
    if (!app) {
      throw new Error(`App ${config.packageName} not found. Run 'mentra app create' first.`)
    }

    // 3. Start tunnel
    const tunnel = await this.createTunnel(config.port)
    const publicUrl = tunnel.url

    console.log(`Public URL: ${publicUrl}`)

    // 4. Update app publicUrl in console (unless --no-update)
    if (!options.noUpdate) {
      await this.updateAppUrl(config.packageName, publicUrl)
      console.log("✓ Updated app publicUrl in console")
    }

    // 5. Save tunnel config
    await this.saveTunnelConfig(config, tunnel)

    // 6. Display status and keep running
    await this.displayStatus(tunnel)
    await this.monitorTunnel(tunnel)
  }

  private async createTunnel(port: number): Promise<Tunnel> {
    // Use Cloudflare Tunnel
    const cloudflared = new CloudflareTunnel()
    return await cloudflared.start(port)
  }

  private async monitorTunnel(tunnel: Tunnel): Promise<void> {
    // Log incoming requests
    tunnel.on("request", (req) => {
      const timestamp = new Date().toLocaleTimeString()
      console.log(`[${timestamp}] ${req.method} ${req.path} - ${req.status} in ${req.duration}ms`)
    })

    // Handle disconnection
    tunnel.on("disconnect", () => {
      console.error("⚠  Tunnel disconnected")
      process.exit(1)
    })

    // Keep running until Ctrl+C
    await new Promise(() => {})
  }
}
```

### Request Logging

```typescript
interface TunnelRequest {
  method: string
  path: string
  status: number
  duration: number
  timestamp: Date
}

class TunnelLogger {
  private requests: TunnelRequest[] = []

  logRequest(req: TunnelRequest): void {
    this.requests.push(req)

    // Console output
    const time = req.timestamp.toLocaleTimeString()
    const color = req.status < 400 ? "✓" : "✗"
    console.log(`[${time}] ${color} ${req.method} ${req.path} - ${req.status} (${req.duration}ms)`)
  }

  getStats(): TunnelStats {
    return {
      totalRequests: this.requests.length,
      successRate: this.calculateSuccessRate(),
      avgDuration: this.calculateAvgDuration(),
    }
  }
}
```

### Auto-Update App URL

```typescript
async function updateAppPublicUrl(packageName: string, publicUrl: string): Promise<void> {
  // Use existing CLI API client
  await api.updateApp(packageName, {
    publicUrl: publicUrl,
  })
}
```

### Persistent Tunnel IDs

```typescript
// Generate stable tunnel ID from app package name + machine ID
function generateTunnelId(packageName: string): string {
  const machineId = getMachineId() // From OS
  const hash = crypto.createHash("sha256").update(`${packageName}-${machineId}`).digest("hex").substring(0, 16)

  return `dev-${hash}`
}

// This ensures same URL on same machine for same app
// Different machines get different URLs (as expected)
```

## Security Considerations

### SSL/TLS

- All tunnels use HTTPS
- Cloudflare provides automatic certificates
- No HTTP-only tunnels allowed

### Authentication

- Tunnel requests should validate origin
- Consider adding shared secret for tunnel → local server
- Rate limiting on tunnel endpoints

### Subdomain Squatting

- Limit subdomain length/characters
- Don't allow common names (api, www, admin, etc.)
- Tie subdomains to authenticated users

### Resource Limits

- Max connections per tunnel
- Request rate limiting
- Bandwidth limits (reasonable for dev use)

## Error Handling

```bash
# Port already in use
$ mentra tunnel --port 3000
✗ Port 3000 is already in use
  Is your dev server running? Try a different port with --port <number>

# App not found
$ mentra tunnel
✗ App com.example.myapp not found in console
  Run 'mentra app create' to register your app first

# Network error
$ mentra tunnel
✗ Failed to establish tunnel
  Check your internet connection and try again
  Error: ECONNREFUSED

# Not authenticated
$ mentra tunnel
✗ Not authenticated
  Run 'mentra auth <token>' to authenticate first

# Tunnel service down
$ mentra tunnel
✗ Tunnel service unavailable
  The tunnel service may be temporarily down
  Try again in a few minutes or check status.mentra.glass
```

## Status Display

### Active Tunnel

```
┌─────────────────────────────────────────────────────────┐
│ MentraOS Tunnel                                         │
├─────────────────────────────────────────────────────────┤
│ Status:   ● CONNECTED                                   │
│ App:      com.example.myapp                             │
│ Local:    http://localhost:3000                         │
│ Public:   https://dev-a8f3d2e1.mentra.dev              │
│ Uptime:   2h 34m                                        │
│ Requests: 1,247 (12/min avg)                           │
├─────────────────────────────────────────────────────────┤
│ Recent Activity:                                        │
│ [13:45:32] POST /webhook - 200 OK (45ms)              │
│ [13:45:33] WS connect - session: abc-123               │
│ [13:45:35] POST /webhook - 200 OK (23ms)              │
└─────────────────────────────────────────────────────────┘

Press Ctrl+C to stop
```

### Quiet Mode

```bash
$ mentra tunnel --quiet
https://dev-a8f3d2e1.mentra.dev
```

## Integration with Other Commands

### With `mentra init`

```bash
# After mentra init
$ cd my-app
$ bun run dev &
$ mentra tunnel
# Auto-detects app from .mentrarc
# Auto-updates console
# Ready to test!
```

### With `mentra app create`

```bash
# Create app with tunnel URL
$ mentra tunnel --port 3000 &
$ export TUNNEL_URL=$(mentra tunnel url)
$ mentra app create \
  --package-name com.example.app \
  --name "My App" \
  --public-url $TUNNEL_URL
```

## Testing Strategy

### Unit Tests

```typescript
describe("TunnelCommand", () => {
  test("generates stable tunnel ID for same app", () => {
    const id1 = generateTunnelId("com.example.app")
    const id2 = generateTunnelId("com.example.app")
    expect(id1).toBe(id2)
  })

  test("validates port number", () => {
    expect(validatePort(3000)).toBe(true)
    expect(validatePort(80)).toBe(false) // privileged
    expect(validatePort(99999)).toBe(false) // out of range
  })
})
```

### Integration Tests

```bash
# Start tunnel and verify it works
$ mentra tunnel --port 3000 &
$ sleep 5
$ TUNNEL_URL=$(mentra tunnel url)
$ curl $TUNNEL_URL/health
# Should return 200 OK

# Test auto-update
$ mentra app get com.example.app | grep publicUrl
# Should show tunnel URL

# Test persistence
$ mentra tunnel stop
$ mentra tunnel
# Should use same URL as before
```

### End-to-End Test

```typescript
// Simulate full developer workflow
test("full tunnel workflow", async () => {
  // 1. Init app
  await exec("mentra init --package-name com.test.app --yes")

  // 2. Start dev server
  const server = exec("cd test-app && bun run dev")
  await sleep(2000)

  // 3. Start tunnel
  const tunnel = exec("mentra tunnel --port 3000")
  await waitForTunnel()

  // 4. Verify tunnel URL
  const url = await exec("mentra tunnel url")
  expect(url).toMatch(/https:\/\/dev-[a-z0-9]+\.mentra\.dev/)

  // 5. Test webhook delivery
  const response = await fetch(`${url}/webhook`, {
    method: "POST",
    body: JSON.stringify({type: "session_request"}),
  })
  expect(response.status).toBe(200)

  // Cleanup
  tunnel.kill()
  server.kill()
})
```

## Success Criteria

1. ✅ Replaces ngrok completely (no account needed)
2. ✅ Single command starts tunnel in < 5 seconds
3. ✅ Persistent URLs across restarts
4. ✅ Auto-updates app publicUrl
5. ✅ Clear status display with request logs
6. ✅ Works on macOS, Linux, Windows
7. ✅ Zero configuration for basic use
8. ✅ Handles disconnects gracefully

## Future Enhancements (Phase 2)

- [ ] Request inspector UI (like ngrok's web interface)
- [ ] Webhook replay for debugging
- [ ] Custom domains (bring your own domain)
- [ ] Team tunnels (share tunnel with teammates)
- [ ] Tunnel analytics dashboard
- [ ] Multiple simultaneous tunnels
- [ ] HTTP/2 and WebSocket support improvements
- [ ] Traffic recording/playback for testing
- [ ] Integration with mentra dev command

## Pricing / Resource Considerations

### Free Tier (MVP)

- Unlimited tunnels
- Persistent URLs per project
- Basic request logging
- Community support

### Potential Paid Features (Future)

- Custom domains
- Advanced analytics
- Team collaboration features
- SLA guarantees
- Priority support

## Related Commands

- `mentra init` - Creates project (includes .mentrarc)
- `mentra app create` - Registers app (uses tunnel URL)
- `mentra app update` - Can update publicUrl manually
- `mentra client` - Tests app (connects to tunnel URL)

## Documentation Requirements

- Quickstart guide integration
- Troubleshooting section
- Comparison with ngrok (migration guide)
- Network requirements (firewall rules, etc.)
- Custom domain setup (Phase 2)

## Resources

- [Cloudflare Tunnel Docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)
- [ngrok Alternative Options](https://github.com/anderspitman/awesome-tunneling)
- [MentraOS Quickstart](https://docs.mentra.glass/quickstart)
