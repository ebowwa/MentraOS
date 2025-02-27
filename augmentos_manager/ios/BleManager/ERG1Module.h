//
//  ERG1Module.h
//  AugmentOS_Manager
//
//  Created by Matthew Fosse on 2/27/25.
//

#ifndef ERG1Manager_h
#define ERG1Manager_h

#import <React/RCTBridgeModule.h>
@interface ERG1Module : NSObject <RCTBridgeModule>
- (void) getDeviceID : (RCTResponseSenderBlock)successCallback errorCallback: (RCTResponseSenderBlock) errorCallback;
@end


#endif /* ERG1Module_h */
