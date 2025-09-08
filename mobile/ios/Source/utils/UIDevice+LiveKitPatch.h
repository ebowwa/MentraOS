//
//  UIDevice+LiveKitPatch.h
//  MentraOS
//
//  This file patches a missing method that LiveKit's WebRTC library
//  tries to call on UIDevice, preventing a crash.
//

#import <UIKit/UIKit.h>

@interface UIDevice (LiveKitPatch)

// This method is expected by LiveKit's WebRTC library but doesn't exist in iOS SDK
// We provide a stub implementation to prevent crashes
+ (NSInteger)maxSupportedH264Profile;

@end