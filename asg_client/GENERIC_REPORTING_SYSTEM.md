# Generic Reporting System - SOLID Principles Implementation

## 🎯 Overview

This generic reporting system follows SOLID principles to provide a flexible, extensible, and maintainable solution for crash reporting, error tracking, and issue monitoring. It allows you to easily add/remove monitoring tools without affecting your app code.

## 🏗️ Architecture

### SOLID Principles Implementation

#### 1. **Single Responsibility Principle (SRP)**
- Each class has one reason to change
- `ReportManager` - Only manages reporting orchestration
- `ReportData` - Only holds reporting data
- `IReportProvider` - Only defines reporting contract
- Each provider - Only handles its specific tool

#### 2. **Open/Closed Principle (OCP)**
- Open for extension, closed for modification
- Add new providers without changing existing code
- Extend functionality through interfaces

#### 3. **Liskov Substitution Principle (LSP)**
- Any provider can be substituted for another
- All providers implement the same interface
- Consistent behavior across all implementations

#### 4. **Interface Segregation Principle (ISP)**
- `IReportProvider` contains only essential methods
- No forced dependencies on unused methods
- Clean, focused interface

#### 5. **Dependency Inversion Principle (DIP)**
- High-level modules depend on abstractions
- `ReportManager` depends on `IReportProvider` interface
- Not tied to concrete implementations

## 📁 File Structure

```
reporting/
├── ReportLevel.java              # Enum for report levels
├── ReportData.java               # Data transfer object
├── IReportProvider.java          # Interface contract
├── ReportManager.java            # Main orchestrator
├── ReportUtils.java              # Utility methods
└── providers/
    ├── SentryReportProvider.java     # Sentry implementation
    ├── ConsoleReportProvider.java    # Console debugging
    └── CrashlyticsReportProvider.java # Crashlytics template
```

## 🚀 Quick Start

### 1. **Initialize the System**

```java
// In your Application or MainActivity
ReportUtils.initialize(context);
```

### 2. **Basic Reporting**

```java
// Simple error report
ReportUtils.reportCriticalError(context, "network_error", "Connection failed", exception);

// Service lifecycle
ReportUtils.reportServiceEvent(context, "MyService", "started");

// User actions
Map<String, Object> params = new HashMap<>();
params.put("button", "login");
params.put("screen", "auth");
ReportUtils.reportUserAction(context, "button_click", params);
```

### 3. **Advanced Reporting**

```java
// Custom report with full context
ReportManager.getInstance(context).report(
    new ReportData.Builder()
        .message("Custom operation failed")
        .level(ReportLevel.ERROR)
        .category("custom.operation")
        .operation("process_data")
        .tag("user_id", "12345")
        .tag("operation_type", "batch")
        .context("input_size", 1000)
        .context("processing_time", 5000)
        .exception(exception)
        .build()
);
```

## 🔧 Adding New Providers

### Step 1: Create Provider Class

```java
public class MyCustomProvider implements IReportProvider {
    
    @Override
    public boolean initialize(Context context) {
        // Initialize your monitoring tool
        return true;
    }
    
    @Override
    public void report(ReportData reportData) {
        // Convert ReportData to your tool's format
        // Send to your monitoring service
    }
    
    // Implement other interface methods...
}
```

### Step 2: Register Provider

```java
// In ReportUtils.initialize() or manually
ReportManager manager = ReportManager.getInstance(context);
manager.addProvider(new MyCustomProvider());
```

### Step 3: Use Immediately

```java
// Your existing code works unchanged!
ReportUtils.reportCriticalError(context, "test", "message", exception);
```

## 📊 Supported Providers

### ✅ **Currently Implemented**

1. **SentryReportProvider**
   - Full Sentry integration
   - Exception tracking
   - Breadcrumbs
   - User context
   - Custom tags and context

2. **ConsoleReportProvider**
   - Debug logging
   - Development testing
   - No external dependencies

### 🔄 **Template Implementations**

3. **CrashlyticsReportProvider**
   - Firebase Crashlytics template
   - Ready for Firebase integration
   - Custom keys and user tracking

### 🆕 **Easy to Add**

4. **Google Analytics Provider**
5. **Mixpanel Provider**
6. **Instabug Provider**
7. **Custom Internal Provider**

## 🎛️ Configuration

### Enable/Disable Providers

```java
// Disable specific provider
ReportUtils.setProviderEnabled(context, "Sentry", false);

// Check enabled providers
List<String> enabled = ReportUtils.getEnabledProviders(context);
```

### User Context Management

```java
// Set user context for all providers
ReportUtils.setUserContext(context, "user123", "John Doe", "john@example.com");

// Clear user context
ReportUtils.clearUserContext(context);
```

