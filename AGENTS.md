# Repository Guidelines

## Project Structure & Module Organization

Core client app lives in `mobile/` (Expo React Native). Backend services, the TypeScript SDK, and the store front end sit in `cloud/packages/`, with integration tests in `cloud/tests/`. Platform SDKs are in `android_core/`, `android_library/`, `sdk_ios/`; hardware tooling lives in `mcu_client/`. Notes and plans live in `agents/` and `docs/`.

## Build, Test & Development Commands

Use Bun across workspaces and run `bun install` inside each package. For the cloud stack: `cd cloud && bun run dev` starts services; run `bun run dev:setup-network` once and `./scripts/docker-setup.sh` on fresh machines. `bun run test` covers backend suites. For mobile: `cd mobile && bun expo prebuild` syncs native projects; `bun android`/`bun ios` (or `npm run android`/`npm run ios`) build devices, and `bun run start` (`npm start`) launches Metro.

## Coding Style & Naming Conventions

TypeScript/JavaScript uses Prettier defaults (2-space indent, single quotes, trailing commas) with imports grouped external→internal. ESLint configs in `eslint.config.mjs` and package overrides enforce React Native and Bun-friendly rules; auto-fix with `bun run lint`. Swift uses `swiftformat`, while Java/Kotlin under `android_*` follow Android Studio defaults with `m`-prefixed member fields and JavaDoc on public APIs. Use PascalCase for components, camelCase for hooks/utilities, and uppercase SNAKE_CASE for environment keys.

## Testing Guidelines

Cloud services use Jest via `bun run test`; add suites in `cloud/tests/` mirroring package names and mock external providers. Mobile UI logic uses Jest (`bun test`, `bun test:watch`) with files colocated in `mobile/test/` and snapshots beside components. Device flows rely on Maestro (`bun test:maestro`), so update scripts whenever navigation or pairing shifts. Features touching pairing, BLE, or transcription need unit coverage plus an end-to-end path.

## Commit & Pull Request Guidelines

Write imperative, present-tense commit subjects (e.g., "Add BLE retry delay") and keep scope focused. Reference issue IDs or Slack threads in the body when applicable. Before opening a PR, run relevant `bun run test` suites and platform builds, attach log excerpts for hardware-dependent steps, and call out configuration updates. PR descriptions should outline scope, test evidence, and screenshots or screen recordings for UI-impacting changes.

## Environment & Security Notes

Cloud services require `.env` files copied from `.env.example` that stay local. Mobile secrets belong in `mobile/app.config.ts` or the secure config service—avoid committing device-specific tokens. Rebuild native projects after modifying BLE or camera modules to keep generated code in sync, and install Java 17, Android Studio, Xcode, Docker, and Bun/Node before the first build.
