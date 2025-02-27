#import "EvenRealitiesG1Manager.h"

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

@interface EvenRealitiesG1Manager ()

@property (nonatomic, strong) CBCentralManager *centralManager;
@property (nonatomic, strong) CBPeripheral *leftGlassPeripheral;
@property (nonatomic, strong) CBPeripheral *rightGlassPeripheral;
@property (nonatomic, strong) CBCharacteristic *leftTxChar;
@property (nonatomic, strong) CBCharacteristic *leftRxChar;
@property (nonatomic, strong) CBCharacteristic *rightTxChar;
@property (nonatomic, strong) CBCharacteristic *rightRxChar;
@property (nonatomic, assign) BOOL isLeftConnected;
@property (nonatomic, assign) BOOL isRightConnected;
@property (nonatomic, assign) BOOL isScanning;
@property (nonatomic, assign) BOOL isLeftBonded;
@property (nonatomic, assign) BOOL isRightBonded;
@property (nonatomic, assign) int batteryLeft;
@property (nonatomic, assign) int batteryRight;
@property (nonatomic, assign) int currentSeq;
@property (nonatomic, assign) int textSeqNum;
@property (nonatomic, assign) int notificationNum;
@property (nonatomic, strong) NSTimer *heartbeatTimer;
@property (nonatomic, strong) NSTimer *micBeatTimer;
@property (nonatomic, strong) NSString *savedG1LeftName;
@property (nonatomic, strong) NSString *savedG1RightName;
@property (nonatomic, strong) NSString *preferredG1DeviceId;
@property (nonatomic, strong) NSMutableArray *sendQueue;
@property (nonatomic, assign) BOOL isProcessingQueue;
@property (nonatomic, assign) BOOL shouldRunOnboardMic;

@end

@implementation EvenRealitiesG1Manager

+ (instancetype)sharedInstance {
    static EvenRealitiesG1Manager *instance = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        instance = [[self alloc] init];
    });
    return instance;
}

- (instancetype)init {
    self = [super init];
    if (self) {
        _centralManager = [[CBCentralManager alloc] initWithDelegate:self queue:nil];
        _isLeftConnected = NO;
        _isRightConnected = NO;
        _isScanning = NO;
        _isLeftBonded = NO;
        _isRightBonded = NO;
        _batteryLeft = -1;
        _batteryRight = -1;
        _currentSeq = 0;
        _textSeqNum = 0;
        _notificationNum = 10;
        _sendQueue = [NSMutableArray array];
        _isProcessingQueue = NO;
        _shouldRunOnboardMic = YES; // Default to enabled
        
        [self loadPairedDeviceNames];
        _preferredG1DeviceId = [self getPreferredG1DeviceId];
    }
    return self;
}

#pragma mark - Public Methods

- (void)startScan {
    if (_centralManager.state != CBManagerStatePoweredOn) {
        NSLog(@"Bluetooth is not powered on");
        return;
    }
    
    if (_isScanning) {
        NSLog(@"Already scanning");
        return;
    }
    
    _isScanning = YES;
    NSLog(@"Starting scan for Even Realities G1 glasses");
    
    // Set up scan options
    NSDictionary *options = @{CBCentralManagerScanOptionAllowDuplicatesKey: @NO};
    [_centralManager scanForPeripheralsWithServices:nil options:options];
    
    // Stop scan after 10 seconds to avoid battery drain
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(10 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        [self stopScan];
    });
}

- (void)stopScan {
    if (_isScanning) {
        [_centralManager stopScan];
        _isScanning = NO;
        NSLog(@"Stopped scanning");
    }
}

- (void)connectToSavedDevices {
    if (!_savedG1LeftName || !_savedG1RightName) {
        NSLog(@"No saved devices to connect to");
        return;
    }
    
    [self startScan]; // Start scanning to find the saved devices
}

