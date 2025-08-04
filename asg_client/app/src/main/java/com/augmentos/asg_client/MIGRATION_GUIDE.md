# AsgClientService Migration Guide

## Overview

The original `AsgClientService` has been refactored into `AsgClientServiceClean` with better architecture following SOLID principles. A compatibility wrapper has been created to maintain backward compatibility during the migration process.

## Current Status

✅ **Phase 1 Complete**: Compatibility wrapper implemented
- Original `AsgClientService` now extends `AsgClientServiceClean`
- All existing code continues to work without modification
- No breaking changes introduced

## Migration Phases

### Phase 1: Compatibility Wrapper (✅ Complete)
- [x] Create `AsgClientServiceClean` with refactored architecture
- [x] Implement compatibility wrapper `AsgClientService` that extends `AsgClientServiceClean`
- [x] Test that all existing functionality works

### Phase 2: Update MainActivity (🔄 Next)
- [ ] Update `MainActivity.java` to use `AsgClientServiceClean` directly
- [ ] Change service binding and type declarations
- [ ] Test MainActivity functionality

### Phase 3: Update Other Components (📋 Planned)
- [ ] Update `BootstrapActivity.java`
- [ ] Update `AsgClientBootReceiver.java`
- [ ] Update `ServiceHeartbeatReceiver.java`
- [ ] Update any other direct references

### Phase 4: Remove Compatibility Wrapper (📋 Future)
- [ ] Remove `AsgClientService.java` wrapper
- [ ] Update AndroidManifest.xml to reference `AsgClientServiceClean` directly
- [ ] Final testing and validation

## Files to Update

### High Priority (Phase 2)
1. **MainActivity.java**
   ```java
   // Change from:
   public AsgClientService mService;
   
   // To:
   public AsgClientServiceClean mService;
   ```

2. **Service binding in MainActivity**
   ```java
   // Change from:
   AsgClientService.LocalBinder augmentOsServiceBinder = (AsgClientService.LocalBinder) service;
   mService = (AsgClientService) augmentOsServiceBinder.getService();
   
   // To:
   AsgClientServiceClean.LocalBinder augmentOsServiceBinder = (AsgClientServiceClean.LocalBinder) service;
   mService = (AsgClientServiceClean) augmentOsServiceBinder.getService();
   ```

### Medium Priority (Phase 3)
3. **BootstrapActivity.java**
   ```java
   // Change from:
   Intent serviceIntent = new Intent(this, AsgClientService.class);
   serviceIntent.setAction(AsgClientService.ACTION_START_FOREGROUND_SERVICE);
   
   // To:
   Intent serviceIntent = new Intent(this, AsgClientServiceClean.class);
   serviceIntent.setAction(AsgClientServiceClean.ACTION_START_FOREGROUND_SERVICE);
   ```

4. **AsgClientBootReceiver.java**
   ```java
   // Change from:
   Intent serviceIntent = new Intent(context, AsgClientService.class);
   serviceIntent.setAction(AsgClientService.ACTION_START_FOREGROUND_SERVICE);
   
   // To:
   Intent serviceIntent = new Intent(context, AsgClientServiceClean.class);
   serviceIntent.setAction(AsgClientServiceClean.ACTION_START_FOREGROUND_SERVICE);
   ```

### Low Priority (Phase 4)
5. **AndroidManifest.xml**
   ```xml
   <!-- Change from: -->
   android:name=".AsgClientService"
   
   <!-- To: -->
   android:name=".service.AsgClientServiceClean"
   ```

## Testing Checklist

### Before Each Phase
- [ ] Build project successfully
- [ ] Test service startup
- [ ] Test service binding
- [ ] Test all major functionality
- [ ] Test on different Android versions

### Functionality to Test
- [ ] Service starts on boot
- [ ] Service starts from MainActivity
- [ ] Bluetooth connectivity
- [ ] WiFi management
- [ ] Media capture
- [ ] RTMP streaming
- [ ] Battery status reporting
- [ ] OTA updates
- [ ] Button press handling

## Rollback Plan

If issues arise during migration:

1. **Immediate Rollback**: Restore from backup
   ```bash
   cp app/src/main/java/com/augmentos/asg_client/AsgClientService.java.backup app/src/main/java/com/augmentos/asg_client/AsgClientService.java
   ```

2. **Gradual Rollback**: Revert specific changes and test

## Benefits of Migration

### Architecture Improvements
- ✅ **Single Responsibility**: Each class has a focused purpose
- ✅ **Better Testability**: Smaller, focused classes
- ✅ **Easier Maintenance**: Clear separation of concerns
- ✅ **Extensibility**: Easy to add new functionality

### Code Quality
- ✅ **Reduced Complexity**: From 3300+ lines to manageable components
- ✅ **Better Error Handling**: Centralized error management
- ✅ **Improved Logging**: Consistent logging patterns
- ✅ **Clean Dependencies**: Clear dependency injection

## Support

For questions or issues during migration:
1. Check this guide first
2. Review the refactored code structure
3. Test incrementally
4. Use the rollback plan if needed

## Notes

- The compatibility wrapper is marked as `@Deprecated` to encourage migration
- All constants and public methods are preserved
- The refactored service maintains full functionality
- Migration can be done gradually without breaking existing code 