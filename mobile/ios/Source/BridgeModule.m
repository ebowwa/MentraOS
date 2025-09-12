//
//  BridgeModule.m
//
//  Created by Matthew Fosse on 3/5/25.
//

#import <Foundation/Foundation.h>
#import <React/RCTEventEmitter.h>
#import "./BridgeModule.h"
#import "MentraOS-Swift.h"

@interface BridgeModule ()
@end

@implementation BridgeModule

// Static reference for event emission
static BridgeModule *sharedEmitter = nil;

// Export the module for React Native
RCT_EXPORT_MODULE(BridgeModule);

- (instancetype)init {
    self = [super init];
    if (self) {
        // Set the shared emitter reference
        sharedEmitter = self;
    }
    return self;
}

// Class method to get the shared emitter instance
+ (BridgeModule *)sharedEmitter {
    return sharedEmitter;
}

// Supported events - combined list from both classes
- (NSArray<NSString *> *)supportedEvents {
  return @[@"CoreMessageEvent"];
}

// Method to emit events from other parts of the code
+ (void)emitEventWithName:(NSString *)eventName body:(id)body {
    if (sharedEmitter && sharedEmitter.bridge) {
        [sharedEmitter sendEventWithName:eventName body:body];
    }
}

RCT_EXPORT_METHOD(
  sendCommand:
  (NSString *)command
  resolver:(RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
)
{
  @try {
    id result = [Bridge handleCommand:command];
    resolve(result);
  }
  @catch(NSException *exception) {
    reject(@"0", exception.description, nil);
  }
}

// Required for Swift interop
+ (BOOL)requiresMainQueueSetup {
    return YES;
}

@end
