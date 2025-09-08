//
//  UIDevice+LiveKitPatch.m
//  MentraOS
//
//  This file patches a missing method that LiveKit's WebRTC library
//  tries to call on UIDevice, preventing a crash.
//

#import <UIKit/UIKit.h>
#import <objc/runtime.h>

@interface UIDevice (LiveKitPatch)
@end

@implementation UIDevice (LiveKitPatch)

// This method is called by LiveKit's WebRTC library but doesn't exist in iOS SDK
// We provide a stub implementation to prevent crashes
+ (void)load {
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        // Add the missing class method at runtime
        Class metaClass = object_getClass([UIDevice class]);
        
        SEL selector = @selector(maxSupportedH264Profile);
        
        // Check if method already exists (it shouldn't)
        if (!class_respondsToSelector([UIDevice class], selector)) {
            // Add the method
            IMP implementation = imp_implementationWithBlock(^NSInteger{
                // Return a reasonable default value
                // H264 profiles: Baseline = 66, Main = 77, High = 100
                // Returning High profile as most modern iOS devices support it
                return 100; // High Profile
            });
            
            // Method signature: returns NSInteger, takes no parameters
            const char *types = "q@:";
            class_addMethod(metaClass, selector, implementation, types);
            
            NSLog(@"[LiveKitPatch] Added missing UIDevice.maxSupportedH264Profile method");
        }
    });
}

// Alternative: You could also implement it as a regular class method
// But using +load with runtime injection is safer as it happens before any usage
/*
+ (NSInteger)maxSupportedH264Profile {
    // H264 profiles: Baseline = 66, Main = 77, High = 100
    return 100; // High Profile
}
*/

@end