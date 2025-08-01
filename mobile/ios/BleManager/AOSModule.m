//
//  AOSModule.m
//  MentraOS_Manager
//
//  Created by Matthew Fosse on 3/5/25.
//

#import <Foundation/Foundation.h>
#import <React/RCTEventEmitter.h>
#import "./AOSModule.h"
#import "MentraOS-Swift.h"

@interface AOSModule ()
@property (nonatomic, strong) AOSManager *aosManager;
@end

@implementation AOSModule

// Static reference for event emission
static AOSModule *sharedEmitter = nil;

// Export the module for React Native
RCT_EXPORT_MODULE(AOSModule);

- (instancetype)init {
    self = [super init];
    if (self) {
        _aosManager = [[AOSManager alloc] init];
        // Set the shared emitter reference
        sharedEmitter = self;
    }
    return self;
}

// Class method to get the shared emitter instance
+ (AOSModule *)sharedEmitter {
    return sharedEmitter;
}

// Supported events - combined list from both classes
- (NSArray<NSString *> *)supportedEvents {
  return @[@"onReady", @"onPending", @"onFailure", @"onConnectionStateChanged", @"CoreMessageIntentEvent", @"CoreMessageEvent", @"WIFI_SCAN_RESULTS"];
}

// Method to emit events from other parts of the code
+ (void)emitEventWithName:(NSString *)eventName body:(id)body {
    if (sharedEmitter && sharedEmitter.bridge) {
        [sharedEmitter sendEventWithName:eventName body:body];
    }
}

