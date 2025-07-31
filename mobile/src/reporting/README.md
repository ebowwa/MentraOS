# Reporting System

A comprehensive reporting and analytics system for the MentraOS mobile application, organized into multiple packages for better separation of concerns.

## 📁 Package Structure

```
reporting/
├── 📦 core/                    # Core types and main manager
│   ├── index.ts               # Core exports
│   ├── ReportLevel.ts         # Log levels (ERROR, WARNING, INFO, etc.)
│   ├── ReportData.ts          # Data structure and builder pattern
│   ├── IReportProvider.ts     # Provider interface contract
│   └── ReportManager.ts       # Singleton manager orchestrating all providers
│
├── 🔌 providers/              # Provider implementations
│   ├── index.ts               # Provider exports
│   ├── SentryReportProvider.ts    # Sentry error tracking
│   ├── ConsoleReportProvider.ts   # Console logging for debugging
│   └── PostHogReportProvider.ts   # PostHog analytics
│
├── 📊 analytics/              # Analytics and tracking
│   ├── index.ts               # Analytics exports
│   └── analytics.ts           # User behavior and metrics tracking
│
├── ⚠️ errors/                 # Basic error reporting
│   ├── index.ts               # Error exports
│   └── errorReporting.ts      # Basic error reporting functions
│
├── 🌐 domains/                # Domain-specific reporting
│   ├── index.ts               # Domain exports
│   ├── appLifecycle.ts        # App startup, crash, navigation issues
│   ├── networkReporting.ts    # API failures, network issues, timeouts
│   ├── storageReporting.ts    # Storage read/write failures, data parsing
│   ├── mediaReporting.ts      # Camera access, media capture issues
│   ├── permissionReporting.ts # Location access, permission denials
│   ├── stateReporting.ts      # State inconsistencies, update failures
│   └── uiReporting.ts         # Component errors, UI interaction failures
│
├── 🛠️ system/                 # System management
│   ├── index.ts               # System exports
│   └── system.ts              # System management functions
│
├── ⚙️ config/                 # Configuration management
│   ├── index.ts               # Config exports
│   ├── sentry.ts              # Sentry configuration
│   └── posthog.ts             # PostHog configuration
│
├── 📋 index.ts                # Single main entry point (backward compatible)
│
└── 📖 README.md               # This comprehensive documentation
```

## 🎯 Package Design Principles

### **Core Package** (`core/`)
- **Single Responsibility**: Contains only the fundamental types and main manager
- **Dependency Inversion**: Defines the `IReportProvider` interface that all providers implement
- **Singleton Pattern**: `ReportManager` ensures single instance across the app

### **Providers Package** (`providers/`)
- **Open/Closed Principle**: New providers can be added without modifying existing code
- **Interface Implementation**: All providers implement the `IReportProvider` interface
- **Independent**: Each provider can be enabled/disabled independently

### **Analytics Package** (`analytics/`)
- **User Behavior Focus**: Tracks user actions, feature usage, and application metrics
- **Event-Driven**: Uses event-based tracking for user interactions
- **Privacy-Conscious**: Respects user privacy settings

### **Errors Package** (`errors/`)
- **Basic Error Reporting**: Provides fundamental error reporting functions
- **Level-Based**: Supports different error levels (ERROR, WARNING, INFO, CRITICAL)
- **Consistent Interface**: All error reporting functions follow the same pattern

### **Domains Package** (`domains/`)
- **Domain-Specific**: Each file handles reporting for a specific domain
- **Specialized Functions**: Provides domain-specific reporting functions
- **Reusable**: Functions can be used across different parts of the app

### **System Package** (`system/`)
- **System Management**: Handles initialization, user context, and provider management
- **System Operations**: Provides system-level functions for the reporting system
- **Configuration**: Manages provider enablement and status

### **Config Package** (`config/`)
- **Secure Configuration**: Manages Sentry and PostHog credentials securely
- **Environment Variables**: Reads configuration from environment variables
- **Service Initialization**: Handles secure service initialization

## 🚀 Usage Patterns

### **Basic Usage (Recommended)**
```typescript
// Import from main index (backward compatible)
import { reportError, reportWarning } from '@/reporting'
import { trackEvent, trackUserAction } from '@/reporting'
import { initializeReporting } from '@/reporting'
```

### **Package-Specific Imports (For Advanced Usage)**
```typescript
// Import from specific packages
import { reportError } from '@/reporting/errors'
import { trackEvent } from '@/reporting/analytics'
import { reportApiRequestFailure } from '@/reporting/domains'
import { ReportManager } from '@/reporting/core'
```

