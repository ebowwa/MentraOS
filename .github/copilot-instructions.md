# MentraOS Copilot Instructions

MentraOS is an open-source operating system for smart glasses with a multi-tier architecture: glasses (firmware) ↔ mobile app ↔ cloud backend ↔ third-party app servers.

## Architecture Overview

**Core Components:**
- `mobile/` - React Native app with native modules (main user interface)
- `android_core/` - Android library for BLE communication and glasses management
- `cloud/` - Backend services with WebSocket APIs and app store infrastructure  
- `mcu_client/` - Firmware for nRF5340/ESP32 smart glasses (BLE protocol implementation)
- `asg_client/` - Android-based smart glasses client using android_core as library

**Key Integration Points:**
- BLE communication via protobuf protocol v2.0 (Service UUID: `00004860-0000-1000-8000-00805f9b34fb`)
- WebSocket connections between mobile app and cloud for real-time messaging
- MongoDB for data persistence with typed schemas in cloud packages

## Critical Build Commands

**Mobile App (React Native):**
```bash
# Setup dependencies
bun install && bun expo prebuild

# Platform builds
bun android                    # Debug Android
bun run build-android-release  # Release Android  
cd ios && pod install && cd .. && bun ios  # iOS

# Cache issues fix (common):
rm -rf android/build android/.gradle node_modules .expo .bundle
./fix-react-native-symlinks.sh
```

**Cloud Backend:**
```bash
bun install && bun run dev     # Start all services with Docker
bun run logs:cloud            # Monitor cloud service logs
bun run dev:rebuild           # Rebuild containers after changes
```

**Android Core Library:**
```bash
# Build in android_core/
./gradlew assembleDebug       # Java SDK 17 required
```

## Code Patterns & Conventions

**Android (Java):**
- Use EventBus for component communication between services
- Member variables prefixed with `m` (e.g., `mSmartGlassesManager`)
- AugmentosService.java is the main service orchestrating BLE and app lifecycle
- SmartGlassesManager handles device-specific protocols

**React Native (TypeScript):**  
- Functional components with hooks, Context API for global state
- Feature-based organization under `src/` with typed navigation params
- Native modules bridge to android_core via `@mentra/android-core` package

**Cloud (TypeScript):**
- Microservices architecture with shared types in packages/
- WebSocket message types follow `AppToCloudMessage`/`CloudToAppMessage` patterns
- Subscription service manages real-time data streams to apps

## Development Workflows

**BLE Protocol Development:**
1. Prototype with ESP32 simulator (`mcu_client/esp32_ble_simulator/`)
2. Test with Python scripts (`mcu_client/python_simulators/`)  
3. Implement in production nRF5340 firmware
4. Update protobuf definitions in `mentraos_ble.proto`

**Multi-Platform Testing:**
- Maestro E2E tests in `mobile/.maestro/`
- Jest unit tests with `bun test`
- Device testing requires physical glasses hardware

**Deployment:**
- Porter.run for cloud infrastructure (see `.github/workflows/porter-*`)
- EAS for mobile app builds
- Self-hosted runners for Android builds (resource intensive)

## Common Issues & Solutions

**Mobile Build Failures:**
- Path length limits on Windows → clone to C:\ root
- Gradle/Metro cache corruption → run cache cleanup commands above
- Missing native dependencies → `cd ios && pod install`

**BLE Connection Issues:**
- Check service UUID matches across firmware and android_core
- Verify protobuf message structure compatibility  
- Use Python simulators for protocol validation

**Cloud Service Problems:**
- Docker network issues → `bun run dev:setup-network`
- Database connection failures → check MongoDB container status
- WebSocket timeout → verify subscription service configuration

## Key Files for AI Understanding

- `mobile/src/services/` - Core business logic and API interfaces
- `android_core/app/src/main/java/com/augmentos/` - BLE and device management
- `cloud/packages/cloud/src/services/` - Backend service implementations  
- `mcu_client/firmware_spec_protobuf.md` - Complete BLE protocol specification
- Component examples: `mobile/src/screens/` for React Native patterns

Focus on these directories when analyzing cross-component communication or implementing new features that span multiple tiers of the architecture.