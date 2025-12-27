# Sentry Restoration Guide

This document tracks the Sentry configuration changes made in the `feat/meta-rayban-integration` branch that need to be restored before submitting a PR to `Mentra-Community/MentraOS`.

## Summary

The Sentry Expo plugin was **commented out** in `app.config.ts` because we don't have the `SENTRY_AUTH_TOKEN` configured for builds. The Sentry SDK itself is still installed and functional - only the Expo plugin for source map uploads was disabled.

---

## Change Made

### File: `app.config.ts`

**Lines 215-223** (current - commented out):

```typescript
// Sentry disabled - uncomment when auth token is configured
// [
//   "@sentry/react-native/expo",
//   {
//     url: "https://sentry.io/",
//     project: "mentra-os",
//     organization: "mentra-labs",
//   },
// ],
```

**Original from `upstream/main`** (to restore):

```typescript
[
  "@sentry/react-native/expo",
  {
    url: "https://sentry.io/",
    project: "mentra-os",
    organization: "mentra-labs",
    experimental_android: {
      enableAndroidGradlePlugin: false,
      autoUploadProguardMapping: true,
      includeProguardMapping: true,
      dexguardEnabled: true,
      uploadNativeSymbols: true,
      autoUploadNativeSymbols: true,
      includeNativeSources: true,
      includeSourceContext: true,
    },
  },
],
```

---

## What's Still Working

The following Sentry components are **unchanged** and still functional:

| File                                     | What it does                                         |
| ---------------------------------------- | ---------------------------------------------------- |
| `src/effects/SentrySetup.tsx`            | Initializes Sentry SDK at runtime                    |
| `src/app/_layout.tsx`                    | Wraps app with `Sentry.wrap()`, registers navigation |
| `src/components/error/ErrorBoundary.tsx` | Captures exceptions with `Sentry.captureException()` |
| `src/contexts/AuthContext.tsx`           | Sets Sentry user context on login                    |
| `src/utils/structure/AllProviders.tsx`   | Error handling with Sentry                           |
| `src/app/settings/developer.tsx`         | "Test Sentry" button                                 |
| `metro.config.js`                        | Uses `getSentryExpoConfig()` for metro bundler       |
| `package.json`                           | `@sentry/react-native` dependency (v7.6.0)           |

---

## How to Restore for PR

Before submitting a PR to `Mentra-Community/MentraOS`:

1. **Replace lines 215-223** in `app.config.ts` with the original Sentry plugin config (shown above)

2. **Ensure you have Sentry credentials** (or remove the change entirely and let the maintainers handle it)

3. **Alternative**: If you don't have Sentry credentials, you could keep the plugin disabled but explain in the PR that it needs to be re-enabled by maintainers with proper auth tokens.

---

## Why This Was Done

The Sentry Expo plugin requires a `SENTRY_AUTH_TOKEN` to upload source maps and debug symbols during builds. Without this token, builds would fail. By commenting out the plugin:

- ✅ Builds succeed without Sentry credentials
- ✅ Sentry error capturing still works at runtime (just no source maps)
- ⚠️ Crashes won't have full stack traces in Sentry dashboard

---

## Related Files

- `mobile/AGENTS.md` - Contains documentation about Sentry configuration
- `mobile/ios/.xcode.env` - Has `SENTRY_DISABLE_AUTO_UPLOAD=true` for iOS builds
