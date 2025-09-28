/**
 * Types for testing utilities
 */

import type { MentraClient } from '../MentraClient';

export interface BenchmarkResult {
  averageLatency: number;
  accuracy: number;
  totalTests: number;
  successfulTests: number;
  errors: string[];
  transcriptionResults: Array<{
    expected: string;
    actual: string;
    latency: number;
    accuracy: number;
  }>;
}

export interface ExpectedWord {
  text: string;
  startTime: number; // ms
  endTime: number;   // ms
}

export interface StressTestConfig {
  clientCount: number;
  testDuration: number; // ms
  actions: StressTestAction[];
  emailTemplate: string; // e.g., 'stress-test-{id}@example.com'
  serverUrl: string;
}

export interface StressTestAction {
  type: 'startSpeaking' | 'stopSpeaking' | 'startApp' | 'stopApp' | 'lookUp' | 'lookDown' | 'updateLocation';
  delay: number; // ms
  data?: any; // Additional data for the action
}

export interface StressTestResult {
  totalClients: number;
  successfulConnections: number;
  failedConnections: number;
  totalActions: number;
  successfulActions: number;
  failedActions: number;
  averageLatency: number;
  errors: string[];
  metrics: {
    connectionsPerSecond: number;
    actionsPerSecond: number;
    memoryUsage: number;
  };
}

export interface SynthesisOptions {
  voice: string;
  speed: number;
  pitch?: number;
  volume?: number;
}

export interface BenchmarkAudioOptions {
  sampleRate: number;
  channels: number;
  format: 'wav' | 'pcm16';
  silencePadding: number; // ms
}

export interface ClientSpawnOptions {
  email: string;
  serverUrl: string;
  coreToken?: string;
  debug?: boolean;
}

export interface CoordinatedTestOptions {
  name: string;
  duration: number;
  actions: StressTestAction[];
  staggerDelay?: number; // ms between client starts
}