- (void)disconnect {
    // Stop timers
    [self stopHeartbeat];
    [self stopMicBeat];
    
    // Disconnect from peripherals
    if (_leftGlassPeripheral) {
        [_centralManager cancelPeripheralConnection:_leftGlassPeripheral];
    }
    
    if (_rightGlassPeripheral) {
        [_centralManager cancelPeripheralConnection:_rightGlassPeripheral];
    }
    
    _isLeftConnected = NO;
    _isRightConnected = NO;
    _leftGlassPeripheral = nil;
    _rightGlassPeripheral = nil;
    _leftTxChar = nil;
    _leftRxChar = nil;
    _rightTxChar = nil;
    _rightRxChar = nil;
}

- (BOOL)isConnected {
    return _isLeftConnected && _isRightConnected;
}

- (void)displayTextWall:(NSString *)text {
    if (![self isConnected]) {
        NSLog(@"Cannot display text: Not connected to glasses");
        return;
    }
    
    NSArray *chunks = [self createTextWallChunks:text];
    [self sendChunks:chunks];
}

- (void)displayBitmap:(UIImage *)image {
    // Implementation for converting UIImage to BMP format and sending to glasses
    // This would require additional image processing code
    NSLog(@"Display bitmap not yet implemented");
}

- (void)setMicEnabled:(BOOL)enabled {
    if (![self isConnected]) {
        NSLog(@"Cannot set mic: Not connected to glasses");
        return;
    }
    
    NSLog(@"Setting mic enabled: %@", enabled ? @"YES" : @"NO");
    
    uint8_t command = 0x0E; // Command for MIC control
    uint8_t enableByte = enabled ? 1 : 0; // 1 to enable, 0 to disable
    
    uint8_t buffer[2] = {command, enableByte};
    NSData *data = [NSData dataWithBytes:buffer length:2];
    
    [self sendDataSequentially:data onlyLeft:NO onlyRight:YES waitTime:300];
    NSLog(@"Sent MIC command");
    
    _shouldRunOnboardMic = enabled;
}

- (void)setBrightness:(int)brightness autoMode:(BOOL)autoMode {
    if (![self isConnected]) {
        NSLog(@"Cannot set brightness: Not connected to glasses");
        return;
    }
    
    // Validate brightness range (0-100 to 0-63)
    int validBrightness = (brightness * 63) / 100;
    
    uint8_t buffer[3] = {
        0x01,                   // Command
        (uint8_t)validBrightness, // Brightness level (0~63)
        autoMode ? 1 : 0        // Auto light (0 = off, 1 = on)
    };
    
    NSData *data = [NSData dataWithBytes:buffer length:3];
    [self sendDataSequentially:data onlyLeft:NO onlyRight:NO waitTime:0];
    
    NSLog(@"Sent brightness command: %d, Auto: %@", brightness, autoMode ? @"YES" : @"NO");
}

- (void)setHeadUpAngle:(int)angle {
    if (![self isConnected]) {
        NSLog(@"Cannot set head up angle: Not connected to glasses");
        return;
    }
    
    // Validate angle range (0-60)
    angle = MAX(0, MIN(60, angle));
    
    uint8_t buffer[3] = {
        0x0B,           // Command for configuring headUp angle
        (uint8_t)angle, // Angle value (0~60)
        0x01            // Level (fixed at 0x01)
    };
    
    NSData *data = [NSData dataWithBytes:buffer length:3];
    [self sendDataSequentially:data onlyLeft:NO onlyRight:NO waitTime:0];
    
    NSLog(@"Sent head up angle command: %d", angle);
}

- (void)showHomeScreen {
    [self displayTextWall:@" "];
}

- (void)queryBatteryStatus {
    if (![self isConnected]) {
        NSLog(@"Cannot query battery: Not connected to glasses");
        return;
    }
    
    uint8_t buffer[2] = {
        0x2C,  // Command
        0x01   // Use 0x02 for iOS
    };
    
    NSData *data = [NSData dataWithBytes:buffer length:2];
    [self sendDataSequentially:data onlyLeft:NO onlyRight:NO waitTime:250];
    
    NSLog(@"Sent battery status query");
}

