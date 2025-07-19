# Patches Directory

This directory contains patches applied during `npm/yarn/bun install` via patch-package.

## expo-localization+16.0.1.patch

This patch adds support for additional calendar types (bangla, gujarati, kannada, etc.) in iOS builds.

**Important:** This patch is conditionally applied:
- ✅ Applied ONLY on macOS 26 (Tahoe beta)
- ❌ NOT applied on macOS 15 (Sequoia) - causes build issues
- ❌ NOT applied on any other macOS version
- ❌ NOT applied on Linux or Windows

To check if the patch will be applied on your system:
```bash
node scripts/check-patch-status.js
```

To manually control the patch:
```bash
# Force apply the patch
FORCE_EXPO_LOCALIZATION_PATCH=true bun install

# Skip the patch
SKIP_EXPO_LOCALIZATION_PATCH=true bun install
```