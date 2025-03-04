//
//  ERG1Module.h
//  AugmentOS_Manager
//
//  Created by Matthew Fosse on 2/27/25.
//

#ifndef ERG1Module_h
#define ERG1Module_h

#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface ERG1Module : NSObject <RCTBridgeModule>

// Core React Native method
- (void)getDeviceID:(RCTResponseSenderBlock)successCallback errorCallback:(RCTResponseSenderBlock)errorCallback;

// Scanning methods
- (void)startScan:(RCTResponseSenderBlock)successCallback errorCallback:(RCTResponseSenderBlock)errorCallback;
- (void)stopScan:(RCTResponseSenderBlock)successCallback errorCallback:(RCTResponseSenderBlock)errorCallback;

// Connection methods
- (void)connectGlasses:(RCTPromiseResolveBlock)resolve errorCallback:(RCTPromiseRejectBlock)reject;
- (void)disconnect:(RCTResponseSenderBlock)successCallback errorCallback:(RCTResponseSenderBlock)errorCallback;

//- (void)sendText:(NSString *)text successCallback:(RCTResponseSenderBlock)successCallback errorCallback:(RCTResponseSenderBlock)errorCallback;
- (void)sendText:(NSString *)text successCallback:(RCTResponseSenderBlock)successCallback errorCallback:(RCTResponseSenderBlock)errorCallback;

// Add support for events
- (NSArray<NSString *> *)supportedEvents;

@end

#endif /* ERG1Module_h */
