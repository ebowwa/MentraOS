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
        // Call the Swift stopScan method - check which manager is active
        if (self.aosManager.g1Manager) {
            [self.aosManager.g1Manager RN_stopScan];
        } else if (self.aosManager.frameManager) {
            [self.aosManager.frameManager RN_stopScan];
        }
        
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
  BOOL connected = NO;
  
  if (self.aosManager.g1Manager) {
    connected = [self.aosManager.g1Manager RN_connectGlasses];
  } else if (self.aosManager.frameManager) {
    connected = [self.aosManager.frameManager RN_connect];
  }
  
  if (connected) {
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
    if (self.aosManager.g1Manager) {
      [self.aosManager.g1Manager RN_sendText:text];
    } else if (self.aosManager.frameManager) {
      [self.aosManager.frameManager RN_sendText:text];
    }
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
    
    NSFileManager *fileManager = [NSFileManager defaultManager];
    
    // Check for tokens.txt (required for all models)
    NSString *tokensPath = [modelPath stringByAppendingPathComponent:@"tokens.txt"];
    if (![fileManager fileExistsAtPath:tokensPath]) {
      resolve(@(NO));
      return;
    }
    
    // Check for CTC model
    NSString *ctcModelPath = [modelPath stringByAppendingPathComponent:@"model.int8.onnx"];
    if ([fileManager fileExistsAtPath:ctcModelPath]) {
      resolve(@(YES));
      return;
    }
    
    // Check for transducer model
    NSArray *transducerFiles = @[@"encoder.onnx", @"decoder.onnx", @"joiner.onnx"];
    for (NSString *file in transducerFiles) {
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
    NSFileManager *fileManager = [NSFileManager defaultManager];
    
    // Check for tokens.txt (required for all models)
    NSString *tokensPath = [path stringByAppendingPathComponent:@"tokens.txt"];
    if (![fileManager fileExistsAtPath:tokensPath]) {
      resolve(@(NO));
      return;
    }
    
    // Check for CTC model
    NSString *ctcModelPath = [path stringByAppendingPathComponent:@"model.int8.onnx"];
    if ([fileManager fileExistsAtPath:ctcModelPath]) {
      resolve(@(YES));
      return;
    }
    
    // Check for transducer model
    NSArray *transducerFiles = @[@"encoder.onnx", @"decoder.onnx", @"joiner.onnx"];
    BOOL allTransducerFilesPresent = YES;
    
    for (NSString *file in transducerFiles) {
      NSString *filePath = [path stringByAppendingPathComponent:file];
      if (![fileManager fileExistsAtPath:filePath]) {
        allTransducerFilesPresent = NO;
        break;
      }
    }
    
    resolve(@(allTransducerFilesPresent));
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
    
    // For iOS, we need to use a different approach since NSTask is not available
    // and posix_spawn may not have access to system binaries
    // We'll use NSFileManager with NSData and compression libraries
    
    // Try to decompress using NSData (this is a simplified approach)
    // For production, you might want to use a library like libarchive
    NSData *compressedData = [NSData dataWithContentsOfFile:sourcePath];
    if (!compressedData) {
      reject(@"EXTRACTION_ERROR", @"Failed to read compressed file", nil);
      return;
    }
    
    // Create a temporary directory for extraction
    NSString *tempExtractPath = [NSTemporaryDirectory() stringByAppendingPathComponent:[[NSUUID UUID] UUIDString]];
    [fileManager createDirectoryAtPath:tempExtractPath
           withIntermediateDirectories:YES
                            attributes:nil
                                 error:&error];
    
    // Use NSTask alternative for iOS - NSProcess doesn't exist, so we'll use a workaround
    // Extract using gunzip and tar programmatically
    // First, decompress bz2 to tar
    NSString *tarPath = [tempExtractPath stringByAppendingPathComponent:@"temp.tar"];
    
    // Use the Swift TarBz2Extractor with SWCompression
    NSError *extractionError = nil;
    BOOL success = [TarBz2Extractor extractTarBz2From:sourcePath to:destinationPath error:&extractionError];
    
    if (!success || extractionError) {
      reject(@"EXTRACTION_ERROR", extractionError.localizedDescription ?: @"Failed to extract tar.bz2", extractionError);
      return;
    }
    
    // Files should now be extracted, but we might still need to rename some
    // (The Swift extractor already handles the common renames, but let's check)
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
