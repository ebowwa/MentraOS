# MentraOS CLI Init Command Spec

Command to scaffold a new MentraOS app project with best practices and sensible defaults.

## Problem

Developers face a blank canvas problem when starting a new MentraOS app:

- No clear project structure
- Must manually set up package.json with SDK
- Need to write boilerplate AppServer code
- Must configure environment variables
- Must manually register app in console
- Easy to miss important setup steps
- Takes 15-30 minutes to get a "Hello World" running

**Target:** From `mentra init` to working app server in under 2 minutes.

## Goals

### Primary

1. Create complete project structure with all necessary files
2. Install @mentra/sdk and dependencies
3. Generate working AppServer boilerplate
4. Create environment variable template
5. Support hardware-specific templates (camera vs display)
6. Interactive prompts with sensible defaults
7. Non-interactive mode for automation
8. Integrate with `mentra app create` when authenticated
9. Auto-populate .env with API key

### Non-Goals

- Git initialization (developer choice)
- Advanced app logic (keep it minimal)
- Multiple framework support (Node.js/Bun only for MVP)
- Docker/deployment configs (separate command)
- VS Code extensions/workspace setup (Phase 2)
- App type selection (defaults to background, changeable later)

## User Experience

### Interactive Mode (Authenticated User)

```bash
$ mentra init
Welcome to MentraOS! Let's create your app.

? App package name: (com.yourname.myapp) › com.example.vision
? App display name: (My App) › Vision Assistant
? Choose a template:
  ● Display (for HUD glasses - shows info on screen)
  ○ Camera (for camera glasses - processes images)
? Server port: (3000) › 3000
? Create directory: (vision-assistant) › vision-app

Checking package name availability...
✓ Package name available

Creating your app...
✓ Created directory structure
✓ Generated package.json
✓ Created AppServer boilerplate
✓ Registered app in MentraOS Cloud (type: background)
✓ Generated API key
✓ Saved credentials to .env
✓ Installed dependencies

Success! Created vision-app

Your app is ready:
  Package: com.example.vision
  API Key: ●●●●●●●● (saved in .env)
  Type: background (can run alongside other apps)

Next steps:
  1. cd vision-app
  2. bun run dev
  3. In another terminal: mentra tunnel
  4. Open MentraOS app on your phone and start "Vision Assistant"

Need help? Visit docs.mentra.glass
```

### Interactive Mode (Not Authenticated)

```bash
$ mentra init
Welcome to MentraOS! Let's create your app.

? App package name: (com.yourname.myapp) › com.example.vision
? App display name: (My App) › Vision Assistant
? Choose a template:
  ● Display (for HUD glasses)
  ○ Camera (for camera glasses)
? Server port: (3000) › 3000

ℹ  Not authenticated - skipping cloud registration
   Run 'mentra auth <token>' to authenticate, then:
   - mentra app create to register your app
   - Get API key from console.mentra.glass

Creating your app...
✓ Created directory structure
✓ Generated package.json
✓ Created AppServer boilerplate
✓ Created .env.example
✓ Installed dependencies

Success! Created vision-assistant

Next steps:
  1. cd vision-assistant
  2. Authenticate: mentra auth <your-cli-token>
  3. Register app: mentra app create --package-name com.example.vision \
                                      --name "Vision Assistant" \
                                      --public-url <your-url>
  4. Copy API key to .env
  5. bun run dev

Or register manually at console.mentra.glass
```

### Package Name Already Taken

```bash
$ mentra init
? App package name: com.example.vision

Checking availability...
✗ Package name 'com.example.vision' is already registered

Try one of these:
  - com.example.vision2
  - com.yourname.vision
  - com.yourcompany.vision

? Try a different package name: › com.example.vision2
✓ Package name available
```

### Non-Interactive Mode (Authenticated)

```bash
$ mentra init \
  --package-name com.example.vision \
  --name "Vision Assistant" \
  --template display \
  --port 3000 \
  --dir vision-app \
  --yes

Checking package name availability...
✓ Package name available

Creating app...
✓ Registered in cloud
✓ API key saved to .env
✓ Project created

Success! Run: cd vision-app && bun run dev
```

### Non-Interactive Mode (Not Authenticated)

```bash
$ mentra init \
  --package-name com.example.vision \
  --template camera \
  --yes

ℹ  Not authenticated - skipping cloud registration

Creating app...
✓ Project created

Next: mentra auth <token> && mentra app create
```

### Flags

