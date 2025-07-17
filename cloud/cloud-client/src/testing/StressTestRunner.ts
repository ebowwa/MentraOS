/**
 * StressTestRunner - Multi-client load testing
 */

import { MentraClient } from '../MentraClient';
import type { 
  StressTestConfig, 
  StressTestResult, 
  ClientSpawnOptions,
  CoordinatedTestOptions,
  StressTestAction
} from './types';

export class StressTestRunner {
  /**
   * Spawn multiple clients for stress testing
   */
  static async spawnClients(
    count: number, 
    baseOptions: ClientSpawnOptions
  ): Promise<MentraClient[]> {
    const clients: MentraClient[] = [];
    const promises: Promise<void>[] = [];

    for (let i = 0; i < count; i++) {
      const email = baseOptions.email.replace('{id}', i.toString());
      
      const client = new MentraClient({
        email,
        serverUrl: baseOptions.serverUrl,
        coreToken: baseOptions.coreToken,
        debug: {
          logLevel: baseOptions.debug ? 'debug' : 'warn',
          saveMetrics: true,
          logWebSocketMessages: false
        }
      });

      clients.push(client);

      // Connect with staggered delay to avoid overwhelming the server
      const connectPromise = new Promise<void>((resolve, reject) => {
        setTimeout(async () => {
          try {
            await client.connect();
            console.log(`[StressTest] Client ${i + 1}/${count} connected`);
            resolve();
          } catch (error) {
            console.error(`[StressTest] Client ${i + 1} failed to connect:`, error);
            reject(error);
          }
        }, i * 100); // 100ms stagger
      });

      promises.push(connectPromise);
    }

    // Wait for all connections (with some tolerance for failures)
    const results = await Promise.allSettled(promises);
    const successful = results.filter(r => r.status === 'fulfilled').length;
    
    console.log(`[StressTest] ${successful}/${count} clients connected successfully`);
    
    return clients;
  }

  /**
   * Run coordinated test across multiple clients
   */
  static async coordinatedTest(
    clients: MentraClient[],
    options: CoordinatedTestOptions
  ): Promise<StressTestResult> {
    const startTime = Date.now();
    const result: StressTestResult = {
      totalClients: clients.length,
      successfulConnections: 0,
      failedConnections: 0,
      totalActions: 0,
      successfulActions: 0,
      failedActions: 0,
      averageLatency: 0,
      errors: [],
      metrics: {
        connectionsPerSecond: 0,
        actionsPerSecond: 0,
        memoryUsage: 0
      }
    };

    console.log(`[StressTest] Starting coordinated test: ${options.name}`);
    console.log(`[StressTest] Duration: ${options.duration}ms, Clients: ${clients.length}`);

    // Count successful connections
    result.successfulConnections = clients.filter(c => c.isConnected()).length;
    result.failedConnections = clients.length - result.successfulConnections;

    // Execute actions on all clients
    const actionPromises: Promise<void>[] = [];

    clients.forEach((client, clientIndex) => {
      if (!client.isConnected()) return;

      const clientActions = this.executeClientActions(
        client,
        options.actions,
        options.staggerDelay ? clientIndex * options.staggerDelay : 0,
        clientIndex
      );

      actionPromises.push(clientActions);
    });

    // Start test execution
    const actionResults = await Promise.allSettled(actionPromises);
    
    // Wait for test duration
    const remainingTime = options.duration - (Date.now() - startTime);
    if (remainingTime > 0) {
      await new Promise(resolve => setTimeout(resolve, remainingTime));
    }

    // Collect results
    actionResults.forEach((actionResult, index) => {
      if (actionResult.status === 'fulfilled') {
        result.totalActions += options.actions.length;
        result.successfulActions += options.actions.length;
      } else {
        result.totalActions += options.actions.length;
        result.failedActions += options.actions.length;
        result.errors.push(`Client ${index}: ${actionResult.reason}`);
      }
    });

    // Calculate metrics
    const testDuration = Date.now() - startTime;
    result.metrics.connectionsPerSecond = result.successfulConnections / (testDuration / 1000);
    result.metrics.actionsPerSecond = result.successfulActions / (testDuration / 1000);
    result.metrics.memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024; // MB

    // Cleanup
    await this.disconnectClients(clients);

    console.log(`[StressTest] Test completed in ${testDuration}ms`);
    console.log(`[StressTest] Success rate: ${result.successfulActions}/${result.totalActions} actions`);

    return result;
  }

