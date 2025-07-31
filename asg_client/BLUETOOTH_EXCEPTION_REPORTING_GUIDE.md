# 🔵 Bluetooth Exception Reporting Guide

This guide documents the comprehensive Bluetooth exception reporting system integrated into the ASG Client application.

## 📋 Overview

The Bluetooth exception reporting system provides detailed monitoring and reporting of all Bluetooth-related errors, failures, and issues across different device types (Standard Android, K900, Nordic). This enables better debugging, monitoring, and reliability tracking.

## 🎯 Exception Categories

### 🔌 Connection & Pairing
- **Connection Failures** - Device connection establishment failures
- **GATT Server Issues** - BLE service creation and management failures
- **Pairing Failures** - Device bonding and authentication failures
- **Connection State Inconsistencies** - Unexpected connection state changes

### 📡 Communication
- **Advertising Failures** - BLE advertising start failures
- **Data Transmission Errors** - Send/receive data failures
- **Serial Communication Errors** - UART communication failures (K900)
- **Message Parsing Errors** - Protocol parsing and validation failures

### 📁 File Operations
- **File Transfer Failures** - File upload/download errors
- **Packet Retry Exhaustion** - File transfer packet retry failures
- **ACK Timeout Errors** - File transfer acknowledgment timeouts

### ⚙️ System & Configuration
- **Permission Errors** - Bluetooth permissions denied
- **Hardware Issues** - Bluetooth adapter problems
- **Initialization Failures** - Manager initialization errors
- **Device Type Detection** - K900 vs Standard device detection issues

## 🛠️ Reporting Methods

### Connection & Pairing

#### `reportBluetoothConnectionFailure()`
Reports connection establishment failures.

```java
ReportUtils.reportBluetoothConnectionFailure(context, deviceType, deviceAddress, reason, exception);
```

**Parameters:**
- `deviceType` - "standard", "k900", "nordic"
- `deviceAddress` - MAC address of the device
- `reason` - Failure reason (e.g., "timeout", "refused", "not_found")
- `exception` - Associated exception (can be null)

#### `reportGattServerFailure()`
Reports GATT server creation and operation failures.

```java
ReportUtils.reportGattServerFailure(context, operation, deviceAddress, errorCode, exception);
```

**Parameters:**
- `operation` - GATT operation (e.g., "create_server", "add_service")
- `deviceAddress` - MAC address of the device
- `errorCode` - BLE error code
- `exception` - Associated exception

#### `reportPairingFailure()`
Reports device pairing and bonding failures.

```java
ReportUtils.reportPairingFailure(context, deviceAddress, retryCount, reason);
```

**Parameters:**
- `deviceAddress` - MAC address of the device
- `retryCount` - Number of pairing attempts
- `reason` - Failure reason

### Communication

#### `reportAdvertisingFailure()`
Reports BLE advertising start failures.

```java
ReportUtils.reportAdvertisingFailure(context, errorCode, deviceName);
```

**Parameters:**
- `errorCode` - BLE advertising error code
- `deviceName` - Device name for advertising

#### `reportDataTransmissionFailure()`
Reports data send/receive failures.

```java
ReportUtils.reportDataTransmissionFailure(context, deviceType, deviceAddress, dataSize, reason, exception);
```

**Parameters:**
- `deviceType` - "standard", "k900", "nordic"
- `deviceAddress` - MAC address of the device
- `dataSize` - Size of data being transmitted
- `reason` - Failure reason
- `exception` - Associated exception

#### `reportSerialCommunicationFailure()`
Reports serial communication failures (K900 specific).

```java
ReportUtils.reportSerialCommunicationFailure(context, operation, serialPath, errorCode, exception);
```

**Parameters:**
- `operation` - Serial operation (e.g., "open_serial", "send_data")
- `serialPath` - Serial port path
- `errorCode` - Serial error code
- `exception` - Associated exception

### File Operations

#### `reportFileTransferFailure()`
Reports file transfer failures.

```java
ReportUtils.reportFileTransferFailure(context, filePath, operation, reason, exception);
```

**Parameters:**
- `filePath` - Path to the file being transferred
- `operation` - Transfer operation (e.g., "send_file", "receive_file")
- `reason` - Failure reason
- `exception` - Associated exception

#### `reportFileTransferRetryExhaustion()`
Reports file transfer packet retry exhaustion.

```java
ReportUtils.reportFileTransferRetryExhaustion(context, filePath, packetIndex, maxRetries);
```

**Parameters:**
- `filePath` - Path to the file being transferred
- `packetIndex` - Index of the failed packet
- `maxRetries` - Maximum number of retry attempts

#### `reportAckTimeoutError()`
Reports acknowledgment timeout errors.

```java
ReportUtils.reportAckTimeoutError(context, operation, packetIndex, timeoutMs);
```

**Parameters:**
- `operation` - Operation type
- `packetIndex` - Index of the packet
- `timeoutMs` - Timeout duration in milliseconds

### System & Configuration

#### `reportBluetoothPermissionError()`
Reports Bluetooth permission errors.

```java
ReportUtils.reportBluetoothPermissionError(context, operation, permission);
```

**Parameters:**
- `operation` - Operation requiring permission
- `permission` - Required permission (e.g., "BLUETOOTH_CONNECT")

#### `reportBluetoothAdapterIssue()`
Reports Bluetooth adapter hardware issues.

```java
ReportUtils.reportBluetoothAdapterIssue(context, issue, details);
```

**Parameters:**
- `issue` - Issue type (e.g., "not_supported", "disabled")
- `details` - Detailed description

#### `reportBluetoothInitializationFailure()`
Reports Bluetooth manager initialization failures.

```java
ReportUtils.reportBluetoothInitializationFailure(context, deviceType, reason, exception);
```