```
--package-name <name>    Package name (com.company.app) [required in non-interactive]
--name <name>            Display name (defaults to package name)
--template <template>    display | camera (default: display)
--port <port>            Server port (default: 3000)
--dir <directory>        Target directory (default: derived from package name)
--no-install             Skip npm/bun install
--no-register            Skip cloud registration even if authenticated
--package-manager <pm>   npm | bun (default: auto-detect)
--yes, -y                Use all defaults, no prompts
--help, -h               Show help
```

## Generated Project Structure

### Both Templates (Common Files)

```
vision-app/
├── .env or .env.example  # Environment variables (with or without API key)
├── .gitignore            # Node/Bun ignores
├── .mentrarc             # Local CLI config
├── package.json          # Dependencies and scripts
├── tsconfig.json         # TypeScript config
├── README.md             # Quick start guide
└── src/
    └── index.ts          # Main AppServer file (template-specific)
```

### File Contents

#### `.env` (When Authenticated & Registered)

```env
# MentraOS App Configuration
PORT=3000
PACKAGE_NAME=com.example.vision
MENTRAOS_API_KEY=your_generated_api_key_here

# Your app is registered!
# Start with: bun run dev
# Then run: mentra tunnel
```

#### `.env.example` (When Not Authenticated)

```env
# MentraOS App Configuration
PORT=3000
PACKAGE_NAME=com.example.vision
MENTRAOS_API_KEY=get_from_console_mentra_glass

# Steps to get your API key:
# 1. Visit https://console.mentra.glass
# 2. Register your app with package name: com.example.vision
# 3. Copy the API key (shown once)
# 4. Paste it above and rename this file to .env
```

#### `.mentrarc`

```json
{
  "version": "1.0",
  "packageName": "com.example.vision",
  "port": 3000,
  "template": "display"
}
```

#### `package.json`

```json
{
  "name": "vision-app",
  "version": "0.1.0",
  "description": "MentraOS app: Vision Assistant",
  "type": "module",
  "scripts": {
    "dev": "bun --watch src/index.ts",
    "start": "bun src/index.ts",
    "build": "bun build src/index.ts --outdir ./dist --target bun",
    "tunnel": "mentra tunnel"
  },
  "dependencies": {
    "@mentra/sdk": "latest"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.0.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

#### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "types": ["bun-types"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

#### `src/index.ts` (Display Template)

```typescript
import {AppServer, AppSession} from "@mentra/sdk"

const PORT = parseInt(process.env.PORT || "3000")
const PACKAGE_NAME = process.env.PACKAGE_NAME!
const API_KEY = process.env.MENTRAOS_API_KEY!

class MyApp extends AppServer {
  constructor() {
    super({
      packageName: PACKAGE_NAME,
      apiKey: API_KEY,
      port: PORT,
    })
  }

  /**
   * Called when a user starts your app on their glasses
   */
  protected async onSession(session: AppSession, sessionId: string, userId: string): Promise<void> {
    session.logger.info("Session started", {sessionId, userId})

    // Check if user's glasses have a display
    const hasDisplay = session.capabilities?.hasDisplay

    if (!hasDisplay) {
      session.logger.warn("User glasses do not have a display")
      // Could use audio fallback or show error
      return
    }

    // Show welcome message on display
    session.layouts.showTextWall("Welcome! Say something to get started.")

    // Listen for speech transcription
    session.events.onTranscription((data) => {
      if (data.isFinal) {
        const text = data.text.trim()
        session.logger.info("User said:", {text})

        // Show what they said on the display
        session.layouts.showReferenceCard({
          title: "You said:",
          content: text,
        })
      }
    })

    // Listen for button presses
    session.events.onButtonPress((button) => {
      session.logger.info("Button pressed", {button})
      session.layouts.showTextWall(`Button: ${button.buttonType}`)
    })

    // Handle disconnection
    session.events.onDisconnected(() => {
      session.logger.info("Session ended", {sessionId})
    })
  }
}

// Start the server
const app = new MyApp()
app.start()

console.log(`🚀 App server running on http://localhost:${PORT}`)
console.log(`📦 Package: ${PACKAGE_NAME}`)
console.log(`\nNext steps:`)
console.log(`  1. Run: mentra tunnel`)
console.log(`  2. Open MentraOS app on your phone`)
console.log(`  3. Start your app and test!`)
```

#### `src/index.ts` (Camera Template)

```typescript
import {AppServer, AppSession} from "@mentra/sdk"

const PORT = parseInt(process.env.PORT || "3000")
const PACKAGE_NAME = process.env.PACKAGE_NAME!
const API_KEY = process.env.MENTRAOS_API_KEY!

class MyApp extends AppServer {
  constructor() {
    super({
      packageName: PACKAGE_NAME,
      apiKey: API_KEY,
      port: PORT,
    })
  }

