/**
 * DisplayManager Integration Tests
 * 
 * Tests the functionality of the DisplayManager implementation.
 */
import { WebSocket } from 'ws';
import { DisplayManager } from '../services/layout';
import { LayoutType, TpaToCloudMessageType, ViewType, UserSession } from '@augmentos/sdk';
import { systemApps } from '../services/core/system-apps';
import { logger } from '@augmentos/utils';

// Mock WebSocket
class MockWebSocket {
  private messages: any[] = [];
  readyState = 1; // WebSocket.OPEN

  send(data: string) {
    this.messages.push(JSON.parse(data));
    return true;
  }

  getMessages() {
    return [...this.messages];
  }

  clearMessages() {
    this.messages = [];
  }
}

// Create mock UserSession
const createMockUserSession = (userId: string, websocket: any): UserSession => {
  return {
    sessionId: `session-${userId}`,
    userId,
    startTime: new Date(),
    websocket,
    activeAppSessions: [],
    loadingApps: new Set(),
    appConnections: new Map(),
    displayManager: {} as any, // Will be set later
    isTranscribing: false,
    logger: {
      info: (infoObject: object | string, ...args: any[]) => logger.info(`[TEST:${userId}] ${String(infoObject)}`, ...args),
      warn: (infoObject: object | string, ...args: any[]) => logger.warn(`[TEST:${userId}] ${String(infoObject)}`, ...args),
      error: (infoObject: object | string, ...args: any[]) => logger.error(`[TEST:${userId}] ${String(infoObject)}`, ...args),
      debug: (infoObject: object | string, ...args: any[]) => logger.debug(`[TEST:${userId}] ${String(infoObject)}`, ...args),
    },
  };
};

/**
 * Test the DisplayManager in various scenarios
 */