**Parameters:**
- `deviceType` - "standard", "k900", "nordic"
- `reason` - Failure reason
- `exception` - Associated exception

## 📊 Integration Examples

### StandardBluetoothManager Integration

```java
// Advertising failure
@Override
public void onStartFailure(int errorCode) {
    Log.e(TAG, "BLE advertising failed to start, error: " + errorCode);
    ReportUtils.reportAdvertisingFailure(context, errorCode, DEVICE_NAME);
}

// GATT server creation failure
if (gattServer == null) {
    Log.e(TAG, "Failed to create GATT server");
    ReportUtils.reportGattServerFailure(context, "create_server", 
        "unknown", -1, new Exception("Failed to create GATT server"));
    return;
}

// Data transmission failure
if (!isConnected() || connectedDevice == null) {
    Log.w(TAG, "Cannot send data - not connected");
    ReportUtils.reportDataTransmissionFailure(context, "standard", 
        connectedDevice != null ? connectedDevice.getAddress() : "unknown", 
        data.length, "not_connected", null);
    return false;
}
```

### K900BluetoothManager Integration

```java
// Serial communication failure
if (!success) {
    Log.e(TAG, "Failed to start serial communication");
    ReportUtils.reportSerialCommunicationFailure(context, "start_serial", 
        "unknown", -1, new Exception("Failed to start serial communication"));
}

// File transfer failure
if (!isSerialOpen) {
    Log.e(TAG, "Cannot send file - serial port not open");
    ReportUtils.reportFileTransferFailure(context, filePath, "send_file", 
        "serial_port_not_open", null);
    return false;
}

// Packet retry exhaustion
if (packetState.retryCount >= FILE_TRANSFER_MAX_RETRIES) {
    Log.e(TAG, "File packet " + packetIndex + " failed after " + FILE_TRANSFER_MAX_RETRIES + " retries");
    ReportUtils.reportFileTransferRetryExhaustion(context, currentFileTransfer.filePath, 
        packetIndex, FILE_TRANSFER_MAX_RETRIES);
}
```

### NordicBluetoothManager Integration

```java
// Advertising failure
@Override
public void onStartFailure(int errorCode) {
    Log.e(TAG, "BLE advertising failed to start, error: " + errorCode);
    ReportUtils.reportAdvertisingFailure(context, errorCode, DEVICE_NAME);
}
```

## 📈 Monitoring & Analytics

### Key Metrics to Track

1. **Connection Success Rate**
   - Successful vs failed connections by device type
   - Connection time distribution
   - Reconnection success rate

2. **Data Transmission Reliability**
   - Success rate of data sends by device type
   - Data size distribution
   - Transmission latency

3. **File Transfer Performance**
   - File transfer success rate
   - Transfer speed and duration
   - Packet retry distribution

4. **Error Distribution**
   - Error types and frequency
   - Device type performance comparison
   - Error patterns over time

### Alert Thresholds

- **Connection Failure Rate > 10%** - Investigate connectivity issues
- **Data Transmission Failure Rate > 5%** - Investigate communication issues
- **File Transfer Failure Rate > 15%** - Investigate file system issues
- **GATT Server Failures > 1%** - Critical infrastructure issue
- **Serial Communication Failures > 5%** - K900 hardware issue

## 🔧 Best Practices

### 1. Context-Rich Reporting
Always include relevant context in your reports:
- Device type and address
- Operation being performed
- Data sizes and packet indices
- Error codes and exception details

### 2. Appropriate Error Levels
Use the correct error levels:
- **CRITICAL** - Hardware failures, GATT server issues
- **ERROR** - Connection failures, data transmission errors
- **WARNING** - Performance issues, retry exhaustion
- **INFO** - Normal operations, successful recoveries

### 3. Exception Handling
Always wrap Bluetooth operations in try-catch blocks and report exceptions:

```java
try {
    // Bluetooth operation
    boolean success = performBluetoothOperation();
    if (!success) {
        ReportUtils.reportDataTransmissionFailure(context, deviceType, 
            deviceAddress, dataSize, "operation_failed", null);
    }
} catch (Exception e) {
    ReportUtils.reportDataTransmissionFailure(context, deviceType, 
        deviceAddress, dataSize, "exception_occurred", e);
}
```

### 4. Performance Monitoring
Track performance metrics alongside error reporting:

```java
long startTime = System.currentTimeMillis();
boolean success = sendData(data);
long duration = System.currentTimeMillis() - startTime;

if (success) {
    ReportUtils.reportPerformanceMetric(context, "bluetooth_data_send_duration", duration, "ms");
} else {
    ReportUtils.reportDataTransmissionFailure(context, deviceType, deviceAddress, 
        data.length, "timeout", null);
}
```

## 🚀 Future Enhancements

### Planned Features

1. **Real-time Monitoring Dashboard**
   - Live Bluetooth status monitoring
   - Error rate visualization
   - Performance metrics display

2. **Predictive Analytics**
   - Failure pattern detection
   - Proactive issue identification
   - Performance trend analysis

3. **Automated Recovery**
   - Automatic retry mechanisms
   - Connection recovery strategies
   - Error resolution suggestions

4. **Enhanced Context**
   - Device battery level
   - Signal strength metrics
   - Environmental factors

## 📚 Related Documentation

- [Generic Reporting System Guide](./GENERIC_REPORTING_SYSTEM.md)
- [ReportManager API Reference](./REPORTING_QUICK_REFERENCE.md)
- [Bluetooth Manager Architecture](./bluetooth/README.md)
- [Exception Handling Best Practices](./EXCEPTION_HANDLING_GUIDE.md)

---

This Bluetooth exception reporting system provides comprehensive monitoring and debugging capabilities for all Bluetooth operations in the ASG Client application, enabling better reliability and user experience. 