- (void)findCompatibleDeviceNames {
    [self startScan];
}

- (void)savePreferredDeviceId:(NSString *)deviceId {
    [[NSUserDefaults standardUserDefaults] setObject:deviceId forKey:SAVED_G1_ID_KEY];
    [[NSUserDefaults standardUserDefaults] synchronize];
    _preferredG1DeviceId = deviceId;
}

- (void)deleteAllSavedPreferences {
    [[NSUserDefaults standardUserDefaults] removeObjectForKey:SAVED_G1_ID_KEY];
    [[NSUserDefaults standardUserDefaults] removeObjectForKey:LEFT_DEVICE_KEY];
    [[NSUserDefaults standardUserDefaults] removeObjectForKey:RIGHT_DEVICE_KEY];
    [[NSUserDefaults standardUserDefaults] synchronize];
    
    _savedG1LeftName = nil;
    _savedG1RightName = nil;
    _preferredG1DeviceId = nil;
    
    NSLog(@"Deleted all Even Realities preferences");
}

- (NSString *)helloWorld {
    return @"Hello from Even Realities G1 Manager!";
}

#pragma mark - Private Methods

- (void)loadPairedDeviceNames {
    _savedG1LeftName = [[NSUserDefaults standardUserDefaults] objectForKey:LEFT_DEVICE_KEY];
    _savedG1RightName = [[NSUserDefaults standardUserDefaults] objectForKey:RIGHT_DEVICE_KEY];
    NSLog(@"Loaded paired device names: Left=%@, Right=%@", _savedG1LeftName, _savedG1RightName);
}

- (void)savePairedDeviceNames {
    if (_savedG1LeftName && _savedG1RightName) {
        [[NSUserDefaults standardUserDefaults] setObject:_savedG1LeftName forKey:LEFT_DEVICE_KEY];
        [[NSUserDefaults standardUserDefaults] setObject:_savedG1RightName forKey:RIGHT_DEVICE_KEY];
        [[NSUserDefaults standardUserDefaults] synchronize];
        NSLog(@"Saved paired device names: Left=%@, Right=%@", _savedG1LeftName, _savedG1RightName);
    }
}

- (NSString *)getPreferredG1DeviceId {
    return [[NSUserDefaults standardUserDefaults] objectForKey:SAVED_G1_ID_KEY];
}

- (NSString *)parsePairingIdFromDeviceName:(NSString *)deviceName {
    if (!deviceName || [deviceName length] == 0) {
        return nil;
    }
    
    NSRegularExpression *regex = [NSRegularExpression regularExpressionWithPattern:@"G1_(\\d+)_" options:0 error:nil];
    NSTextCheckingResult *match = [regex firstMatchInString:deviceName options:0 range:NSMakeRange(0, [deviceName length])];
    
    if (match) {
        NSRange idRange = [match rangeAtIndex:1];
        return [deviceName substringWithRange:idRange];
    }
    
    return nil;
}

- (void)startHeartbeat {
    [self stopHeartbeat];
    
    _heartbeatTimer = [NSTimer scheduledTimerWithTimeInterval:HEARTBEAT_INTERVAL
                                                      target:self
                                                    selector:@selector(sendHeartbeat)
                                                    userInfo:nil
                                                     repeats:YES];
    
    // Send first heartbeat immediately
    [self sendHeartbeat];
}

- (void)stopHeartbeat {
    [_heartbeatTimer invalidate];
    _heartbeatTimer = nil;
}

- (void)startMicBeat {
    [self stopMicBeat];
    
    _micBeatTimer = [NSTimer scheduledTimerWithTimeInterval:MIC_BEAT_INTERVAL
                                                    target:self
                                                  selector:@selector(sendMicBeat)
                                                  userInfo:nil
                                                   repeats:YES];
    
    // Send first mic beat immediately
    [self sendMicBeat];
}