### **Comprehensive Imports (All Functions)**
```typescript
// Import everything from main index
import * as Reporting from '@/reporting'

// Usage
Reporting.reportError('Error message', 'category', 'operation')
Reporting.trackEvent('user_action', userId, properties)
Reporting.initializeReporting()
```

## 📊 Current Usage Analysis

After analyzing the mobile app codebase, here are the current usage patterns:

### ✅ **Current Import Patterns (All Working Correctly)**

```typescript
// Most common pattern - importing from main index
import { reportError } from '@/reporting'
import { reportCritical } from '@/reporting'
import { reportError, reportWarning } from '@/reporting'
import { initializeReporting, reportCritical } from '@/reporting'
```

### 📍 **Files Using Reporting System**

1. **App Initialization**
   - `src/app/_layout.tsx` - App startup and initialization errors
   - `src/app/auth/login.tsx` - Authentication errors

2. **Components**
   - `src/components/misc/ConnectedDeviceInfo.tsx` - Device connection issues
   - `src/components/misc/SimulatedGlassesControls.tsx` - Glasses control errors
   - `src/components/misc/ConnectedSimulatedGlassesInfo.tsx` - Glasses info errors
   - `src/components/misc/AppsInactiveList.tsx` - App list errors
   - `src/components/misc/AppsActiveList.tsx` - Active app errors

3. **Services**
   - `src/services/AudioPlayService.ts` - Audio playback errors

4. **Utils**
   - `src/utils/useAppTheme.ts` - Theme-related errors and warnings
   - `src/utils/SettingsNavigationUtils.tsx` - Settings navigation errors
   - `src/utils/VideoPlayerHelper.tsx` - Video player errors
   - `src/utils/WifiCredentialsService.ts` - WiFi credential errors
   - `src/utils/DataExportService.tsx` - Data export critical errors
   - `src/utils/FileUtils.ts` - File operation errors
   - `src/utils/SettingsHelper.tsx` - Settings critical errors

5. **Models**
   - `src/models/EpisodeStore.ts` - Episode store errors

## 🎯 Usage Recommendations

### **For Simple Error Reporting (Current Pattern - Recommended)**
```typescript
// ✅ Keep using this pattern - it's clean and works well
import { reportError, reportWarning, reportCritical } from '@/reporting'

// Usage
reportError('Failed to load user data', 'user.data', 'load_user', error)
reportWarning('Network connection is slow', 'network.performance', 'api_call')
reportCritical('App initialization failed', 'app.lifecycle', 'startup', error)
```

### **For Domain-Specific Reporting (Optional Optimization)**
```typescript
// ✅ For files that do lots of network operations
import { reportApiRequestFailure, reportNetworkIssue } from '@/reporting'

// ✅ For files that do lots of storage operations
import { reportStorageReadFailure, reportStorageWriteFailure } from '@/reporting'

// ✅ For files that do lots of media operations
import { reportCameraAccessFailure, reportMediaCaptureFailure } from '@/reporting'
```

### **For Analytics Tracking (When Needed)**
```typescript
// ✅ For user behavior tracking
import { trackEvent, trackUserAction, trackFeatureUsage } from '@/reporting'

// Usage
trackEvent('feature_used', userId, { feature: 'camera', duration: 5000 })
trackUserAction('button_click', userId, { button: 'submit', page: 'login' })
```

### **For System Management**
```typescript
// ✅ For app initialization and management
import { initializeReporting, setUserContext, getProviderStatus } from '@/reporting'

// Usage
await initializeReporting()
setUserContext('user123', 'John Doe', 'john@example.com')
const status = getProviderStatus()
```

## 🔧 Package Configuration

### **Adding New Providers**
1. Create a new provider in `providers/` directory
2. Implement the `IReportProvider` interface
3. Add to `providers/index.ts` exports
4. Add to `ReportManager.initialize()` method

### **Adding New Domain Functions**
1. Create a new file in `domains/` directory
2. Import from `../errors/errorReporting`
3. Add to `domains/index.ts` exports
4. Add to main `index.ts` exports

### **Adding New Analytics Functions**
1. Add to `analytics/analytics.ts`
2. Add to `analytics/index.ts` exports
3. Add to main `index.ts` exports

## 📊 Benefits of Package Structure

### **1. Modularity**
- Each package has a single, well-defined responsibility
- Easy to understand what each package does
- Clear separation of concerns

### **2. Maintainability**
- Changes to one package don't affect others
- Easy to find and modify specific functionality
- Reduced cognitive load when working on specific features

