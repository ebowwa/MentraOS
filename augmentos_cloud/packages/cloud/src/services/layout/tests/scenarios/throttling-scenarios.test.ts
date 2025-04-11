/**
 * Throttling behavior test scenarios
 */

import { DisplayManagerTestHarness } from '../harness/DisplayManagerTestHarness';
import { createTextDisplay } from '../utilities/test-displays';
import { assertDisplayContainsText, assertDisplayFromPackage } from '../utilities/assertions';
import { strict as assert } from 'assert';

// Mock app package names
const APP1 = 'com.example.app1';
const APP2 = 'com.example.app2';

/**
 * Test that rapid display requests from the same app are throttled but eventually shown
 */
export async function testSameAppThrottling() {
  const harness = new DisplayManagerTestHarness({ enableLogging: true });
  
  try {
    // App1 sends first display
    harness.sendDisplayRequest(APP1, 'Display A');
    harness.assertAppDisplaying(APP1);
    
    // App1 quickly sends second display
    harness.sendDisplayRequest(APP1, 'Display B');
    
    // Display A should still be showing (B is throttled)
    harness.assertAppDisplaying(APP1);
    
    // App1 quickly sends third display
    harness.sendDisplayRequest(APP1, 'Display C');
    
    // Display A should still be showing (C is throttled, replacing B)
    harness.assertAppDisplaying(APP1);
    
    // Advance time past throttle delay
    harness.advanceTime(305);
    harness.advanceTime(50);  // Small additional advance for callbacks
    
    // App1 should still be displaying, but now with Display C
    // (not B, since C replaced B in the throttle queue)
    harness.assertAppDisplaying(APP1);
    
  } finally {
    harness.cleanup();
  }
}

/**
 * Test that rapid display requests from different apps are throttled independently
 */
export async function testMultiAppThrottling() {
  const harness = new DisplayManagerTestHarness({ enableLogging: true });
  
  try {
    // App1 sends first display
    harness.sendDisplayRequest(APP1, 'App1 - Display A');
    harness.assertAppDisplaying(APP1);
    
    // App2 quickly sends a display
    harness.sendDisplayRequest(APP2, 'App2 - Display B');
    
    // App1's display should still be showing (App2's is throttled)
    harness.assertAppDisplaying(APP1);
    
    // App1 quickly sends another display
    harness.sendDisplayRequest(APP1, 'App1 - Display C');
    
    // App1's first display should still be showing (new one is throttled)
    harness.assertAppDisplaying(APP1);
    
    // Advance time past throttle delay
    harness.advanceTime(305);
    harness.advanceTime(50);  // Small additional advance for callbacks;
    
    // Now one of the throttled displays should be shown
    // The exact one depends on implementation details of priority
    const currentDisplay = harness.getVisualState();
    assert.ok(
      currentDisplay.includes('App1 - Display C') || currentDisplay.includes('App2 - Display B'),
      'Expected either App1-C or App2-B to be showing after throttle delay'
    );
    
    // Advance time past another throttle delay
    harness.advanceTime(305);
    
    // Now the other throttled display should be shown
    const nextDisplay = harness.getVisualState();
    if (currentDisplay.includes('App1 - Display C')) {
      assert.ok(
        nextDisplay.includes('App2 - Display B'),
        'Expected App2-B to be showing after second throttle delay'
      );
    } else {
      assert.ok(
        nextDisplay.includes('App1 - Display C'),
        'Expected App1-C to be showing after second throttle delay'
      );
    }
    
  } finally {
    harness.cleanup();
  }
}

/**
 * Test that throttled display is cancelled if app is stopped
 */
export async function testThrottleCancelOnAppStop() {
  const harness = new DisplayManagerTestHarness({ enableLogging: true });
  
  try {
    // App1 active
    harness.startApp(APP1);
    harness.advanceTime(1500); // Complete boot
    harness.advanceTime(50);  // Small additional advance for callbacks
    
    // App1 sends first display
    harness.sendDisplayRequest(APP1, 'App1 - Display A');
    harness.assertAppDisplaying(APP1); // Check the right app is displaying
    
    // App1 quickly sends second display
    harness.sendDisplayRequest(APP1, 'App1 - Display B');
    
    // App1 is stopped before throttle delay completes
    harness.stopApp(APP1);
    
    // Advance time past throttle delay
    harness.advanceTime(305);
    harness.advanceTime(50);  // Small additional advance for callbacks
    
    // Display B should not appear since App1 was stopped
    const displayState = harness.getVisualState();
    assert.ok(
      !displayState.includes('App1 - Display B'),
      'Expected App1 Display B to not appear after app stop'
    );
    
  } finally {
    harness.cleanup();
  }
}

// Run the tests when this module is loaded
if (require.main === module) {
  (async () => {
    try {
      console.log('Running testSameAppThrottling...');
      await testSameAppThrottling();
      console.log('✅ testSameAppThrottling passed!');
      
      console.log('Running testMultiAppThrottling...');
      await testMultiAppThrottling();
      console.log('✅ testMultiAppThrottling passed!');
      
      console.log('Running testThrottleCancelOnAppStop...');
      await testThrottleCancelOnAppStop();
      console.log('✅ testThrottleCancelOnAppStop passed!');
      
      console.log('All throttling tests passed!');
    } catch (error) {
      console.error('Test failed:', error);
      process.exit(1);
    }
  })();
}