  /**
   * Called when a user starts your app on their glasses
   */
  protected async onSession(session: AppSession, sessionId: string, userId: string): Promise<void> {
    session.logger.info("Session started", {sessionId, userId})

    // Check if user's glasses have a camera
    const hasCamera = session.capabilities?.hasCamera

    if (!hasCamera) {
      session.logger.warn("User glasses do not have a camera")
      // Use audio to notify user
      await session.audio.playTTS("This app requires camera-equipped glasses.")
      return
    }

    // Notify user the app is ready (via audio since no display)
    await session.audio.playTTS('Camera app ready. Say "capture" to take a photo.')

    // Listen for speech commands
    session.events.onTranscription((data) => {
      if (data.isFinal) {
        const text = data.text.toLowerCase().trim()
        session.logger.info("User said:", {text})

        if (text.includes("capture") || text.includes("photo")) {
          this.handleCapture(session)
        }
      }
    })

    // Listen for button presses (alternative to voice)
    session.events.onButtonPress(async (button) => {
      if (button.buttonType === "tap") {
        await this.handleCapture(session)
      }
    })

    // Handle disconnection
    session.events.onDisconnected(() => {
      session.logger.info("Session ended", {sessionId})
    })
  }

  private async handleCapture(session: AppSession): Promise<void> {
    try {
      session.logger.info("Capturing photo...")

      // Notify user (audio feedback since no display)
      await session.audio.playTTS("Capturing...")

      // Capture photo
      const photo = await session.camera.capturePhoto({
        saveToGallery: true,
      })

      session.logger.info("Photo captured", {
        width: photo.width,
        height: photo.height,
      })

      // Process the image here
      // const result = await analyzeImage(photo.base64);

      // Give audio feedback
      await session.audio.playTTS("Photo captured successfully!")
    } catch (error) {
      session.logger.error("Failed to capture photo", error)
      await session.audio.playTTS("Failed to capture photo. Please try again.")
    }
  }
}

// Start the server
const app = new MyApp()
app.start()

console.log(`🚀 App server running on http://localhost:${PORT}`)
console.log(`📦 Package: ${PACKAGE_NAME}`)
console.log(`📷 Camera app - requires camera-equipped glasses`)
console.log(`\nNext steps:`)
console.log(`  1. Run: mentra tunnel`)
console.log(`  2. Open MentraOS app on your phone`)
console.log(`  3. Start your app and test with camera glasses!`)
```

#### `README.md`

````markdown
# Vision Assistant

MentraOS app created with `mentra init`

## Quick Start

1. **Install dependencies:**
   ```bash
   bun install
   ```
````

2. **Configure environment:**

   ```bash
   cp .env.example .env  # If not auto-configured
   ```

   Edit `.env` and add your API key if needed.

3. **Start development server:**

   ```bash
   bun run dev
   ```

4. **Expose to internet (in another terminal):**

   ```bash
   mentra tunnel
   ```

5. **Test on your glasses:**
   - Open MentraOS app on your phone
   - Start "Vision Assistant"
   - Test the app!

## Development

- `bun run dev` - Start with hot reload
- `bun run start` - Start without hot reload
- `bun run build` - Build for production

## Hardware Requirements

This app was created with the **[display/camera]** template.

- Microphone: Required (always available via glasses or phone)
- Speakers: Required (always available via glasses or phone)
- [Display: Required (HUD glasses) / Camera: Required (camera-equipped glasses)]

## Documentation

- [MentraOS Docs](https://docs.mentra.glass)
- [SDK Reference](https://docs.mentra.glass/reference/app-server)
- [Example Apps](https://docs.mentra.glass/example-apps)

## Support

- [Discord Community](https://discord.gg/5ukNvkEAqT)
- [GitHub Issues](https://github.com/Mentra-Community/MentraOS/issues)

```

#### `.gitignore`

```

# Dependencies

node_modules/
bun.lockb

# Environment variables

.env
.env.local
.env.\*.local

# Build output

dist/
build/

# Logs

logs/
_.log
npm-debug.log_

# OS

.DS_Store
Thumbs.db

# IDE

.vscode/
.idea/
_.swp
_.swo

```

## Templates

### 1. Display Template
**Hardware:** HUD glasses with display (no camera)

**Capabilities Used:**
- ✅ Microphone (universal)
- ✅ Speakers (universal)
- ✅ Display (required)
- ❌ Camera (not available)

**Code Features:**
- Checks `session.capabilities.hasDisplay`
- Uses layouts (TextWall, ReferenceCard)
- Responds to transcription with visual feedback
- Button press handlers with display updates