### **3. Testability**
- Each package can be tested independently
- Mocking is easier with clear package boundaries
- Unit tests can focus on specific functionality

### **4. Scalability**
- New packages can be added without affecting existing ones
- Easy to add new providers, domains, or analytics functions
- Clear patterns for extending the system

### **5. Performance**
- Tree-shaking works better with package structure
- Only import what you need
- Smaller bundle sizes for specific use cases

### **6. Developer Experience**
- Clear import paths indicate functionality
- Better IDE support with package-specific imports
- Easier to understand the system architecture

## 🔄 Migration Status

✅ **100% Backward Compatible** - All existing imports continue to work

The package reorganization maintains full backward compatibility. All existing code using `@/reporting` continues to work without any changes.

## 📝 Best Practices

### **For Most Use Cases**
```typescript
// ✅ Use main index imports (recommended)
import { reportError, trackEvent } from '@/reporting'
```

### **For Domain-Specific Code**
```typescript
// ✅ Use domain-specific imports when doing lots of operations in one area
import { reportApiRequestFailure, reportNetworkIssue } from '@/reporting'
```

### **For System Management**
```typescript
// ✅ Use system for system management
import { initializeReporting, setUserContext } from '@/reporting'
```

### **For Configuration**
```typescript
// ✅ Use config for service configuration
import { isSentryEnabled, isPostHogEnabled } from '@/reporting'
```

### **For Advanced Usage**
```typescript
// ✅ Use comprehensive imports for all functionality
import * as Reporting from '@/reporting'
```

### **Follow Error Categorization**
```typescript
// ✅ Use proper error categorization for better debugging
reportError(message, 'category.subcategory', 'operation_name', error)
```

## 🛠️ Development Setup

This project uses **Bun** as the package manager and runtime:

```bash
# Install dependencies
bun install

# Run TypeScript checks
bun run tsc --noEmit

# Run tests
bun test

# Start development server
bun run start

# Build the project
bun run build
```

## 📈 Transformation Summary

### **Before (Flat Structure)**
```
reporting/
├── ReportLevel.ts
├── ReportData.ts
├── IReportProvider.ts
├── ReportManager.ts
├── ReportUtils.ts (525 lines - monolithic)
├── SentryReportProvider.ts
├── ConsoleReportProvider.ts
├── PostHogReportProvider.ts
├── appLifecycle.ts
├── networkReporting.ts
├── storageReporting.ts
├── mediaReporting.ts
├── permissionReporting.ts
├── stateReporting.ts
├── uiReporting.ts
├── errorReporting.ts
├── analytics.ts
├── utils.ts
├── index.ts
└── barrel.ts (redundant)
```

### **After (Multi-Package Structure)**
```
reporting/
├── 📦 core/                    # Core types and main manager
├── 🔌 providers/              # Provider implementations
├── 📊 analytics/              # Analytics and tracking
├── ⚠️ errors/                 # Basic error reporting
├── 🌐 domains/                # Domain-specific reporting
├── 🛠️ system/                 # System management
├── ⚙️ config/                 # Configuration management
├── 📋 index.ts                # Single main entry point
└── 📖 README.md               # This comprehensive documentation
```

## ✅ Key Achievements

### **1. Package Organization**
- **7 focused packages** with clear responsibilities
- **27 TypeScript files** organized logically
- **Single main entry point** (`index.ts`) for all exports
- **Removed redundant** `barrel.ts` file

### **2. Maintained Compatibility**
- **100% backward compatible** - all existing imports work
- **No breaking changes** to public API
- **Existing code continues** to work without modification

### **3. Enhanced Documentation**
- **Comprehensive README** with package structure
- **Detailed usage guide** with examples
- **Development setup** with Bun commands
- **Complete transformation summary**

### **4. Improved Developer Experience**
- **Clear import paths** indicate functionality
- **Better IDE support** with package-specific imports
- **Simpler mental model** with single entry point
- **Consistent patterns** across the codebase

## 🎉 Final Status

✅ **MIGRATION COMPLETE** - No action required from developers

The reporting system has been successfully transformed into a **well-organized, multi-package architecture** that provides:

- **Better organization** and separation of concerns
- **Improved maintainability** and testability
- **Enhanced scalability** for future development
- **Clear patterns** for extending the system
- **100% backward compatibility** with existing code
- **Optimized for Bun** as the package manager

**All existing code continues to work exactly as before**, but now with a much cleaner, more maintainable structure! 🚀

---

*This reorganization was completed using Bun as the package manager and maintains full backward compatibility while providing significant improvements in organization and maintainability.* 