// Stop scanning for devices
RCT_EXPORT_METHOD(stopScan:(RCTResponseSenderBlock)successCallback errorCallback:(RCTResponseSenderBlock)errorCallback) {
    @try {
        // Call the Swift stopScan method
        [self.aosManager.g1Manager RN_stopScan];
        
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
  (RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
) {
  if ([self.aosManager.g1Manager RN_connectGlasses]) {
    resolve(@"connected");
  } else {
    reject(@"0", @"glasses_not_paired", nil);
  }
}

// Disconnect from the connected device
RCT_EXPORT_METHOD(disconnect:(RCTResponseSenderBlock)successCallback errorCallback:(RCTResponseSenderBlock)errorCallback) {
    @try {
        successCallback(@[@"Disconnecting not implemented in Swift class"]);
    }
    @catch(NSException *exception) {
        errorCallback(@[exception.description]);
    }
}

// send text to the glasses
RCT_EXPORT_METHOD(
  sendText:
  (NSString *)text
  resolver:(RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
)
{
  @try {
    [self.aosManager.g1Manager RN_sendText:text];
    resolve(@[@"Sent text"]);
  }
  @catch(NSException *exception) {
    reject(@"0", exception.description, nil);
  }
}


RCT_EXPORT_METHOD(
  setBrightness:
  (NSInteger)brightnessValue// first param is special and doesn't get a name
  autoBrightness:(BOOL)autoBrightness
  resolver:(RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
)
{
  @try {
    [self.aosManager.g1Manager RN_setBrightness:brightnessValue autoMode:autoBrightness];
    resolve(@[@"Set brightness"]);
  }
  @catch(NSException *exception) {
    reject(@"0", exception.description, nil);
  }
}


RCT_EXPORT_METHOD(
  setMicEnabled:
  (BOOL)enabled
  resolver:(RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
)
{
  @try {
    [self.aosManager.g1Manager RN_setMicEnabled:enabled];
    resolve(@[@"Set mic enabled"]);
  }
  @catch(NSException *exception) {
    reject(@"0", exception.description, nil);
  }
}

RCT_EXPORT_METHOD(
  getBatteryStatus:
  (RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
)
{
  @try {
    [self.aosManager.g1Manager RN_getBatteryStatus];
    resolve(@[@"Got battery status!"]);
  }
  @catch(NSException *exception) {
    reject(@"0", exception.description, nil);
  }
}

RCT_EXPORT_METHOD(
  setCoreToken:
  (NSString *)token
  resolver:(RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
)
{
  @try {
    [self.aosManager setCoreToken:token];
    resolve(@[@"Set core token!"]);
  }
  @catch(NSException *exception) {
    reject(@"0", exception.description, nil);
  }
}


RCT_EXPORT_METHOD(
  sendWhitelist:
  (NSString *)command
  resolver:(RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
)
{
  @try {
    [self.aosManager.g1Manager RN_sendWhitelist];
    resolve(@[@"Whitelist sent!"]);
  }
  @catch(NSException *exception) {
    reject(@"0", exception.description, nil);
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
    [self.aosManager handleCommand:command];
    resolve(@[@"Command sent!"]);
  }
  @catch(NSException *exception) {
    reject(@"0", exception.description, nil);
  }
}

// STT Model Management Methods
RCT_EXPORT_METHOD(
  setSTTModelPath:
  (NSString *)path
  resolver:(RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
)
{
  @try {
    // Store the model path for SherpaOnnxTranscriber to use
    [[NSUserDefaults standardUserDefaults] setObject:path forKey:@"STTModelPath"];
    [[NSUserDefaults standardUserDefaults] synchronize];
    resolve(@(YES));
  }
  @catch(NSException *exception) {
    reject(@"STT_ERROR", exception.description, nil);
  }
}

RCT_EXPORT_METHOD(
  isSTTModelAvailable:
  (RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
)
{
  @try {
    NSString *modelPath = [[NSUserDefaults standardUserDefaults] stringForKey:@"STTModelPath"];
    if (!modelPath) {
      resolve(@(NO));
      return;
    }
    
    // Check if required files exist
    NSFileManager *fileManager = [NSFileManager defaultManager];
    NSArray *requiredFiles = @[@"encoder.onnx", @"decoder.onnx", @"joiner.onnx", @"tokens.txt"];
    
    for (NSString *file in requiredFiles) {
      NSString *filePath = [modelPath stringByAppendingPathComponent:file];
      if (![fileManager fileExistsAtPath:filePath]) {
        resolve(@(NO));
        return;
      }
    }
    
    resolve(@(YES));
  }
  @catch(NSException *exception) {
    reject(@"STT_ERROR", exception.description, nil);
  }
}

RCT_EXPORT_METHOD(
  validateSTTModel:
  (NSString *)path
  resolver:(RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
)
{
  @try {
    // TODO: Implement actual validation by trying to initialize SherpaOnnxTranscriber
    // For now, just check if files exist
    NSFileManager *fileManager = [NSFileManager defaultManager];
    NSArray *requiredFiles = @[@"encoder.onnx", @"decoder.onnx", @"joiner.onnx", @"tokens.txt"];
    
    for (NSString *file in requiredFiles) {
      NSString *filePath = [path stringByAppendingPathComponent:file];
      if (![fileManager fileExistsAtPath:filePath]) {
        resolve(@(NO));
        return;
      }
    }
    
    resolve(@(YES));
  }
  @catch(NSException *exception) {
    reject(@"STT_ERROR", exception.description, nil);
  }
}

RCT_EXPORT_METHOD(
  extractTarBz2:
  (NSString *)sourcePath
  destination:(NSString *)destinationPath
  resolver:(RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
)
{
  @try {
    NSFileManager *fileManager = [NSFileManager defaultManager];
    
    // Create destination directory if it doesn't exist
    NSError *error = nil;
    [fileManager createDirectoryAtPath:destinationPath
           withIntermediateDirectories:YES
                            attributes:nil
                                 error:&error];
    
    if (error) {
      reject(@"EXTRACTION_ERROR", error.localizedDescription, error);
      return;
    }
    
    // Use system tar command to extract with strip components to remove root directory
    NSTask *task = [[NSTask alloc] init];
    task.launchPath = @"/usr/bin/tar";
    task.arguments = @[@"-xjf", sourcePath, @"-C", destinationPath, @"--strip-components=1"];
    
    [task launch];
    [task waitUntilExit];
    
    if (task.terminationStatus == 0) {
      // Rename the model files to expected names
      NSFileManager *fileManager = [NSFileManager defaultManager];
      NSError *renameError = nil;
      
      // Rename encoder
      NSString *oldEncoderPath = [destinationPath stringByAppendingPathComponent:@"encoder-epoch-99-avg-1.onnx"];
      NSString *newEncoderPath = [destinationPath stringByAppendingPathComponent:@"encoder.onnx"];
      if ([fileManager fileExistsAtPath:oldEncoderPath]) {
        [fileManager moveItemAtPath:oldEncoderPath toPath:newEncoderPath error:&renameError];
      }
      
      // Rename decoder
      NSString *oldDecoderPath = [destinationPath stringByAppendingPathComponent:@"decoder-epoch-99-avg-1.onnx"];
      NSString *newDecoderPath = [destinationPath stringByAppendingPathComponent:@"decoder.onnx"];
      if ([fileManager fileExistsAtPath:oldDecoderPath]) {
        [fileManager moveItemAtPath:oldDecoderPath toPath:newDecoderPath error:&renameError];
      }
      
      // Rename joiner
      NSString *oldJoinerPath = [destinationPath stringByAppendingPathComponent:@"joiner-epoch-99-avg-1.int8.onnx"];
      NSString *newJoinerPath = [destinationPath stringByAppendingPathComponent:@"joiner.onnx"];
      if ([fileManager fileExistsAtPath:oldJoinerPath]) {
        [fileManager moveItemAtPath:oldJoinerPath toPath:newJoinerPath error:&renameError];
      }
      
      resolve(@(YES));
    } else {
      reject(@"EXTRACTION_ERROR", @"Failed to extract tar.bz2 file", nil);
    }
  }
  @catch(NSException *exception) {
    reject(@"EXTRACTION_ERROR", exception.description, nil);
  }
}

// Required for Swift interop
+ (BOOL)requiresMainQueueSetup {
    return YES;
}

@end
