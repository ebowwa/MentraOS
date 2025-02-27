//
//  ERG1Manager.m
//  AugmentOS_Manager
//
//  Created by Matthew Fosse on 2/27/25.
//

#import <Foundation/Foundation.h>
#import "./ERG1Module.h"


// UART Service UUIDs
#define UART_SERVICE_UUID @"6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define UART_TX_CHAR_UUID @"6E400002-B5A3-F393-E0A9-E50E24DCCA9E"
#define UART_RX_CHAR_UUID @"6E400003-B5A3-F393-E0A9-E50E24DCCA9E"
#define CLIENT_CHARACTERISTIC_CONFIG_UUID @"00002902-0000-1000-8000-00805f9b34fb"

// User defaults keys
#define SHARED_PREFS_NAME @"EvenRealitiesPrefs"
#define LEFT_DEVICE_KEY @"SavedG1LeftName"
#define RIGHT_DEVICE_KEY @"SavedG1RightName"
#define SAVED_G1_ID_KEY @"SAVED_G1_ID_KEY"

// Command constants
#define HEARTBEAT_INTERVAL 15.0
#define MIC_BEAT_INTERVAL 1800.0 // 30 minutes
#define DELAY_BETWEEN_CHUNKS 0.016
#define TEXT_COMMAND 0x4E
#define NOTIFICATION_COMMAND 0x4B
#define WHITELIST_CMD 0x04
#define MAX_CHUNK_SIZE 176


@interface ERG1Module ()

@property (nonatomic, strong) CBCentralManager *centralManager;
@property (nonatomic, strong) NSMutableArray *discoveredDevices;
@property (nonatomic, strong) CBPeripheral *connectedPeripheral;
@property (nonatomic, assign) BOOL isScanning;
@property (nonatomic, strong) RCTResponseSenderBlock scanSuccessCallback;
@property (nonatomic, strong) RCTResponseSenderBlock scanErrorCallback;
@property (nonatomic, strong) RCTResponseSenderBlock connectSuccessCallback;
@property (nonatomic, strong) RCTResponseSenderBlock connectErrorCallback;

@end


@implementation ERG1Module


// Export the module for React Native
RCT_EXPORT_MODULE(ERG1Manager);




- (instancetype)init {
    self = [super init];
    if (self) {
        _centralManager = [[CBCentralManager alloc] initWithDelegate:self queue:nil];
        _discoveredDevices = [NSMutableArray array];
        _isScanning = NO;
    }
    return self;
}





// Get device id method
RCT_EXPORT_METHOD(getDeviceID:(RCTResponseSenderBlock)successCallback errorCallback:(RCTResponseSenderBlock)errorCallback)
{
  @try{
    // For now, just return a test device ID
    NSString *deviceID = @"testdeviceId-456";
    successCallback(@[deviceID]);
  }
  @catch(NSException *exception){
    errorCallback(@[exception.description]);
  }
}

// Start scanning for devices
RCT_EXPORT_METHOD(startScan:(RCTResponseSenderBlock)successCallback errorCallback:(RCTResponseSenderBlock)errorCallback) {
    @try {
        if (_centralManager.state != CBManagerStatePoweredOn) {
            errorCallback(@[@"Bluetooth is not powered on"]);
            return;
        }
        
        if (_isScanning) {
            successCallback(@[@"Already scanning"]);
            return;
        }
        
        // Store callbacks for later use
        self.scanSuccessCallback = successCallback;
        self.scanErrorCallback = errorCallback;
        
        // Clear previously discovered devices
        [_discoveredDevices removeAllObjects];
        
        // Start scanning
        _isScanning = YES;
        NSDictionary *options = @{CBCentralManagerScanOptionAllowDuplicatesKey: @NO};
        [_centralManager scanForPeripheralsWithServices:nil options:options];
        
        NSLog(@"Started scanning for Even Realities G1 glasses");
        successCallback(@[@"Scanning started"]);
        
        // Stop scan after 10 seconds to avoid battery drain
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(10 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
            [self stopScan:nil errorCallback:nil];
        });
    }
    @catch(NSException *exception) {
        errorCallback(@[exception.description]);
    }
}

