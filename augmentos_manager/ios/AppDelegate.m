// Add this import at the top of the file
#import "ManagerCoreCommsService.h"

// Inside the AppDelegate implementation, add this method or update existing didFinishLaunchingWithOptions
- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  // Existing initialization code...
  
  // Initialize the ManagerCoreCommsService
  [[ManagerCoreCommsService allocWithZone:nil] init];
  
  // Rest of the initialization code...
  
  return YES;
}