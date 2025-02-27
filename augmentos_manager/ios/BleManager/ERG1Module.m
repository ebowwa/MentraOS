//
//  ERG1Manager.m
//  AugmentOS_Manager
//
//  Created by Matthew Fosse on 2/27/25.
//

#import <Foundation/Foundation.h>
#import "./ERG1Module.h"


@implementation ERG1Module


// Export the service module, this is the name it'll be accessible under in JS:
RCT_EXPORT_MODULE(ERG1Manager);


// Get device id method
RCT_EXPORT_METHOD(getDeviceID: (RCTResponseSenderBlock)successCallback errorCallback: (RCTResponseSenderBlock)errorCallback)
{
  @try{
    // Implement get device id logic
    NSString *deviceID = @ "testdeviceId-456";
    successCallback(@[deviceID]);
  }
  @catch(NSException *exception){
    errorCallback(@[exception]);
  }
}

@end