- (void)stopMicBeat {
    [_micBeatTimer invalidate];
    _micBeatTimer = nil;
}

- (void)sendHeartbeat {
    uint8_t buffer[6] = {
        0x25,
        6,
        (uint8_t)(_currentSeq & 0xFF),
        0x00,
        0x04,
        (uint8_t)(_currentSeq++ & 0xFF)
    };
    
    NSData *data = [NSData dataWithBytes:buffer length:6];
    [self sendDataSequentially:data onlyLeft:NO onlyRight:NO waitTime:100];
    
    // Query battery status every 10 heartbeats or if we don't have battery info
    if (_batteryLeft == -1 || _batteryRight == -1) {
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.5 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
            [self queryBatteryStatus];
        });
    }
}

- (void)sendMicBeat {
    NSLog(@"Sending MIC beat");
    [self setMicEnabled:YES];
}

- (void)sendWhiteListCommand {
    NSLog(@"Sending whitelist command");
    
    NSArray *chunks = [self getWhitelistChunks];
    [self sendChunks:chunks];
}

- (NSArray *)getWhitelistChunks {
    // Create a simple whitelist JSON with AugmentOS app
    NSDictionary *app = @{@"id": @"com.augment.os", @"name": @"AugmentOS"};
    NSArray *appList = @[app];
    
    NSDictionary *appObject = @{@"list": appList, @"enable": @YES};
    NSDictionary *whitelistJson = @{
        @"calendar_enable": @NO,
        @"call_enable": @NO,
        @"msg_enable": @NO,
        @"ios_mail_enable": @NO,
        @"app": appObject
    };
    
    NSError *error;
    NSData *jsonData = [NSJSONSerialization dataWithJSONObject:whitelistJson options:0 error:&error];
    
    if (error) {
        NSLog(@"Error creating whitelist JSON: %@", error);
        return @[];
    }
    
    NSString *jsonString = [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
    NSLog(@"Creating chunks for whitelist: %@", jsonString);
    
    return [self createWhitelistChunks:jsonString];
}

- (NSArray *)createWhitelistChunks:(NSString *)json {
    NSData *jsonData = [json dataUsingEncoding:NSUTF8StringEncoding];
    NSUInteger dataLength = [jsonData length];
    NSUInteger totalChunks = ceil((double)dataLength / MAX_CHUNK_SIZE);
    
    NSMutableArray *chunks = [NSMutableArray array];
    
    for (NSUInteger i = 0; i < totalChunks; i++) {
        NSUInteger start = i * MAX_CHUNK_SIZE;
        NSUInteger length = MIN(MAX_CHUNK_SIZE, dataLength - start);
        NSData *chunkData = [jsonData subdataWithRange:NSMakeRange(start, length)];
        
        // Create header: [WHITELIST_CMD, total_chunks, chunk_index]
        uint8_t header[3] = {
            WHITELIST_CMD,
            (uint8_t)totalChunks,
            (uint8_t)i
        };
        
        NSMutableData *fullChunk = [NSMutableData dataWithBytes:header length:3];
        [fullChunk appendData:chunkData];
        
        [chunks addObject:fullChunk];
    }
    
    return chunks;
}

- (NSArray *)createTextWallChunks:(NSString *)text {
    // This is a simplified version - the full implementation would need text layout calculations
    NSData *textData = [text dataUsingEncoding:NSUTF8StringEncoding];
    NSUInteger dataLength = [textData length];
    NSUInteger totalChunks = ceil((double)dataLength / MAX_CHUNK_SIZE);
    
    NSMutableArray *chunks = [NSMutableArray array];
    
    for (NSUInteger i = 0; i < totalChunks; i++) {
        NSUInteger start = i * MAX_CHUNK_SIZE;
        NSUInteger length = MIN(MAX_CHUNK_SIZE, dataLength - start);
        NSData *chunkData = [textData subdataWithRange:NSMakeRange(start, length)];
        
        // Create header with protocol specifications
        uint8_t screenStatus = 0x71; // New content (0x01) + Text Show (0x70)
        uint8_t header[9] = {
            TEXT_COMMAND,       // Command type
            (uint8_t)_textSeqNum, // Sequence number
            (uint8_t)totalChunks, // Total packages
            (uint8_t)i,         // Current package number
            screenStatus,       // Screen status
            0x00,               // new_char_pos0 (high)
            0x00,               // new_char_pos1 (low)
            0x00,               // Current page number
            0x01                // Max page number
        };
        
        NSMutableData *fullChunk = [NSMutableData dataWithBytes:header length:9];
        [fullChunk appendData:chunkData];
        
        [chunks addObject:fullChunk];
    }
    
    // Increment sequence number for next text
    _textSeqNum = (_textSeqNum + 1) % 256;
    
    return chunks;
}

- (void)sendChunks:(NSArray *)chunks {
    for (NSData *chunk in chunks) {
        [self sendDataSequentially:chunk onlyLeft:NO onlyRight:NO waitTime:0];
    }
}

- (void)sendDataSequentially:(NSData *)data onlyLeft:(BOOL)onlyLeft onlyRight:(BOOL)onlyRight waitTime:(int)waitTime {
    // Add to queue
    NSDictionary *request = @{
        @"data": data,
        @"onlyLeft": @(onlyLeft),
        @"onlyRight": @(onlyRight),
        @"waitTime": @(waitTime)
    };
    
    [_sendQueue addObject:request];
    
    // Start processing if not already running
    if (!_isProcessingQueue) {
        [self processQueue];
    }
}

- (void)processQueue {
    if ([_sendQueue count] == 0) {
        _isProcessingQueue = NO;
        return;
    }
    
    _isProcessingQueue = YES;
    NSDictionary *request = [_sendQueue firstObject];
    [_sendQueue removeObjectAtIndex:0];
    
    NSData *data = request[@"data"];
    BOOL onlyLeft = [request[@"onlyLeft"] boolValue];
    BOOL onlyRight = [request[@"onlyRight"] boolValue];
    int waitTime = [request[@"waitTime"] intValue];
    
    // Send to left glass
    if (!onlyRight && _leftGlassPeripheral && _leftTxChar && _isLeftConnected) {
        [_leftGlassPeripheral writeValue:data forCharacteristic:_leftTxChar type:CBCharacteristicWriteWithResponse];
    }
    
    // Send to right glass
    if (!onlyLeft && _rightGlassPeripheral && _rightTxChar && _isRightConnected) {
        [_rightGlassPeripheral writeValue:data forCharacteristic:_rightTxChar type:CBCharacteristicWriteWithResponse];
    }
    
    // Schedule next send after delay
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)((DELAY_BETWEEN_CHUNKS + (waitTime / 1000.0)) * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        [self processQueue];
    });
}