// Stop scanning for devices
RCT_EXPORT_METHOD(stopScan:(RCTResponseSenderBlock)successCallback errorCallback:(RCTResponseSenderBlock)errorCallback) {
    @try {
        if (_isScanning) {
            [_centralManager stopScan];
            _isScanning = NO;
            NSLog(@"Stopped scanning");
            
            // Return discovered devices to the original success callback
            if (self.scanSuccessCallback) {
                NSMutableArray *deviceList = [NSMutableArray array];
                for (CBPeripheral *peripheral in _discoveredDevices) {
                    [deviceList addObject:@{
                        @"id": peripheral.identifier.UUIDString,
                        @"name": peripheral.name ?: @"Unknown Device",
                        @"rssi": @0  // Default value since we don't store RSSI
                    }];
                }
                self.scanSuccessCallback(@[deviceList]);
                self.scanSuccessCallback = nil;
            }
        }
        
        if (successCallback) {
            successCallback(@[@"Scanning stopped"]);
        }
    }
    @catch(NSException *exception) {
        if (errorCallback) {
            errorCallback(@[exception.description]);
        }
    }
}

// Connect to a specific device
RCT_EXPORT_METHOD(connectToDevice:(NSString *)deviceId successCallback:(RCTResponseSenderBlock)successCallback errorCallback:(RCTResponseSenderBlock)errorCallback) {
    @try {
        // Store callbacks for later use
        self.connectSuccessCallback = successCallback;
        self.connectErrorCallback = errorCallback;
        
        // Find the peripheral with the given ID
        CBPeripheral *targetPeripheral = nil;
        for (CBPeripheral *peripheral in _discoveredDevices) {
            if ([peripheral.identifier.UUIDString isEqualToString:deviceId]) {
                targetPeripheral = peripheral;
                break;
            }
        }
        
        if (!targetPeripheral) {
            errorCallback(@[@"Device not found"]);
            return;
        }
        
        // Connect to the peripheral
        [_centralManager connectPeripheral:targetPeripheral options:nil];
        NSLog(@"Connecting to device: %@", targetPeripheral.name);
    }
    @catch(NSException *exception) {
        errorCallback(@[exception.description]);
    }
}

// Disconnect from the connected device
RCT_EXPORT_METHOD(disconnect:(RCTResponseSenderBlock)successCallback errorCallback:(RCTResponseSenderBlock)errorCallback) {
    @try {
        if (_connectedPeripheral) {
            [_centralManager cancelPeripheralConnection:_connectedPeripheral];
            NSLog(@"Disconnecting from device: %@", _connectedPeripheral.name);
            successCallback(@[@"Disconnecting"]);
        } else {
            successCallback(@[@"No device connected"]);
        }
    }
    @catch(NSException *exception) {
        errorCallback(@[exception.description]);
    }
}

#pragma mark - CBCentralManagerDelegate

- (void)centralManagerDidUpdateState:(CBCentralManager *)central {
    NSString *stateString;
    
    switch (central.state) {
        case CBManagerStatePoweredOn:
            stateString = @"Bluetooth is powered on";
            break;
        case CBManagerStatePoweredOff:
            stateString = @"Bluetooth is powered off";
            break;
        case CBManagerStateResetting:
            stateString = @"Bluetooth is resetting";
            break;
        case CBManagerStateUnauthorized:
            stateString = @"Bluetooth is unauthorized";
            break;
        case CBManagerStateUnsupported:
            stateString = @"Bluetooth is unsupported";
            break;
        case CBManagerStateUnknown:
            stateString = @"Bluetooth state is unknown";
            break;
        default:
            stateString = @"Unknown Bluetooth state";
            break;
    }
    
    NSLog(@"Bluetooth state changed: %@", stateString);
    
    // If Bluetooth is turned off while scanning, stop scanning
    if (central.state != CBManagerStatePoweredOn && _isScanning) {
        [self stopScan:nil errorCallback:nil];
    }
}

