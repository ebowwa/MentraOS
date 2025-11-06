# MentraOS CLI Stretch Goals

**Status:** Spec Complete - Ready for Implementation  
**Date:** January 2025  
**Priority:** High Value Developer Experience Improvements

---

## 🎯 Overview

Three high-impact CLI commands to dramatically improve the MentraOS developer experience:

1. **`mentra init`** - Scaffold new apps in 60 seconds
2. **`mentra tunnel`** - Replace ngrok with zero-config tunneling
3. **`mentra client`** - Test apps without physical hardware

These commands solve the three biggest pain points in the current development workflow.

---

## 📊 Impact Summary

| Command         | Problem Solved             | Time Saved        | Hardware Needed     |
| --------------- | -------------------------- | ----------------- | ------------------- |
| `mentra init`   | Blank canvas, manual setup | 15-30 min → 2 min | None                |
| `mentra tunnel` | ngrok setup, manual config | 5-10 min → 30 sec | None                |
| `mentra client` | Physical glasses required  | N/A               | **Eliminates need** |

**Combined Impact:** Reduce time-to-first-test from 30+ minutes to under 5 minutes.

---

## 🚀 Commands

### 1. `mentra init` - Project Scaffolding

**Problem:** Developers face a blank canvas when starting a new app. Takes 15-30 minutes to set up boilerplate.

**Solution:** Scaffold complete project structure with one command.

```bash
$ mentra init
Welcome to MentraOS! Let's create your app.

? App package name: com.example.translator
? App display name: Live Translator
? App type: Standard (with display)
? Choose a template: Basic (minimal starting point)
? Server port: 3000

Creating your app...
✓ Created directory structure
✓ Generated package.json with @mentra/sdk
✓ Created AppServer boilerplate
✓ Created .env.example
✓ Installed dependencies

Success! Created translator-app

Next steps:
  1. cd translator-app
  2. Copy .env.example to .env and add credentials
  3. bun run dev
  4. mentra tunnel
  5. Register at console.mentra.glass
```

**Key Features:**

- Multiple templates (basic, ai-assistant, captions, camera, translation)
- Interactive and non-interactive modes
- Generates working code with best practices
- Includes README, .gitignore, tsconfig.json
- Zero manual file creation needed

**Spec:** [cli-init/cli-init-spec.md](./cli-init/cli-init-spec.md)

---

### 2. `mentra tunnel` - Zero-Config Tunneling

**Problem:** Developers need to expose localhost so MentraOS Cloud can connect. Current workflow requires ngrok account, static domain setup, and manual console updates. Takes 5-10 minutes.

**Solution:** One command creates tunnel, gets public URL, and auto-updates console.

```bash
$ mentra tunnel

🌐 Creating tunnel...
✓ Tunnel established

Local:      http://localhost:3000
Public URL: https://dev-a8f3d2e1.mentra.dev

✓ Updated app publicUrl in console
✓ Saved tunnel config to .mentrarc

Tunnel is ready! Press Ctrl+C to stop.

[13:45:32] POST /webhook (session_request) - 200 OK in 45ms
[13:45:33] WebSocket connected - session: abc-123
```

**Key Features:**

- Persistent URLs per project (stored in `.mentrarc`)
- Auto-updates app `publicUrl` in console
- Zero external dependencies or accounts
- Automatic SSL/TLS
- Shows live request logs
- Replaces entire ngrok workflow

**Implementation:** Cloudflare Tunnel (Phase 1) → Custom tunnel server (Phase 2)

**Spec:** [cli-tunnel/cli-tunnel-spec.md](./cli-tunnel/cli-tunnel-spec.md)

---

### 3. `mentra client` - Hardware-Free Testing

**Problem:** Developers need $300-500 smart glasses to test apps. Can't test during development, can't automate tests, team members without hardware can't contribute.

**Solution:** Simulate complete user session from terminal.

