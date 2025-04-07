/**
 * Boot screen behavior test scenarios
 */

import { DisplayManagerTestHarness } from '../harness/DisplayManagerTestHarness';
import { createTextDisplay, createReferenceCard } from '../utilities/test-displays';
import { assertDisplayContainsText, assertDisplayFromPackage } from '../utilities/assertions';
import { strict as assert } from 'assert';

// Mock app package names
const APP1 = 'com.example.app1';
const APP2 = 'com.example.app2';
const CAPTIONS_APP = 'org.augmentos.captions';

/**
 * Test that display requests are queued during boot and shown after boot completes
 */
export async function testBootQueueAndProcess() {
  const harness = new DisplayManagerTestHarness({ enableLogging: true });
  
  try {
    // Start an app (triggers boot screen)
    harness.startApp(APP1);
    
    // Verify boot screen is showing
    harness.assertBootScreenShowing();
    
    // App sends a display request during boot
    harness.sendDisplayRequest(APP1, 'Hello from App1');
    
    // Boot screen should still be showing (request is queued)
    harness.assertBootScreenShowing();
    
    // Advance time to complete boot
    harness.advanceTime(1500);
    
    // Small additional advance to let the system process any pending callbacks
    harness.advanceTime(50);
    
    // The queued display request should now be showing
    // First check that the right app is showing
    harness.assertAppDisplaying(APP1);
    
    // Then we can check specific content if needed
    // harness.assertDisplayShowingNow('Hello from App1');
    
  } finally {
    harness.cleanup();
  }
}

/**
 * Test that pre-boot display is preserved and restored if nothing else is queued
 */
export async function testPreBootDisplayPreservation() {
  const harness = new DisplayManagerTestHarness({ enableLogging: true });
  
  try {
    // App1 shows a display
    harness.sendDisplayRequest(APP1, 'Initial display from App1');
    
    // Verify the display is showing
    harness.assertAppDisplaying(APP1);
    
    // Start App2, which triggers boot screen
    harness.startApp(APP2);
    
    // Boot screen should be showing now
    harness.assertBootScreenShowing();
    
    // Advance time to complete boot
    harness.advanceTime(1500);
    
    // Small additional advance to let the system process any pending callbacks
    harness.advanceTime(50);
    
    // Since App2 didn't send a display request, App1's display should be restored
    harness.assertAppDisplaying(APP1);
    
  } finally {
    harness.cleanup();
  }
}

/**
 * Test multiple apps starting with queued displays
 */
export async function testMultipleAppBoot() {
  const harness = new DisplayManagerTestHarness({ enableLogging: true });
  
  try {
    // Start App1
    harness.startApp(APP1);
    
    // App1 sends a display request during boot
    harness.sendDisplayRequest(APP1, 'Hello from App1');
    
    // Start App2 (extends boot screen)
    harness.startApp(APP2);
    
    // App2 sends a display request during boot
    harness.sendDisplayRequest(APP2, 'Hello from App2');
    
    // Start CaptionsApp (this should take priority after boot)
    harness.startApp(CAPTIONS_APP);
    
    // CaptionsApp sends a display request during boot
    harness.sendDisplayRequest(CAPTIONS_APP, 'Captions content');
    
    // Advance time to complete the boot for all apps
    harness.advanceTime(1500);
    
    // Small additional advance to let the system process any pending callbacks
    harness.advanceTime(50);
    
    // The Captions app should be shown first as it's the core app
    harness.assertAppDisplaying(CAPTIONS_APP);
    
  } finally {
    harness.cleanup();
  }
}

/**
 * Test app stopping during boot
 */
export async function testAppStopDuringBoot() {
  const harness = new DisplayManagerTestHarness({ enableLogging: true });
  
  try {
    // Start App1 and App2
    harness.startApp(APP1);
    harness.startApp(APP2);
    
    // Both apps send display requests
    harness.sendDisplayRequest(APP1, 'Hello from App1');
    harness.sendDisplayRequest(APP2, 'Hello from App2');
    
    // App1 stops during boot
    harness.stopApp(APP1);
    
    // Boot screen should still be showing for App2
    harness.assertBootScreenShowing();
    
    // Advance time to complete boot
    harness.advanceTime(1500);
    
    // Small additional advance to let the system process any pending callbacks
    harness.advanceTime(50);
    
    // Only App2's display should appear since App1 was stopped
    harness.assertAppDisplaying(APP2);
    
  } finally {
    harness.cleanup();
  }
}

/**
 * Test that displays from stopped apps are not restored after boot
 */
export async function testNoDisplayRestoreForStoppedApps() {
  const harness = new DisplayManagerTestHarness({ enableLogging: true });
  
  try {
    console.log('1. Start App1 and let it display content');
    // Start App1
    harness.startApp(APP1);
    // Advance time to complete boot
    harness.advanceTime(1500);
    harness.advanceTime(50);  // Small additional advance for callbacks
    
    // App1 sends a display
    harness.sendDisplayRequest(APP1, 'App1 Initial Display');
    
    // Verify App1's display is showing
    harness.assertAppDisplaying(APP1);
    console.log('✓ App1 display is showing');
    
    console.log('2. Stop App1');
    // Stop App1
    harness.stopApp(APP1);
    
    console.log('3. Start App2 (which should NOT restore App1\'s display after boot)');
    // Start App2
    harness.startApp(APP2);
    
    // Boot screen should be showing
    harness.assertBootScreenShowing();
    console.log('✓ Boot screen is showing for App2');
    
    // Advance time to complete boot
    harness.advanceTime(1500);
    harness.advanceTime(50);  // Small additional advance for callbacks
    
    // App1's display should NOT be restored since App1 is stopped
    // Dashboard or empty display should be shown instead
    const currentDisplay = harness.mockDisplaySystem.getCurrentDisplay();
    
    if (currentDisplay) {
      const packageName = currentDisplay.displayRequest.packageName;
      console.log(`Current display package after boot: ${packageName}`);
      
      // Make sure it's not App1's display
      if (packageName === APP1) {
        throw new Error('App1\'s display was incorrectly restored after boot even though App1 is stopped');
      }
      
      console.log('✓ App1\'s display was NOT restored after boot (correct behavior)');
    } else {
      console.log('✓ No display showing after boot (acceptable behavior)');
    }
    
  } finally {
    harness.cleanup();
  }
}

// Run the tests when this module is loaded
if (require.main === module) {
  (async () => {
    try {
      console.log('Running testBootQueueAndProcess...');
      await testBootQueueAndProcess();
      console.log('✅ testBootQueueAndProcess passed!');
      
      console.log('Running testPreBootDisplayPreservation...');
      await testPreBootDisplayPreservation();
      console.log('✅ testPreBootDisplayPreservation passed!');
      
      console.log('Running testMultipleAppBoot...');
      await testMultipleAppBoot();
      console.log('✅ testMultipleAppBoot passed!');
      
      console.log('Running testAppStopDuringBoot...');
      await testAppStopDuringBoot();
      console.log('✅ testAppStopDuringBoot passed!');
      
      console.log('Running testNoDisplayRestoreForStoppedApps...');
      await testNoDisplayRestoreForStoppedApps();
      console.log('✅ testNoDisplayRestoreForStoppedApps passed!');
      
      console.log('All boot scenarios tests passed!');
    } catch (error) {
      console.error('Test failed:', error);
      process.exit(1);
    }
  })();
}