- (void)centralManager:(CBCentralManager *)central didDiscoverPeripheral:(CBPeripheral *)peripheral advertisementData:(NSDictionary<NSString *,id> *)advertisementData RSSI:(NSNumber *)RSSI {
    // Only process Even G1 devices
    if (!peripheral.name || ![peripheral.name containsString:@"Even G1_"]) {
        return;
    }
    
    NSLog(@"Found Even G1 device: %@", peripheral.name);
    
    // Check if we already discovered this device
    BOOL alreadyDiscovered = NO;
    for (CBPeripheral *discoveredPeripheral in _discoveredDevices) {
        if ([discoveredPeripheral.identifier isEqual:peripheral.identifier]) {
            alreadyDiscovered = YES;
            break;
        }
    }
    
    // Add to discovered devices if not already there
    if (!alreadyDiscovered) {
        [_discoveredDevices addObject:peripheral];
    }
}

- (void)centralManager:(CBCentralManager *)central didConnectPeripheral:(CBPeripheral *)peripheral {
    NSLog(@"Connected to peripheral: %@", peripheral.name);
    
    _connectedPeripheral = peripheral;
    peripheral.delegate = self;
    
    // Discover services
    [peripheral discoverServices:@[[CBUUID UUIDWithString:UART_SERVICE_UUID]]];
    
    // Notify success
    if (self.connectSuccessCallback) {
        self.connectSuccessCallback(@[@{
            @"id": peripheral.identifier.UUIDString,
            @"name": peripheral.name ?: @"Unknown Device"
        }]);
        self.connectSuccessCallback = nil;
    }
}

- (void)centralManager:(CBCentralManager *)central didFailToConnectPeripheral:(CBPeripheral *)peripheral error:(NSError *)error {
    NSLog(@"Failed to connect to peripheral: %@, error: %@", peripheral.name, error);
    
    // Notify error
    if (self.connectErrorCallback) {
        self.connectErrorCallback(@[error.localizedDescription]);
        self.connectErrorCallback = nil;
    }
}

- (void)centralManager:(CBCentralManager *)central didDisconnectPeripheral:(CBPeripheral *)peripheral error:(NSError *)error {
    NSLog(@"Disconnected from peripheral: %@, error: %@", peripheral.name, error);
    
    _connectedPeripheral = nil;
}

#pragma mark - CBPeripheralDelegate

- (void)peripheral:(CBPeripheral *)peripheral didDiscoverServices:(NSError *)error {
    if (error) {
        NSLog(@"Error discovering services: %@", error);
        return;
    }
    
    for (CBService *service in peripheral.services) {
        if ([service.UUID isEqual:[CBUUID UUIDWithString:UART_SERVICE_UUID]]) {
            [peripheral discoverCharacteristics:@[
                [CBUUID UUIDWithString:UART_TX_CHAR_UUID],
                [CBUUID UUIDWithString:UART_RX_CHAR_UUID]
            ] forService:service];
        }
    }
}

- (void)peripheral:(CBPeripheral *)peripheral didDiscoverCharacteristicsForService:(CBService *)service error:(NSError *)error {
    if (error) {
        NSLog(@"Error discovering characteristics: %@", error);
        return;
    }
    
    for (CBCharacteristic *characteristic in service.characteristics) {
        if ([characteristic.UUID isEqual:[CBUUID UUIDWithString:UART_RX_CHAR_UUID]]) {
            // Enable notifications for RX characteristic
            [peripheral setNotifyValue:YES forCharacteristic:characteristic];
        }
    }
}

- (void)peripheral:(CBPeripheral *)peripheral didUpdateValueForCharacteristic:(CBCharacteristic *)characteristic error:(NSError *)error {
    if (error) {
        NSLog(@"Error receiving data: %@", error);
        return;
    }
    
    // Process received data if needed
    if ([characteristic.UUID isEqual:[CBUUID UUIDWithString:UART_RX_CHAR_UUID]]) {
        NSData *data = characteristic.value;
        if (data.length == 0) return;
        
        // Log received data for debugging
        NSLog(@"Received data from peripheral: %@ (length: %lu)", peripheral.name, (unsigned long)data.length);
    }
}

@end