```bash
$ mentra client com.example.translator

✓ Connected to MentraOS Cloud
✓ Session started: abc-123

Session active. Type 'help' for commands.

mentra> say "hello world"
📤 Sending transcription: "hello world"

📥 Layout update received:
┌─────────────────────────────────────┐
│ TextWall                            │
├─────────────────────────────────────┤
│ You said: hello world               │
└─────────────────────────────────────┘

mentra> button tap
📤 Sending button press: tap

📥 Layout update received:
┌─────────────────────────────────────┐
│ ReferenceCard                       │
├─────────────────────────────────────┤
│ Button pressed!                     │
└─────────────────────────────────────┘
```

**Modes:**

1. **Interactive Mode** (default)
   - Type commands in terminal
   - See real-time responses
   - Perfect for manual testing

2. **Script Mode** (automated testing)

   ```bash
   $ mentra client com.example.app --script tests.json
   Running test script: tests.json
   ✓ [1/5] Test: Greeting - PASS (125ms)
   ✓ [2/5] Test: Translation - PASS (342ms)
   Results: 5/5 tests passed (100%)
   ```

3. **AI Agent Mode** (exploratory testing)

   ```bash
   $ mentra client com.example.app --ai
   🤖 AI Testing Agent started
   [AI] Testing basic functionality... ✓
   [AI] Testing edge cases... ⚠ Found 3 issues
   [AI] Testing rapid inputs... ⚠ 2/10 timed out

   Summary: 23 passed, 3 warnings, 1 critical issue
   ```

**Key Features:**

- Simulates complete session lifecycle (webhook → WebSocket → events)
- Send all event types (transcription, buttons, sensors, camera)
- Display all layout types (TextWall, ReferenceCard, etc.)
- Automated testing via JSON scripts
- AI agent for exploratory testing
- Works with local or remote servers
- **Zero hardware required**

**Spec:** [cli-client/cli-client-spec.md](./cli-client/cli-client-spec.md)

---

## 🎭 Complete Developer Workflow

### Before (Current)

```bash
# 30+ minutes, multiple tools, manual steps

1. Create project files manually (15 min)
2. Install ngrok, create account (5 min)
3. Set up static domain in ngrok dashboard (5 min)
4. Run ngrok command (2 min)
5. Copy URL, update console manually (2 min)
6. Put on glasses, test (slow iteration)
7. Take off glasses, make changes, repeat
```

### After (With New Commands)

```bash
# Under 5 minutes, one tool, automated

1. mentra init                    # 2 min (includes dependency install)
2. cd my-app && bun run dev &    # instant
3. mentra tunnel                  # 30 sec (auto-updates console)
4. mentra client com.example.app # instant, test without hardware

# Rapid iteration:
# - Edit code
# - Test with mentra client
# - No glasses needed until final testing
```

---

## 📈 Implementation Roadmap

### Phase 1: MVP (1-2 weeks)

- **Week 1:** `mentra init` + `mentra tunnel`
  - Day 1-2: mentra init (templates, scaffolding)
  - Day 3-5: mentra tunnel (Cloudflare Tunnel integration)
- **Week 2:** `mentra client`
  - Day 1-3: Interactive mode
  - Day 4-5: Script mode

### Phase 2: Enhancements (2-3 weeks)

- AI agent mode for client
- Custom tunnel server (replace Cloudflare)
- Advanced testing features
- CI/CD integration examples

### Phase 3: Polish (1 week)

- Documentation
- Tutorial videos
- Example scripts
- Community templates

---

## 🎯 Success Metrics

### Quantitative

- Time to first test: 30 min → 5 min (83% reduction)
- Setup steps: 7 → 3 (57% fewer)
- External tools needed: 2 (npm, ngrok) → 1 (npm)
- Hardware barrier: $300-500 → $0

### Qualitative