  /**
   * Run full stress test with configuration
   */
  static async runStressTest(config: StressTestConfig): Promise<StressTestResult> {
    console.log(`[StressTest] Starting stress test with ${config.clientCount} clients`);
    
    // Spawn clients
    const clients = await this.spawnClients(config.clientCount, {
      email: config.emailTemplate,
      serverUrl: config.serverUrl
    });

    // Run coordinated test
    return this.coordinatedTest(clients, {
      name: 'Stress Test',
      duration: config.testDuration,
      actions: config.actions
    });
  }

  /**
   * Audio flood test - send continuous audio from multiple clients
   */
  static async audioFloodTest(
    clientCount: number,
    serverUrl: string,
    durationMs: number,
    audioFile?: string
  ): Promise<StressTestResult> {
    const clients = await this.spawnClients(clientCount, {
      email: 'audio-flood-{id}@example.com',
      serverUrl
    });

    const actions: StressTestAction[] = [
      { type: 'startSpeaking', delay: 0 },
      { type: 'stopSpeaking', delay: durationMs - 1000 }
    ];

    if (audioFile) {
      actions[0].data = { audioFile };
    }

    return this.coordinatedTest(clients, {
      name: 'Audio Flood Test',
      duration: durationMs,
      actions,
      staggerDelay: 50 // 50ms between client starts
    });
  }

  /**
   * App lifecycle stress test
   */
  static async appLifecycleTest(
    clientCount: number,
    serverUrl: string,
    apps: string[],
    cyclesPerClient = 5
  ): Promise<StressTestResult> {
    const clients = await this.spawnClients(clientCount, {
      email: 'app-lifecycle-{id}@example.com',
      serverUrl
    });

    const actions: StressTestAction[] = [];
    
    // Create start/stop cycles for each app
    for (let cycle = 0; cycle < cyclesPerClient; cycle++) {
      apps.forEach((app, appIndex) => {
        actions.push({
          type: 'startApp',
          delay: cycle * 10000 + appIndex * 1000,
          data: { packageName: app }
        });
        
        actions.push({
          type: 'stopApp',
          delay: cycle * 10000 + appIndex * 1000 + 3000,
          data: { packageName: app }
        });
      });
    }

    return this.coordinatedTest(clients, {
      name: 'App Lifecycle Test',
      duration: cyclesPerClient * 10000,
      actions
    });
  }

  //===========================================================
  // Private Methods
  //===========================================================

  private static async executeClientActions(
    client: MentraClient,
    actions: StressTestAction[],
    initialDelay: number,
    clientIndex: number
  ): Promise<void> {
    // Initial delay for staggering
    if (initialDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, initialDelay));
    }

    for (const action of actions) {
      // Delay before action
      if (action.delay > 0) {
        await new Promise(resolve => setTimeout(resolve, action.delay));
      }

      try {
        await this.executeAction(client, action);
      } catch (error) {
        console.error(`[StressTest] Client ${clientIndex} action failed:`, action.type, error);
        throw error;
      }
    }
  }

  private static async executeAction(client: MentraClient, action: StressTestAction): Promise<void> {
    switch (action.type) {
      case 'startSpeaking':
        if (action.data?.audioFile) {
          await client.startSpeakingFromFile(action.data.audioFile);
        } else {
          client.startSpeaking();
        }
        break;

      case 'stopSpeaking':
        client.stopSpeaking();
        break;

      case 'startApp':
        if (action.data?.packageName) {
          await client.startApp(action.data.packageName);
        }
        break;

      case 'stopApp':
        if (action.data?.packageName) {
          await client.stopApp(action.data.packageName);
        }
        break;

      case 'lookUp':
        client.lookUp();
        break;

      case 'lookDown':
        client.lookDown();
        break;

      case 'updateLocation':
        if (action.data?.lat && action.data?.lng) {
          client.updateLocation(action.data.lat, action.data.lng);
        }
        break;

      default:
        console.warn(`[StressTest] Unknown action type: ${action.type}`);
    }
  }

  private static async disconnectClients(clients: MentraClient[]): Promise<void> {
    const disconnectPromises = clients.map(async (client, index) => {
      try {
        await client.disconnect();
      } catch (error) {
        console.error(`[StressTest] Failed to disconnect client ${index}:`, error);
      }
    });

    await Promise.allSettled(disconnectPromises);
  }
}