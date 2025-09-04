//
//  CoreCommsService.m
//  MentraOS_Manager
//
//  Created by Matthew Fosse on 3/4/25.
//

#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(Core, RCTEventEmitter)
  RCT_EXTERN_METHOD(supportedEvents)
@end
