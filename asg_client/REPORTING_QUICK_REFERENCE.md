# Generic Reporting System - Quick Reference

## 🚀 Setup (One Time)

```java
// In MainActivity.onCreate() or Application.onCreate()
ReportUtils.initialize(context);
```

## 📊 Basic Reporting

### Error Reporting
```java
// Critical errors
ReportUtils.reportCriticalError(context, "network_error", "Connection failed", exception);

// Service events
ReportUtils.reportServiceEvent(context, "MyService", "started");

// User actions
Map<String, Object> params = new HashMap<>();
params.put("button", "login");
ReportUtils.reportUserAction(context, "button_click", params);
```

### Network Operations
```java
ReportUtils.reportNetworkOperation(context, "GET", "https://api.example.com", 200);
ReportUtils.reportNetworkOperation(context, "POST", "https://api.example.com", 500);
```

### Bluetooth Operations
```java
ReportUtils.reportBluetoothOperation(context, "connect", "AA:BB:CC:DD:EE:FF", true);
ReportUtils.reportBluetoothOperation(context, "disconnect", "AA:BB:CC:DD:EE:FF", false);
```

### Camera Operations
```java
ReportUtils.reportCameraOperation(context, "capture", true, "Photo captured successfully");
ReportUtils.reportCameraOperation(context, "focus", false, "Auto-focus failed");
```

### Streaming Events
```java
ReportUtils.reportStreamingEvent(context, "start", "rtmp://stream.example.com", true);
ReportUtils.reportStreamingEvent(context, "stop", "rtmp://stream.example.com", false);
```

### OTA Updates
```java
ReportUtils.reportOtaEvent(context, "download", "v2.1.0", true);
ReportUtils.reportOtaEvent(context, "install", "v2.1.0", false);
```

### Performance Metrics
```java
ReportUtils.reportPerformanceMetric(context, "api_response_time", 1500, "ms");
ReportUtils.reportPerformanceMetric(context, "memory_usage", 85, "MB");
```

## 🔧 Advanced Reporting

### Custom Reports
```java
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

### Breadcrumbs (Debugging)
```java
ReportUtils.addBreadcrumb(context, "User clicked button", "ui", ReportLevel.INFO);
ReportUtils.addBreadcrumb(context, "API call started", "network", ReportLevel.DEBUG);
```

## 👤 User Management

### Set User Context
```java
ReportUtils.setUserContext(context, "user123", "John Doe", "john@example.com");
```

### Clear User Context
```java
ReportUtils.clearUserContext(context);
```

## ⚙️ Configuration

### Enable/Disable Providers
```java
// Disable Sentry, enable Console only
ReportUtils.setProviderEnabled(context, "Sentry", false);
ReportUtils.setProviderEnabled(context, "Console", true);

// Check enabled providers
List<String> enabled = ReportUtils.getEnabledProviders(context);
```

### Get Session ID
```java
String sessionId = ReportManager.getInstance(context).getCurrentSessionId();
```

## 📱 Integration Examples

### MainActivity
```java
@Override
protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    
    // Initialize reporting
    ReportUtils.initialize(this);
    ReportUtils.reportAppStartup(this);
    
    // Set user when logged in
    ReportUtils.setUserContext(this, userId, username, email);
}
```

### Service
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
    performRiskyOperation();
} catch (Exception e) {
    ReportUtils.reportCriticalError(this, "operation_failed", "Risky operation failed", e);
}
```

## 🧪 Testing

### Console Output Example
```
[2024-01-15 10:30:45.123] [INFO] [app.lifecycle] [startup] Application started
[2024-01-15 10:30:45.456] [ERROR] [bluetooth] [connect] connect - FAILED | Tags: {operation=connect, device_address=AA:BB:CC:DD:EE:FF, success=false}
[2024-01-15 10:30:46.789] [INFO] [user.action] [button_click] User action: button_click | Context: {button=login, screen=auth}
```

### Test Different Providers
```java
// Test with console only
ReportUtils.setProviderEnabled(context, "Sentry", false);
ReportUtils.setProviderEnabled(context, "Console", true);

// Test with all providers
ReportUtils.setProviderEnabled(context, "Sentry", true);
ReportUtils.setProviderEnabled(context, "Console", true);
```

## 📊 Report Levels

- `ReportLevel.DEBUG` - Debug information
- `ReportLevel.INFO` - General information
- `ReportLevel.WARNING` - Warning messages
- `ReportLevel.ERROR` - Error conditions
- `ReportLevel.CRITICAL` - Critical errors

## 🏷️ Built-in Categories

- `app.lifecycle` - Application lifecycle
- `service.lifecycle` - Service events
- `http` - Network operations
- `bluetooth` - Bluetooth operations
- `camera` - Camera operations
- `streaming` - Streaming events
- `ota` - OTA updates
- `error` - Error tracking
- `performance` - Performance metrics
- `user.action` - User interactions

## 🔄 Adding New Provider

### 1. Create Provider
```java
public class MyProvider implements IReportProvider {
    @Override
    public boolean initialize(Context context) { /* ... */ }
    @Override
    public void report(ReportData reportData) { /* ... */ }
    // ... other methods
}
```

### 2. Register Provider
```java
ReportManager manager = ReportManager.getInstance(context);
manager.addProvider(new MyProvider());
```

### 3. Use Immediately
```java
// Works with all existing code!
ReportUtils.reportCriticalError(context, "test", "message", exception);
```

## 🚀 Benefits

✅ **SOLID Principles** - Clean, maintainable architecture  
✅ **Easy Extension** - Add providers without code changes  
✅ **Consistent API** - Same interface for all tools  
✅ **Thread Safe** - Asynchronous, non-blocking  
✅ **Flexible** - Mix and match monitoring tools  
✅ **Testable** - Easy to test and debug  

## 📞 Support

- **Documentation**: `GENERIC_REPORTING_SYSTEM.md`
- **Examples**: See integration examples above
- **Testing**: Use ConsoleReportProvider for debugging
- **Extension**: Follow the provider template pattern 