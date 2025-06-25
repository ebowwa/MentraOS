/**
 * TranscriptionBenchmark - Performance and accuracy testing for transcription
 */

import type { MentraClient } from '../MentraClient';
import type { BenchmarkResult, ExpectedWord } from './types';

export class TranscriptionBenchmark {
  private client: MentraClient;

  constructor(client: MentraClient) {
    this.client = client;
  }

  /**
   * Measure transcription latency and accuracy
   */
  async measureLatency(
    audioFilePath: string,
    options: {
      expectedWords?: ExpectedWord[];
      expectedText?: string;
      timeout?: number;
    }
  ): Promise<BenchmarkResult> {
    const timeout = options.timeout || 30000;
    const results: BenchmarkResult = {
      averageLatency: 0,
      accuracy: 0,
      totalTests: 1,
      successfulTests: 0,
      errors: [],
      transcriptionResults: []
    };

    try {
      // Set up transcription monitoring
      const transcriptions: Array<{ text: string; timestamp: number }> = [];
      const startTime = Date.now();

      const onDisplayEvent = (display: any) => {
        if (display.layout?.text || display.layout?.content) {
          const text = display.layout.text || display.layout.content;
          transcriptions.push({
            text,
            timestamp: Date.now() - startTime
          });
        }
      };

      this.client.on('display_event', onDisplayEvent);

      // Start audio streaming
      const audioStartTime = Date.now();
      await this.client.startSpeakingFromFile(audioFilePath);
      const audioEndTime = Date.now();

      // Wait for transcriptions with timeout
      await new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          this.client.off('display_event', onDisplayEvent);
          reject(new Error('Transcription timeout'));
        }, timeout);

        // Wait a bit after audio ends for final transcription
        setTimeout(() => {
          clearTimeout(timeoutId);
          this.client.off('display_event', onDisplayEvent);
          resolve(void 0);
        }, audioEndTime - audioStartTime + 2000);
      });

      // Analyze results
      if (transcriptions.length > 0) {
        results.successfulTests = 1;
        
        // Calculate average latency
        const latencies = transcriptions.map(t => t.timestamp);
        results.averageLatency = latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length;

        // Calculate accuracy if expected text is provided
        if (options.expectedText || options.expectedWords) {
          const finalTranscription = transcriptions[transcriptions.length - 1].text;
          const expectedText = options.expectedText || 
            (options.expectedWords?.map(w => w.text).join(' ') || '');
          
          const accuracy = this.calculateAccuracy(finalTranscription, expectedText);
          results.accuracy = accuracy;

          results.transcriptionResults.push({
            expected: expectedText,
            actual: finalTranscription,
            latency: results.averageLatency,
            accuracy
          });
        }
      } else {
        results.errors.push('No transcriptions received');
      }

    } catch (error) {
      results.errors.push(error instanceof Error ? error.message : String(error));
    }

    return results;
  }

  /**
   * Run multiple transcription tests and aggregate results
   */
  async runBenchmarkSuite(
    testCases: Array<{
      audioFile: string;
      expectedText?: string;
      expectedWords?: ExpectedWord[];
    }>,
    options: {
      iterations?: number;
      delay?: number;
    } = {}
  ): Promise<BenchmarkResult> {
    const iterations = options.iterations || 1;
    const delay = options.delay || 1000;
    
    const allResults: BenchmarkResult[] = [];

    for (let i = 0; i < iterations; i++) {
      for (const testCase of testCases) {
        console.log(`Running test ${i + 1}/${iterations}: ${testCase.audioFile}`);
        
        const result = await this.measureLatency(testCase.audioFile, {
          expectedText: testCase.expectedText,
          expectedWords: testCase.expectedWords
        });
        
        allResults.push(result);
        
        // Delay between tests
        if (delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // Aggregate results
    return this.aggregateResults(allResults);
  }

  /**
   * Test transcription accuracy with known audio samples
   */
  async testAccuracy(
    samples: Array<{
      audioFile: string;
      expectedText: string;
    }>
  ): Promise<{
    overallAccuracy: number;
    sampleResults: Array<{
      audioFile: string;
      expected: string;
      actual: string;
      accuracy: number;
    }>;
  }> {
    const sampleResults: Array<{
      audioFile: string;
      expected: string;
      actual: string;
      accuracy: number;
    }> = [];

    for (const sample of samples) {
      const result = await this.measureLatency(sample.audioFile, {
        expectedText: sample.expectedText
      });

      if (result.transcriptionResults.length > 0) {
        const transcriptionResult = result.transcriptionResults[0];
        sampleResults.push({
          audioFile: sample.audioFile,
          expected: transcriptionResult.expected,
          actual: transcriptionResult.actual,
          accuracy: transcriptionResult.accuracy
        });
      }
    }

    const overallAccuracy = sampleResults.length > 0
      ? sampleResults.reduce((sum, r) => sum + r.accuracy, 0) / sampleResults.length
      : 0;

    return {
      overallAccuracy,
      sampleResults
    };
  }

  //===========================================================
  // Private Methods
  //===========================================================

  private calculateAccuracy(actual: string, expected: string): number {
    // Simple word-based accuracy calculation
    const actualWords = this.normalizeText(actual).split(/\s+/);
    const expectedWords = this.normalizeText(expected).split(/\s+/);
    
    let matches = 0;
    const maxLength = Math.max(actualWords.length, expectedWords.length);
    
    for (let i = 0; i < Math.min(actualWords.length, expectedWords.length); i++) {
      if (actualWords[i] === expectedWords[i]) {
        matches++;
      }
    }
    
    return maxLength === 0 ? 1 : matches / maxLength;
  }

  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private aggregateResults(results: BenchmarkResult[]): BenchmarkResult {
    const aggregated: BenchmarkResult = {
      averageLatency: 0,
      accuracy: 0,
      totalTests: 0,
      successfulTests: 0,
      errors: [],
      transcriptionResults: []
    };

    results.forEach(result => {
      aggregated.totalTests += result.totalTests;
      aggregated.successfulTests += result.successfulTests;
      aggregated.errors.push(...result.errors);
      aggregated.transcriptionResults.push(...result.transcriptionResults);
    });

    // Calculate averages
    if (aggregated.successfulTests > 0) {
      const latencies = aggregated.transcriptionResults.map(r => r.latency);
      aggregated.averageLatency = latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length;
      
      const accuracies = aggregated.transcriptionResults.map(r => r.accuracy);
      aggregated.accuracy = accuracies.reduce((sum, acc) => sum + acc, 0) / accuracies.length;
    }

    return aggregated;
  }
}