**Use Cases:**
- Live captions/transcription display
- Translation with text display
- Reference information lookup
- Visual notifications and alerts

### 2. Camera Template
**Hardware:** Camera glasses (no display)

**Capabilities Used:**
- ✅ Microphone (universal)
- ✅ Speakers (universal)
- ❌ Display (not available)
- ✅ Camera (required)

**Code Features:**
- Checks `session.capabilities.hasCamera`
- Uses camera.capturePhoto()
- Audio-only feedback (no display)
- Voice commands for capture
- Button press for photo capture

**Use Cases:**
- Image recognition and analysis
- Visual AI assistants
- Object detection
- Scene understanding

## Implementation Architecture

### Command Structure

```

cli/src/commands/init/
├── index.ts # Main init command
├── prompts.ts # Interactive prompts
├── validator.ts # Input validation
├── generator.ts # File generation
├── installer.ts # Dependency installation
├── registration.ts # Cloud app registration
└── templates/
├── display.ts # Display template code
└── camera.ts # Camera template code

````

### Core Logic Flow

```typescript
export async function initCommand(options: InitOptions): Promise<void> {
  // 1. Get package name (prompt or flag)
  const packageName = await getPackageName(options);

  // 2. Validate package name format
  validatePackageName(packageName);

  // 3. Check if authenticated
  const isAuthenticated = await checkAuth();

  // 4. Check package name availability (if authenticated)
  if (isAuthenticated) {
    const available = await checkAvailability(packageName);
    if (!available) {
      throw new Error(`Package name '${packageName}' is already registered`);
    }
  }

  // 5. Get other inputs (name, template, port, directory)
  const config = await gatherConfig(options, packageName);

  // 6. Create project files
  await generateProject(config);

  // 7. Register app in cloud (if authenticated)
  if (isAuthenticated && !options.noRegister) {
    const apiKey = await registerApp(config);
    await saveApiKey(config.directory, apiKey);
  }

  // 8. Install dependencies (unless --no-install)
  if (!options.noInstall) {
    await installDependencies(config.directory);
  }

  // 9. Show success message and next steps
  printSuccess(config, isAuthenticated);
}

async function checkAvailability(packageName: string): Promise<boolean> {
  try {
    const response = await api.checkPackageNameAvailability(packageName);
    return response.available;
  } catch (error) {
    // If endpoint doesn't exist yet, skip check
    return true;
  }
}

async function registerApp(config: ProjectConfig): Promise<string> {
  const result = await api.createApp({
    packageName: config.packageName,
    name: config.name,
    appType: 'background',  // Default
    publicUrl: 'http://localhost:3000',  // Temporary, updated by tunnel
  });

  return result.apiKey;
}
````

### Template System

```typescript
export interface Template {
  name: string
  description: string
  hardware: "display" | "camera"
  requiredCapabilities: string[]
  generateCode: (config: ProjectConfig) => string
  generateReadme: (config: ProjectConfig) => string
}

export const templates: Record<string, Template> = {
  display: {
    name: "Display",
    description: "For HUD glasses with display (shows info on screen)",
    hardware: "display",
    requiredCapabilities: ["microphone", "speakers", "display"],
    generateCode: displayTemplate,
    generateReadme: generateDisplayReadme,
  },
  camera: {
    name: "Camera",
    description: "For camera glasses (processes images)",
    hardware: "camera",
    requiredCapabilities: ["microphone", "speakers", "camera"],
    generateCode: cameraTemplate,
    generateReadme: generateCameraReadme,
  },
}
```

### Validation

```typescript
function validatePackageName(name: string): void {
  // Must be reverse-domain notation
  const regex = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/
  if (!regex.test(name)) {
    throw new Error("Invalid package name format. Use reverse-domain notation (e.g., com.example.myapp)")
  }
}

function validatePort(port: number): void {
  if (port < 1024 || port > 65535) {
    throw new Error("Port must be between 1024 and 65535")
  }
}

function validateDirectory(dir: string): void {
  if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir)
    if (files.length > 0) {
      throw new Error(`Directory '${dir}' already exists and is not empty. Use --force to overwrite.`)
    }
  }
}
```

## Backend Changes Required

### New Endpoint: Check Package Name Availability

```typescript
// Route: GET /api/cli/apps/check-availability/:packageName
// Auth: CLI token (optional - returns false if not auth'd)

router.get("/check-availability/:packageName", async (req, res) => {
  const {packageName} = req.params

  try {
    // Check if package name is already registered
    const existingApp = await App.findOne({packageName})

    if (existingApp) {
      return res.json({
        available: false,
        message: `Package name '${packageName}' is already registered`,
      })
    }

    return res.json({
      available: true,
      message: "Package name is available",
    })
  } catch (error) {
    return res.status(500).json({
      error: "Failed to check availability",
      message: error.message,
    })
  }
})
```

