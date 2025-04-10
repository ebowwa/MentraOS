/**
 * Real-world scenarios for DisplayManager throttling behavior
 * 
 * This tests more complex, realistic scenarios for the DisplayManager,
 * focusing on the throttling behavior and app stopping behavior.
 */

import { DisplayManagerTestHarness } from '../harness/DisplayManagerTestHarness';
import { strict as assert } from 'assert';

// App package names for testing
const APP1 = 'com.example.app1';
const APP2 = 'com.example.app2';
const APP3 = 'com.example.app3';

/**
 * Test that when multiple apps send throttled requests and one app stops,
 * the other app's throttled content shows immediately
 */
export async function testThrottledShowAfterAppStop() {
  console.log('Test: When an app is stopped, another app\'s throttled request is immediately shown');
  
  const harness = new DisplayManagerTestHarness({ enableLogging: true });
  
  try {
    console.log('1. App1 starts and shows content');
    // Start App1
    harness.startApp(APP1);
    // Advance time to complete boot
    harness.advanceTime(1500); 
    harness.advanceTime(50);
    
    // Show App1 content (with force to bypass throttling)
    harness.sendDisplayRequest(APP1, 'App1 Content', { forceDisplay: true });
    harness.assertAppDisplaying(APP1);
    
    console.log('2. App2 starts and shows content that gets throttled');
    // Start App2
    harness.startApp(APP2);
    // Advance time to complete boot
    harness.advanceTime(1500);
    harness.advanceTime(50);
    
    // App2 attempts to show content (without force)
    harness.sendDisplayRequest(APP2, 'App2 Content');
    
    // App1 should still be showing as App2's request is throttled
    harness.assertAppDisplaying(APP1);
    
    console.log('3. App1 is stopped - App2\'s content should immediately show');
    // Stop App1
    harness.stopApp(APP1);
    
    // Small delay to let the display manager process the request
    harness.advanceTime(50);
    
    // App2 should now be showing its content automatically
    harness.assertAppDisplaying(APP2);
    
    console.log('✅ Successfully showed App2\'s throttled content when App1 stopped');
  } finally {
    harness.cleanup();
  }
}

/**
 * Test that when multiple apps have throttled requests and one app stops,
 * the oldest throttled request from another app shows
 */
export async function testMultipleThrottledRequests() {
  console.log('Test: When multiple apps have throttled requests and one stops, the oldest one shows');
  
  const harness = new DisplayManagerTestHarness({ enableLogging: true });
  
  try {
    console.log('1. App1 starts and shows content');
    // Start all apps
    harness.startApp(APP1);
    harness.startApp(APP2);
    harness.startApp(APP3);
    
    // Complete boot for all apps
    harness.advanceTime(1500);
    harness.advanceTime(50);
    
    // Show App1 content with force
    harness.sendDisplayRequest(APP1, 'App1 Content', { forceDisplay: true });
    harness.assertAppDisplaying(APP1);
    
    console.log('2. App2 and App3 send throttled requests');
    // App2 tries to show content (gets throttled)
    harness.sendDisplayRequest(APP2, 'App2 Content');
    
    // Small delay between requests
    harness.advanceTime(100);
    
    // App3 tries to show content (also gets throttled)
    harness.sendDisplayRequest(APP3, 'App3 Content');
    
    // App1 should still be displaying
    harness.assertAppDisplaying(APP1);
    
    console.log('3. Stop App1 - App2\'s content should show (oldest throttled request)');
    // Stop App1
    harness.stopApp(APP1);
    
    // Small delay to process the request
    harness.advanceTime(50);
    
    // App2 should be showing (oldest throttled request)
    harness.assertAppDisplaying(APP2);
    
    console.log('4. App2\'s normal throttle timer should not fire since content is already showing');
    // Advance time to when App2's normal throttle timer would fire
    harness.advanceTime(1000);
    
    // App2 should still be showing
    harness.assertAppDisplaying(APP2);
    
    console.log('✅ Successfully showed oldest throttled request when active app stopped');
  } finally {
    harness.cleanup();
  }
}

// Run the tests when this module is loaded directly
if (require.main === module) {
  (async () => {
    try {
      console.log('Running testThrottledShowAfterAppStop...');
      await testThrottledShowAfterAppStop();
      console.log('✅ testThrottledShowAfterAppStop passed!');
      
      console.log('Running testMultipleThrottledRequests...');
      await testMultipleThrottledRequests();
      console.log('✅ testMultipleThrottledRequests passed!');
      
      console.log('All throttling scenarios tests passed!');
    } catch (error) {
      console.error('Test failed:', error);
      process.exit(1);
    }
  })();
}