- (void)initializeGlasses {
    if (_isLeftConnected && _isRightConnected) {
        NSLog(@"Both glasses connected, initializing...");
        
        // Send firmware request command
        uint8_t firmwareCmd[2] = {0x6E, 0x74};
        [self sendDataSequentially:[NSData dataWithBytes:firmwareCmd length:2] onlyLeft:NO onlyRight:NO waitTime:0];
        
        // Send init command
        uint8_t initCmd[2] = {0x4D, 0xFB};
        [self sendDataSequentially:[NSData dataWithBytes:initCmd length:2] onlyLeft:NO onlyRight:NO waitTime:0];
        
        // Turn off wear detection
        uint8_t wearDetectionCmd[2] = {0x27, 0x00};
        [self sendDataSequentially:[NSData dataWithBytes:wearDetectionCmd length:2] onlyLeft:NO onlyRight:NO waitTime:0];
        
        // Turn off silent mode
        uint8_t silentModeCmd[2] = {0x03, 0x0A};
        [self sendDataSequentially:[NSData dataWithBytes:silentModeCmd length:2] onlyLeft:NO onlyRight:NO waitTime:0];
        
        // Query battery status
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.01 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
            [self queryBatteryStatus];
        });
        
        // Set brightness (default 50%)
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.01 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
            [self setBrightness:50 autoMode:NO];
        });
        
        // Enable mic if needed
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.01 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
            [self setMicEnabled:_shouldRunOnboardMic];
        });
        
        // Send whitelist command
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.01 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
            [self sendWhiteListCommand];
        });
        
        // Start heartbeat
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(10 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
            [self startHeartbeat];
        });
        
        // Start mic beat
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(30 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
            [self startMicBeat];
        });
        
        // Show home screen
        [self showHomeScreen];
        
        // Notify delegate
        if ([_delegate respondsToSelector:@selector(didConnectToGlasses)]) {
            [_delegate didConnectToGlasses];
        }
    }
}

