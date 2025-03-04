//
//  ERG1Module.m
//  AugmentOS_Manager
//
//  Created by Matthew Fosse on 2/27/25.
//

#import <Foundation/Foundation.h>
#import "./ERG1Module.h"
// Import the Swift header
#import "AugmentOS_Manager-Swift.h"

@interface ERG1Module ()
@property (nonatomic, strong) ERG1Manager *erg1Manager;
@end

@implementation ERG1Module

// Export the module for React Native
RCT_EXPORT_MODULE(ERG1Module);

- (instancetype)init {
    self = [super init];
    if (self) {
        _erg1Manager = [[ERG1Manager alloc] init];
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
        // Call the Swift startScan method
        [self.erg1Manager startScan];
        successCallback(@[@"scanning_started"]);
        
        // Schedule to stop scan after 10 seconds
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
        // Call the Swift stopScan method
        [self.erg1Manager stopScan];
        
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

// connect to glasses we've already paired with:
RCT_EXPORT_METHOD(
  connectGlasses:
  (RCTPromiseResolveBlock) resolve
  rejecter: (RCTPromiseRejectBlock) reject
) {
  if ([self.erg1Manager connectGlasses]) {
    resolve(@"connected");
  } else {
    reject(@"0", @"glasses_not_paired", nil);
  }
}

// Disconnect from the connected device
RCT_EXPORT_METHOD(disconnect:(RCTResponseSenderBlock)successCallback errorCallback:(RCTResponseSenderBlock)errorCallback) {
    @try {
        // Currently there's no disconnect method in the Swift class
        // We would need to add one and call it here
        
        successCallback(@[@"Disconnecting not implemented in Swift class"]);
    }
    @catch(NSException *exception) {
        errorCallback(@[exception.description]);
    }
}

// send text to the glasses
RCT_EXPORT_METHOD(sendText:(NSString *)text disconnect:(RCTResponseSenderBlock)successCallback errorCallback:(RCTResponseSenderBlock)errorCallback)
{
  @try {
    // Create a dispatch group to wait for the async Swift method
//    dispatch_group_t group = dispatch_group_create();
//    dispatch_group_enter(group);
    
    // Call the Swift method on a background queue
//    dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
//      [self.erg1Manager sendTextWithText:text newScreen:newScreen currentPage:(uint8_t)currentPage maxPages:(uint8_t)maxPages isCommand:isCommand completionHandler:^(BOOL success) {
//        // Call the React Native callback with the result
//        completion(@[@(success)]);
//        dispatch_group_leave(group);
//      }];
//    });
    
    [self.erg1Manager sendTextExample:text];
    
    // Wait for the operation to complete with a timeout
//    dispatch_group_wait(group, dispatch_time(DISPATCH_TIME_NOW, 10 * NSEC_PER_SEC));
    
    successCallback(@[@"Sent text to glasses"]);
  }
  @catch(NSException *exception) {
    errorCallback(@[exception.description]);
  }
}

// Required for Swift interop
+ (BOOL)requiresMainQueueSetup {
    return YES;
}

@end