async function runDisplayManagerTests() {
  console.log('Running DisplayManager tests...');
  
  // Create DisplayManager with debug mode enabled
  const displayManager = new DisplayManager({
    debugMode: true,
    throttleDelayMs: 100, // Use shorter delay for testing
    bootDurationMs: 300,  // Use shorter boot for testing
  });

  // Create a mock WebSocket and UserSession
  const mockSocket = new MockWebSocket();
  const userSession = createMockUserSession('test-user', mockSocket);
  
  // Set the displayManager on the userSession
  userSession.displayManager = displayManager;

  // Test 1: Basic Display Request
  console.log('\nTest 1: Basic Display Request');
  const displayRequest1 = {
    type: TpaToCloudMessageType.DISPLAY_REQUEST,
    view: ViewType.MAIN,
    packageName: 'test.app',
    layout: {
      layoutType: LayoutType.TEXT_WALL,
      text: 'Hello, world!'
    },
    timestamp: new Date()
  } as any;
  
  // Attempting display should fail since app isn't registered
  const result1 = displayManager.handleDisplayEvent(displayRequest1, userSession);
  console.log(`Display result: ${result1}`);
  console.log(`Messages sent: ${mockSocket.getMessages().length}`);
  
  // Test 2: App Startup and Display
  console.log('\nTest 2: App Startup and Display');
  // Add the app to active sessions
  userSession.activeAppSessions.push('test.app');
  
  // Start the app
  displayManager.handleAppStart('test.app', userSession);
  
  // Should see boot screen
  console.log(`Boot screen messages: ${mockSocket.getMessages().length}`);
  mockSocket.clearMessages();
  
  // Wait for boot to complete
  await new Promise(resolve => setTimeout(resolve, 400));
  
  // Try display again
  const result2 = displayManager.handleDisplayEvent(displayRequest1, userSession);
  console.log(`Display result after boot: ${result2}`);
  console.log(`Messages sent: ${mockSocket.getMessages().length}`);
  mockSocket.clearMessages();
  
  // Test 3: Throttling
  console.log('\nTest 3: Throttling');
  
  // Send multiple requests rapidly
  const displayRequest2 = {
    ...displayRequest1,
    layout: {
      layoutType: LayoutType.TEXT_WALL,
      text: 'Request 1'
    }
  } as any;
  
  const displayRequest3 = {
    ...displayRequest1,
    layout: {
      layoutType: LayoutType.TEXT_WALL,
      text: 'Request 2'
    }
  } as any;
  
  const displayRequest4 = {
    ...displayRequest1,
    layout: {
      layoutType: LayoutType.TEXT_WALL,
      text: 'Request 3'
    }
  } as any;
  
  // Send first request - should succeed
  const throttleResult1 = displayManager.handleDisplayEvent(displayRequest2, userSession);
  console.log(`First throttle result: ${throttleResult1}`);
  
  // Send second request immediately - should be throttled
  const throttleResult2 = displayManager.handleDisplayEvent(displayRequest3, userSession);
  console.log(`Second throttle result: ${throttleResult2}`);
  
  // Send third request immediately - should replace second in queue
  const throttleResult3 = displayManager.handleDisplayEvent(displayRequest4, userSession);
  console.log(`Third throttle result: ${throttleResult3}`);
  
  // Wait for throttle to clear and process queue
  console.log('Waiting for throttle queue to process...');
  await new Promise(resolve => setTimeout(resolve, 200));
  
  // Check what was sent
  const throttleMessages = mockSocket.getMessages();
  console.log(`Messages sent after throttling: ${throttleMessages.length}`);
  throttleMessages.forEach((msg, i) => {
    console.log(`Message ${i+1} text: ${(msg.layout as any).text}`);
  });
  mockSocket.clearMessages();
  
  // Test 4: Background Lock System
  console.log('\nTest 4: Background Lock System');
  
  // Set up two background apps
  userSession.activeAppSessions.push('background.app1');
  userSession.activeAppSessions.push('background.app2');
  
  // Create requests from both
  const backgroundRequest1 = {
    type: TpaToCloudMessageType.DISPLAY_REQUEST,
    view: ViewType.MAIN,
    packageName: 'background.app1',
    layout: {
      layoutType: LayoutType.TEXT_WALL,
      text: 'Background App 1'
    },
    timestamp: new Date()
  } as any;
  
  const backgroundRequest2 = {
    type: TpaToCloudMessageType.DISPLAY_REQUEST,
    view: ViewType.MAIN,
    packageName: 'background.app2',
    layout: {
      layoutType: LayoutType.TEXT_WALL,
      text: 'Background App 2'
    },
    timestamp: new Date()
  } as any;
  
  // First app should get the lock
  const bgResult1 = displayManager.handleDisplayEvent(backgroundRequest1, userSession);
  console.log(`Background app 1 display result: ${bgResult1}`);
  
  // Second app should be blocked
  const bgResult2 = displayManager.handleDisplayEvent(backgroundRequest2, userSession);
  console.log(`Background app 2 display result: ${bgResult2}`);
  
  // Messages sent
  const bgMessages = mockSocket.getMessages();
  console.log(`Background lock messages: ${bgMessages.length}`);
  console.log(`Current display: ${(bgMessages[0].layout as any).text}`);
  mockSocket.clearMessages();
  
  // Test 5: Core App Override
  console.log('\nTest 5: Core App Override');
  
  // Mark mainApp as active
  userSession.activeAppSessions.push(systemApps.captions.packageName);
  
  // Create core app request
  const coreRequest = {
    type: TpaToCloudMessageType.DISPLAY_REQUEST,
    view: ViewType.MAIN,
    packageName: systemApps.captions.packageName,
    layout: {
      layoutType: LayoutType.TEXT_WALL,
      text: 'Core App Display'
    },
    timestamp: new Date()
  } as any;
  
  // Core app should override background
  const coreResult = displayManager.handleDisplayEvent(coreRequest, userSession);
  console.log(`Core app display result: ${coreResult}`);
  
  // Messages sent
  const coreMessages = mockSocket.getMessages();
  console.log(`Core app messages: ${coreMessages.length}`);
  console.log(`Current display: ${(coreMessages[0].layout as any).text}`);
  mockSocket.clearMessages();
  
  // Test 6: App Stop
  console.log('\nTest 6: App Stop');
  
  // Stop the core app
  displayManager.handleAppStop(systemApps.captions.packageName, userSession);
  
  // Messages sent (should revert to background app)
  const stopMessages = mockSocket.getMessages();
  console.log(`Messages after stop: ${stopMessages.length}`);
  if (stopMessages.length > 0) {
    console.log(`Current display after stop: ${(stopMessages[0].layout as any).text}`);
  } else {
    console.log('No display after stop');
  }
  mockSocket.clearMessages();
  
  // Test 7: Metrics
  console.log('\nTest 7: Metrics');
  
  const metrics = displayManager.getMetrics();
  console.log('Display metrics:');
  console.log(`- Total requests: ${metrics.requestsTotal}`);
  console.log(`- Successful: ${metrics.requestsSucceeded}`);
  console.log(`- Failed: ${metrics.requestsFailed}`);
  console.log(`- Throttled: ${metrics.requestsThrottled}`);
  console.log(`- Average latency: ${metrics.averageLatencyMs.toFixed(2)}ms`);
  console.log(`- Requests by app:`, metrics.displaysByApp);
  
  // Test 8: Invalid Display Requests
  console.log('\nTest 8: Invalid Display Requests');
  
  // Missing required fields
  const invalidRequest1 = {
    type: TpaToCloudMessageType.DISPLAY_REQUEST,
    packageName: 'test.app',
    // Missing view and layout
    timestamp: new Date()
  };
  
  const invalidResult1 = displayManager.handleDisplayEvent(invalidRequest1 as any, userSession);
  console.log(`Invalid request result: ${invalidResult1}`);
  
  // Invalid layout type
  const invalidRequest2 = {
    type: TpaToCloudMessageType.DISPLAY_REQUEST,
    view: ViewType.MAIN,
    packageName: 'test.app',
    layout: {
      layoutType: 'invalid_type',
      text: 'Invalid layout type'
    },
    timestamp: new Date()
  };
  
  const invalidResult2 = displayManager.handleDisplayEvent(invalidRequest2 as any, userSession);
  console.log(`Invalid layout type result: ${invalidResult2}`);
  
  // Missing layout fields
  const invalidRequest3 = {
    type: TpaToCloudMessageType.DISPLAY_REQUEST,
    view: ViewType.MAIN,
    packageName: 'test.app',
    layout: {
      layoutType: LayoutType.TEXT_WALL,
      // Missing text field
    },
    timestamp: new Date()
  };
  
  const invalidResult3 = displayManager.handleDisplayEvent(invalidRequest3 as any, userSession);
  console.log(`Missing layout fields result: ${invalidResult3}`);
  
  // Test 9: State Reset
  console.log('\nTest 9: State Reset');
  
  // Reset the display manager state
  const resetResult = displayManager.resetState();
  console.log(`Reset result: ${resetResult}`);
  
  // Check if a new display goes through
  const afterResetResult = displayManager.handleDisplayEvent(displayRequest1, userSession);
  console.log(`Display after reset: ${afterResetResult}`);
  
  const resetMessages = mockSocket.getMessages();
  console.log(`Messages after reset: ${resetMessages.length}`);
  mockSocket.clearMessages();
  
  console.log('\nDisplayManager tests complete!');
  
  // Return a summary of the test results
  return {
    totalTests: 9,
    metrics
  };
}

// Run the tests when this file is executed directly
if (require.main === module) {
  runDisplayManagerTests()
    .then(results => {
      console.log(`\nCompleted ${results.totalTests} tests!`);
      process.exit(0);
    })
    .catch(error => {
      console.error('Test error:', error);
      process.exit(1);
    });
}

export { runDisplayManagerTests };