#pragma mark - CBCentralManagerDelegate

- (void)centralManagerDidUpdateState:(CBCentralManager *)central {
    switch (central.state) {
        case CBManagerStatePoweredOn:
            NSLog(@"Bluetooth is powered on");
            break;
            
        case CBManagerStatePoweredOff:
            NSLog(@"Bluetooth is powered off");
            [self disconnect];
            break;
            
        default:
            NSLog(@"Bluetooth state changed: %ld", (long)central.state);
            break;
    }
}

- (void)centralManager:(CBCentralManager *)central didDiscoverPeripheral:(CBPeripheral *)peripheral advertisementData:(NSDictionary<NSString *,id> *)advertisementData RSSI:(NSNumber *)RSSI {
    NSString *name = peripheral.name;
    
    // Check if it's an Even G1 device
    if (!name || ![name containsString:@"Even G1_"]) {
        return;
    }
    
    // Check if it matches our preferred device ID
    if (_preferredG1DeviceId && ![name containsString:[NSString stringWithFormat:@"G1_%@_", _preferredG1DeviceId]]) {
        NSLog(@"Found G1 device but not our preferred ID: %@", name);
        return;
    }
    
    BOOL isLeft = [name containsString:@"_L_"];
    NSLog(@"Found %@ glass: %@", isLeft ? @"LEFT" : @"RIGHT", name);
    
    // If we have saved device names, check if this is one of them
    if (_savedG1LeftName && _savedG1RightName) {
        if (!([name isEqualToString:_savedG1LeftName] || [name isEqualToString:_savedG1RightName])) {
            NSLog(@"Device doesn't match saved names");
            return;
        }
    }
    
    // Store the device and connect
    if (isLeft) {
        _leftGlassPeripheral = peripheral;
        _savedG1LeftName = name;
    } else {
        _rightGlassPeripheral = peripheral;
        _savedG1RightName = name;
    }
    
    // Connect to the peripheral
    [_centralManager connectPeripheral:peripheral options:nil];
    
    // If we found both devices, stop scanning
    if (_leftGlassPeripheral && _rightGlassPeripheral) {
        [self stopScan];
        [self savePairedDeviceNames];
    }
}

- (void)centralManager:(CBCentralManager *)central didConnectPeripheral:(CBPeripheral *)peripheral {
    NSLog(@"Connected to peripheral: %@", peripheral.name);
    
    // Set the peripheral's delegate to self
    peripheral.delegate = self;
    
    // Discover services
    [peripheral discoverServices:@[[CBUUID UUIDWithString:UART_SERVICE_UUID]]];
    
    // Update connection state based on which peripheral connected
    if ([peripheral.name containsString:@"_L_"]) {
        _isLeftConnected = YES;
    } else if ([peripheral.name containsString:@"_R_"]) {
        _isRightConnected = YES;
    }
    
    // If both glasses are connected, initialize them
    if (_isLeftConnected && _isRightConnected) {
        [self initializeGlasses];
    }
}