### Session Management

```java
// Set session ID (auto-generated on initialization)
String sessionId = ReportManager.getInstance(context).getCurrentSessionId();
```

## 📈 Reporting Categories

### Built-in Categories

- **app.lifecycle** - Application lifecycle events
- **service.lifecycle** - Service start/stop events
- **http** - Network operations
- **bluetooth** - Bluetooth operations
- **camera** - Camera operations
- **streaming** - Streaming events
- **ota** - OTA update events
- **error** - Error tracking
- **performance** - Performance metrics
- **user.action** - User interactions

### Custom Categories

```java
// Create custom categories
ReportData.Builder builder = new ReportData.Builder()
    .category("my.custom.category")
    .operation("specific_operation");
```

## 🔍 Debugging

### Console Output

The ConsoleReportProvider gives detailed output:

```
[2024-01-15 10:30:45.123] [INFO] [app.lifecycle] [startup] Application started
[2024-01-15 10:30:45.456] [ERROR] [bluetooth] [connect] connect - FAILED | Tags: {operation=connect, device_address=AA:BB:CC:DD:EE:FF, success=false}
```

### Breadcrumbs

```java
// Add debugging breadcrumbs
ReportUtils.addBreadcrumb(context, "User clicked login button", "ui", ReportLevel.INFO);
ReportUtils.addBreadcrumb(context, "Network request started", "network", ReportLevel.DEBUG);
```

## 🧪 Testing

### Test Different Providers

```java
// Test with console only
ReportUtils.setProviderEnabled(context, "Sentry", false);
ReportUtils.setProviderEnabled(context, "Console", true);

// Test with all providers
ReportUtils.setProviderEnabled(context, "Sentry", true);
ReportUtils.setProviderEnabled(context, "Console", true);
```

### Mock Provider

```java
public class MockReportProvider implements IReportProvider {
    private List<ReportData> reports = new ArrayList<>();
    
    @Override
    public void report(ReportData reportData) {
        reports.add(reportData);
    }
    
    public List<ReportData> getReports() {
        return reports;
    }
    
    // Other methods...
}
```

## 🔒 Thread Safety

- **ReportManager** uses thread-safe collections
- **ReportData** is immutable
- **Asynchronous reporting** prevents UI blocking
- **Provider isolation** prevents cross-contamination

## 📱 Integration Examples

### MainActivity Integration

```java
@Override
protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    
    // Initialize reporting
    ReportUtils.initialize(this);
    ReportUtils.reportAppStartup(this);
    
    // Set user context when user logs in
    ReportUtils.setUserContext(this, userId, username, email);
}
```

### Service Integration

```java
@Override
public void onCreate() {
    super.onCreate();
    ReportUtils.reportServiceEvent(this, "MyService", "created");
}

@Override
public void onDestroy() {
    ReportUtils.reportServiceEvent(this, "MyService", "destroyed");
    super.onDestroy();
}
```

### Error Handling

```java
try {
    // Your risky operation
    performRiskyOperation();
} catch (Exception e) {
    ReportUtils.reportCriticalError(this, "operation_failed", "Risky operation failed", e);
}
```

## 🚀 Benefits

### ✅ **SOLID Compliance**
- Easy to extend and maintain
- Clear separation of concerns
- Dependency inversion

### ✅ **Flexibility**
- Add/remove providers without code changes
- Mix and match monitoring tools
- Environment-specific configurations

### ✅ **Maintainability**
- Single point of configuration
- Consistent API across all providers
- Easy testing and debugging

### ✅ **Performance**
- Asynchronous reporting
- Non-blocking operations
- Efficient resource usage

### ✅ **Scalability**
- Add unlimited providers
- Handle high-volume reporting
- Thread-safe operations

## 🔮 Future Enhancements

1. **Provider Configuration** - JSON-based provider setup
2. **Filtering** - Report level and category filtering
3. **Batching** - Batch reports for efficiency
4. **Retry Logic** - Automatic retry for failed reports
5. **Metrics** - Provider performance metrics
6. **Webhooks** - Custom webhook integration

## 📚 Best Practices

1. **Initialize Early** - Initialize in Application.onCreate()
2. **Set User Context** - Set user info when user logs in
3. **Use Categories** - Organize reports with meaningful categories
4. **Add Context** - Include relevant data in reports
5. **Handle Exceptions** - Always catch and report exceptions
6. **Test Providers** - Test with console provider first
7. **Monitor Performance** - Use performance metrics
8. **Clean Up** - Clear user context on logout

This generic reporting system provides a robust, flexible, and maintainable solution for all your monitoring needs while following SOLID principles for clean architecture. 