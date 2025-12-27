/**
 * Testing utilities for the AugmentOS Cloud Client
 * 
 * These utilities are separate from the core client to keep the main SDK clean.
 * They provide tools for stress testing, transcription benchmarking, and audio synthesis.
 */

export { TranscriptionBenchmark } from './TranscriptionBenchmark';
export { StressTestRunner } from './StressTestRunner';
export { AudioSynthesizer } from './AudioSynthesizer';
export { AuthService } from './AuthService';

export type {
  BenchmarkResult,
  StressTestConfig,
  StressTestResult,
  ExpectedWord,
  SynthesisOptions,
  BenchmarkAudioOptions
} from './types';