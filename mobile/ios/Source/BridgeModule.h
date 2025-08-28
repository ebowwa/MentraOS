//
//  BridgeModule.h
//  MentraOS_Manager
//
//  Created by Matthew Fosse on 3/5/25.
//

#ifndef BridgeModule_h
#define BridgeModule_h

#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

//@interface BridgeModule : NSObject <RCTBridgeModule>
@interface BridgeModule : RCTEventEmitter

- (void)setup:(RCTResponseSenderBlock)successCallback errorCallback:(RCTResponseSenderBlock)errorCallback;
- (void)sendCommand:(NSString *)command :(RCTPromiseResolveBlock)resolve :(RCTPromiseRejectBlock)reject;
+ (void)emitEvent:(NSString *)eventName body:(id)body;

// Add support for events
- (NSArray<NSString *> *)supportedEvents;

@end
#endif /* BridgeModule_h */