Or make it work without auth:

```typescript
// Route: GET /api/public/apps/check-availability/:packageName
// Auth: None (public endpoint)

router.get("/check-availability/:packageName", async (req, res) => {
  const {packageName} = req.params

  // Rate limit this endpoint to prevent abuse

  const exists = await App.exists({packageName})

  return res.json({
    available: !exists,
  })
})
```

## Error Handling

```bash
# Invalid package name format
$ mentra init --package-name MyApp
✗ Invalid package name format
  Use reverse-domain notation: com.company.app
  Examples: com.example.myapp, org.acme.translator

# Package name already taken
$ mentra init --package-name com.example.vision
Checking availability...
✗ Package name 'com.example.vision' is already registered
  Try: com.example.vision2 or com.yourname.vision

# Directory exists and not empty
$ mentra init --dir existing-app
✗ Directory 'existing-app' already exists and is not empty
  Use a different directory or delete the existing one

# Missing required flag in non-interactive mode
$ mentra init --yes
✗ Missing required flag: --package-name
  Use --package-name or run without --yes for interactive mode

# Not authenticated when trying to auto-register
$ mentra init --package-name com.example.app
ℹ  Not authenticated - skipping cloud registration
   Run 'mentra auth <token>' to enable auto-registration

# Network error during registration
$ mentra init --package-name com.example.app
Creating project...
⚠  Failed to register app in cloud: Network error
  Project created successfully, but cloud registration failed
  Register manually: mentra app create --package-name com.example.app
```

## Success Criteria

1. ✅ Generates working app server in < 2 minutes
2. ✅ Zero manual file creation needed
3. ✅ Works in both interactive and non-interactive modes
4. ✅ Auto-registers app when authenticated
5. ✅ Auto-populates API key in .env
6. ✅ Checks package name availability before creating files
7. ✅ Generated code follows MentraOS best practices
8. ✅ Templates match hardware capabilities
9. ✅ Clear next steps printed after generation
10. ✅ Works with both npm and bun

## Testing Strategy

### Unit Tests

```typescript
describe("mentra init", () => {
  test("validates package name format", () => {
    expect(validatePackageName("com.example.app")).toBe(true)
    expect(() => validatePackageName("MyApp")).toThrow()
  })

  test("generates correct package.json", () => {
    const config = {
      packageName: "com.test.app",
      name: "Test",
      template: "display",
    }
    const pkg = generatePackageJson(config)
    expect(pkg.name).toBe("test-app")
    expect(pkg.dependencies).toHaveProperty("@mentra/sdk")
  })

  test("checks availability before creating", async () => {
    const available = await checkAvailability("com.test.unique")
    expect(available).toBe(true)
  })
})
```

### Integration Tests

```bash
# Test display template (authenticated)
mentra init \
  --package-name com.test.display \
  --template display \
  --yes

cd test-display
bun install
bun run dev  # Should start without errors

# Test camera template (not authenticated)
mentra auth logout
mentra init \
  --package-name com.test.camera \
  --template camera \
  --yes

# Should create .env.example, not .env
test -f .env.example
! test -f .env

# Test package name taken
mentra init --package-name com.test.display --yes
# Should fail with clear error message
```

## Future Enhancements (Phase 2)

- [ ] More templates (audio-only, multi-modal, etc.)
- [ ] Git initialization option (`--git`)
- [ ] GitHub repo creation integration
- [ ] Docker/docker-compose generation
- [ ] CI/CD config templates (GitHub Actions, etc.)
- [ ] VS Code workspace settings
- [ ] Example test files
- [ ] Pre-commit hooks setup
- [ ] Community template marketplace
- [ ] Custom template from URL/path
- [ ] TypeScript vs JavaScript option
- [ ] Verify publicUrl is accessible before completing
- [ ] Add example for processing camera images (OpenAI Vision, etc.)

## Related Commands

- `mentra auth` - Authenticate to enable auto-registration
- `mentra app create` - Register app manually (if not auto-registered)
- `mentra tunnel` - Expose local server (used after init)
- `mentra app update` - Change app type or other settings later

## Resources

- [MentraOS Quickstart Guide](https://docs.mentra.glass/quickstart)
- [Example Apps Repository](https://github.com/Mentra-Community/MentraOS-Examples)
- [AppServer Reference](https://docs.mentra.glass/reference/app-server)
- [Device Capabilities](https://docs.mentra.glass/capabilities)