- (void)centralManager:(CBCentralManager *)central didDisconnectPeripheral:(CBPeripheral *)peripheral error:(NSError *)error {
    NSLog(@"Disconnected from peripheral: %@, error: %@", peripheral.name, error);
    
    // Update connection state based on which peripheral disconnected
    if ([peripheral.name containsString:@"_L_"]) {
        _isLeftConnected = NO;
        _leftGlassPeripheral = nil;
    } else if ([peripheral.name containsString:@"_R_"]) {
        _isRightConnected = NO;
        _rightGlassPeripheral = nil;
    }
    
    // Notify delegate
    if ([_delegate respondsToSelector:@selector(didDisconnectFromGlasses)]) {
        [_delegate didDisconnectFromGlasses];
    }
    
    // Try to reconnect
    if (!_isLeftConnected && !_isRightConnected) {
        [self stopHeartbeat];
        [self stopMicBeat];
        
        // Try to reconnect after a delay
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(5 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
            [self connectToSavedDevices];
        });
    }
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
    
    BOOL isLeft = [peripheral.name containsString:@"_L_"];
    
    for (CBCharacteristic *characteristic in service.characteristics) {
        if ([characteristic.UUID isEqual:[CBUUID UUIDWithString:UART_TX_CHAR_UUID]]) {
            if (isLeft) {
                _leftTxChar = characteristic;
            } else {
                _rightTxChar = characteristic;
            }
        } else if ([characteristic.UUID isEqual:[CBUUID UUIDWithString:UART_RX_CHAR_UUID]]) {
            if (isLeft) {
                _leftRxChar = characteristic;
            } else {
                _rightRxChar = characteristic;
            }
            
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
    
    if ([characteristic.UUID isEqual:[CBUUID UUIDWithString:UART_RX_CHAR_UUID]]) {
        NSData *data = characteristic.value;
        if (data.length == 0) return;
        
        uint8_t *bytes = (uint8_t *)[data bytes];
        BOOL isLeft = [peripheral.name containsString:@"_L_"];
        
        // Handle MIC audio data
        if (data.length > 0 && bytes[0] == 0xF1) {
            if (!isLeft && _shouldRunOnboardMic) {
                // Only process audio from right glass
                if ([_delegate respondsToSelector:@selector(didReceiveAudioData:)]) {
                    [_delegate didReceiveAudioData:data];
                }
            }
        }
        // HEAD UP MOVEMENTS
        else if (data.length > 1 && bytes[0] == 0xF5 && bytes[1] == 0x02) {
            if (!isLeft) {
                NSLog(@"HEAD UP MOVEMENT DETECTED");
                if ([_delegate respondsToSelector:@selector(didReceiveHeadUpEvent)]) {
                    [_delegate didReceiveHeadUpEvent];
                }
            }
        }
        // HEAD DOWN MOVEMENTS
        else if (data.length > 1 && bytes[0] == 0xF5 && bytes[1] == 0x03) {
            if (!isLeft) {
                NSLog(@"HEAD DOWN MOVEMENT DETECTED");
                if ([_delegate respondsToSelector:@selector(didReceiveHeadDownEvent)]) {
                    [_delegate didReceiveHeadDownEvent];
                }
            }
        }
        // BATTERY RESPONSE
        else if (data.length > 2 && bytes[0] == 0x2C && bytes[1] == 0x66) {
            int batteryLevel = bytes[2];
            
            if (isLeft) {
                _batteryLeft = batteryLevel;
            } else {
                _batteryRight = batteryLevel;
            }
            
            if (_batteryLeft != -1 && _batteryRight != -1) {
                int minBatt = MIN(_batteryLeft, _batteryRight);
                if ([_delegate respondsToSelector:@selector(didReceiveBatteryLevel:)]) {
                    [_delegate didReceiveBatteryLevel:minBatt];
                }
            }
        }
    }
}

- (void)peripheral:(CBPeripheral *)peripheral didWriteValueForCharacteristic:(CBCharacteristic *)characteristic error:(NSError *)error {
    if (error) {
        NSLog(@"Error writing to characteristic: %@", error);
    }
}

@end