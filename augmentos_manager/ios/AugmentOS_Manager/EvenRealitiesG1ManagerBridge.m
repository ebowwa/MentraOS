#import "EvenRealitiesG1ManagerBridge.h"
#import <React/RCTLog.h>
#import <React/RCTEventEmitter.h>

@interface EvenRealitiesG1ManagerBridge ()
@property (nonatomic, strong) RCTEventEmitter *eventEmitter;
@end

@implementation EvenRealitiesG1ManagerBridge

RCT_EXPORT_MODULE();

- (instancetype)init {
    self = [super init];
    if (self) {
        // Set this class as the delegate for the manager
        [EvenRealitiesG1Manager sharedInstance].delegate = self;
    }
    return self;
}

// Simple Hello World function that can be called from React Native
RCT_EXPORT_METHOD(helloWorld:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    NSString *message = [[EvenRealitiesG1Manager sharedInstance] helloWorld];
    resolve(message);
}

// Start scanning for G1 glasses
RCT_EXPORT_METHOD(startScan) {
    [[EvenRealitiesG1Manager sharedInstance] startScan];
}

// Stop scanning
RCT_EXPORT_METHOD(stopScan) {
    [[EvenRealitiesG1Manager sharedInstance] stopScan];
}

// Connect to saved devices
RCT_EXPORT_METHOD(connectToSavedDevices) {
    [[EvenRealitiesG1Manager sharedInstance] connectToSavedDevices];
}

// Disconnect from glasses
RCT_EXPORT_METHOD(disconnect) {
    [[EvenRealitiesG1Manager sharedInstance] disconnect];
}

// Display text on glasses
RCT_EXPORT_METHOD(displayText:(NSString *)text) {
    [[EvenRealitiesG1Manager sharedInstance] displayTextWall:text];
}

// Check connection status
RCT_EXPORT_METHOD(isConnected:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    BOOL connected = [[EvenRealitiesG1Manager sharedInstance] isConnected];
    resolve(@(connected));
}

// Save preferred device ID
RCT_EXPORT_METHOD(savePreferredDeviceId:(NSString *)deviceId) {
    [[EvenRealitiesG1Manager sharedInstance] savePreferredDeviceId:deviceId];
}

// Delete all saved preferences
RCT_EXPORT_METHOD(deleteAllSavedPreferences) {
    [[EvenRealitiesG1Manager sharedInstance] deleteAllSavedPreferences];
}

#pragma mark - EvenRealitiesG1ManagerDelegate

- (void)didConnectToGlasses {
    // In a real implementation, you would emit an event to React Native
    RCTLogInfo(@"Connected to G1 glasses");
}

- (void)didDisconnectFromGlasses {
    // In a real implementation, you would emit an event to React Native
    RCTLogInfo(@"Disconnected from G1 glasses");
}

- (void)didReceiveBatteryLevel:(int)level {
    // In a real implementation, you would emit an event to React Native
    RCTLogInfo(@"Battery level: %d%%", level);
}

- (void)didReceiveHeadUpEvent {
    // In a real implementation, you would emit an event to React Native
    RCTLogInfo(@"Head up event received");
}

- (void)didReceiveHeadDownEvent {
    // In a real implementation, you would emit an event to React Native
    RCTLogInfo(@"Head down event received");
}

- (void)didReceiveAudioData:(NSData *)audioData {
    // In a real implementation, you would process the audio data
    // or emit an event to React Native
}

@end 