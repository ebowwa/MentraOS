//
//  ERG1Module.h
//  AugmentOS_Manager
//
//  Created by Matthew Fosse on 2/27/25.
//

#ifndef ERG1Manager_h
#define ERG1Manager_h

#import <Foundation/Foundation.h>
#import <CoreBluetooth/CoreBluetooth.h>
#import <UIKit/UIKit.h>
#import <React/RCTBridgeModule.h>

@interface ERG1Module : NSObject <RCTBridgeModule, CBCentralManagerDelegate, CBPeripheralDelegate>

// Core React Native method
- (void)getDeviceID:(RCTResponseSenderBlock)successCallback errorCallback:(RCTResponseSenderBlock)errorCallback;

// Scanning methods
- (void)startScan:(RCTResponseSenderBlock)successCallback errorCallback:(RCTResponseSenderBlock)errorCallback;
- (void)stopScan:(RCTResponseSenderBlock)successCallback errorCallback:(RCTResponseSenderBlock)errorCallback;

// Connection methods
- (void)connectToDevice:(NSString *)deviceId successCallback:(RCTResponseSenderBlock)successCallback errorCallback:(RCTResponseSenderBlock)errorCallback;
- (void)disconnect:(RCTResponseSenderBlock)successCallback errorCallback:(RCTResponseSenderBlock)errorCallback;

@end

#endif /* ERG1Module_h */