- ✅ New developers can start building immediately
- ✅ Testing doesn't require physical hardware
- ✅ Automated testing becomes possible
- ✅ Team members without glasses can contribute
- ✅ Faster iteration cycle
- ✅ Better developer satisfaction

---

## 🔧 Technical Details

### Dependencies

- **mentra init:** None (pure file generation)
- **mentra tunnel:** Cloudflare Tunnel binary (bundled)
- **mentra client:** WebSocket client, terminal UI libraries

### Architecture Decisions

**mentra init:**

- Template system extensible for community contributions
- TypeScript-first but supports JavaScript
- Bun-first but npm compatible

**mentra tunnel:**

- Phase 1: Cloudflare Tunnel (fast to ship)
- Phase 2: Custom tunnel server (full control)
- Persistent URLs tied to app package name + machine ID

**mentra client:**

- Connects to MentraOS Cloud as simulated user
- Triggers real webhook to developer's app
- Full WebSocket lifecycle simulation
- Terminal-based UI (no GUI for MVP)

---

## 📚 Documentation Requirements

Each command needs:

- [ ] Spec document (✅ Done)
- [ ] Architecture document
- [ ] User guide
- [ ] API reference
- [ ] Example scripts
- [ ] Troubleshooting guide
- [ ] Video tutorial

---

## 🤝 Related Work

### Completed

- ✅ CLI Phase 1 (auth, app management, org management)
- ✅ CLI Keys infrastructure
- ✅ Backend API routes for CLI
- ✅ Console UI for CLI key management

### In Progress

- 🔄 Comprehensive specs for stretch goals

### Next

- ⏳ Implementation of init, tunnel, client commands

---

## 🎓 Prior Art / Inspiration

- **mentra init:** Similar to `create-react-app`, `npm init`, `cargo new`
- **mentra tunnel:** Similar to ngrok, but integrated and zero-config
- **mentra client:** Similar to Postman/Insomnia but for WebSocket sessions

---

## 💡 Future Ideas (Phase 3+)

### Additional Commands

- `mentra dev` - Integrated dev environment with hot reload
- `mentra deploy` - One-command deployment to production
- `mentra logs` - Real-time log streaming from production
- `mentra template` - Community template marketplace

### Enhancements

- Browser-based simulator UI
- VS Code extension integration
- GitHub Actions integration
- Docker/Docker Compose templates
- Multi-user session testing
- Performance profiling

---

## 📞 Get Involved

- **Specs:** [cli-init](./cli-init/), [cli-tunnel](./cli-tunnel/), [cli-client](./cli-client/)
- **GitHub Issues:** Tag with `cli-stretch-goals`
- **Discord:** #cli-development channel
- **Feedback:** Open an issue or PR with suggestions

---

## ✅ Checklist

### Documentation

- [x] Write specs for all three commands
- [x] Create overview document
- [ ] Write architecture docs
- [ ] Create user guides
- [ ] Write tutorial content

### Implementation

- [ ] mentra init - scaffolding system
- [ ] mentra init - template library
- [ ] mentra tunnel - Cloudflare integration
- [ ] mentra tunnel - auto-update logic
- [ ] mentra client - session simulation
- [ ] mentra client - interactive mode
- [ ] mentra client - script runner
- [ ] mentra client - AI agent mode

### Testing

- [ ] Unit tests for each command
- [ ] Integration tests
- [ ] E2E workflow tests
- [ ] Cross-platform testing

### Release

- [ ] Beta release to team
- [ ] Gather feedback
- [ ] Polish based on feedback
- [ ] Public release
- [ ] Documentation site update
- [ ] Tutorial videos
- [ ] Social media announcement

---

**Status:** Ready for implementation! 🚀

All specs are complete and detailed. Pick any command to start implementing.

**Recommended order:**

1. `mentra init` (quickest to implement, immediate value)
2. `mentra tunnel` (natural pairing with init)
3. `mentra client` (most complex, highest impact)
