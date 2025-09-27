package com.augmentos.asg_client.io.media.core;

import android.util.Log;

import java.util.ArrayList;
import java.util.List;

/**
 * Performance timing analyzer for internet connectivity verification
 * Provides detailed timing analysis and performance metrics
 */
public class InternetConnectivityTimingAnalyzer {
    private static final String TAG = "ConnectivityTiming";
    
    private static class TimingMeasurement {
        public final String operation;
        public final long durationMs;
        public final boolean success;
        public final long timestamp;
        
        public TimingMeasurement(String operation, long durationMs, boolean success) {
            this.operation = operation;
            this.durationMs = durationMs;
            this.success = success;
            this.timestamp = System.currentTimeMillis();
        }
    }
    
    private static final List<TimingMeasurement> measurements = new ArrayList<>();
    private static final int MAX_MEASUREMENTS = 100; // Keep last 100 measurements
    
    /**
     * Record a timing measurement
     */
    public static void recordMeasurement(String operation, long durationMs, boolean success) {
        synchronized (measurements) {
            measurements.add(new TimingMeasurement(operation, durationMs, success));
            
            // Keep only the most recent measurements
            if (measurements.size() > MAX_MEASUREMENTS) {
                measurements.remove(0);
            }
            
            Log.d(TAG, "📊 Recorded timing: " + operation + " = " + durationMs + "ms (success: " + success + ")");
        }
    }
    
    /**
     * Get performance statistics for a specific operation
     */
    public static PerformanceStats getStats(String operation) {
        synchronized (measurements) {
            List<TimingMeasurement> operationMeasurements = new ArrayList<>();
            
            for (TimingMeasurement measurement : measurements) {
                if (measurement.operation.equals(operation)) {
                    operationMeasurements.add(measurement);
                }
            }
            
            if (operationMeasurements.isEmpty()) {
                return new PerformanceStats(operation, 0, 0, 0, 0, 0, 0);
            }
            
            // Calculate statistics
            long totalDuration = 0;
            long minDuration = Long.MAX_VALUE;
            long maxDuration = 0;
            int successCount = 0;
            
            for (TimingMeasurement measurement : operationMeasurements) {
                totalDuration += measurement.durationMs;
                minDuration = Math.min(minDuration, measurement.durationMs);
                maxDuration = Math.max(maxDuration, measurement.durationMs);
                if (measurement.success) {
                    successCount++;
                }
            }
            
            long avgDuration = totalDuration / operationMeasurements.size();
            double successRate = (double) successCount / operationMeasurements.size() * 100;
            
            return new PerformanceStats(
                operation,
                operationMeasurements.size(),
                avgDuration,
                minDuration,
                maxDuration,
                successRate,
                totalDuration
            );
        }
    }
    
    /**
     * Get overall performance statistics
     */
    public static OverallStats getOverallStats() {
        synchronized (measurements) {
            if (measurements.isEmpty()) {
                return new OverallStats(0, 0, 0, 0, 0);
            }
            
            long totalDuration = 0;
            int successCount = 0;
            long minDuration = Long.MAX_VALUE;
            long maxDuration = 0;
            
            for (TimingMeasurement measurement : measurements) {
                totalDuration += measurement.durationMs;
                minDuration = Math.min(minDuration, measurement.durationMs);
                maxDuration = Math.max(maxDuration, measurement.durationMs);
                if (measurement.success) {
                    successCount++;
                }
            }
            
            long avgDuration = totalDuration / measurements.size();
            double successRate = (double) successCount / measurements.size() * 100;
            
            return new OverallStats(
                measurements.size(),
                avgDuration,
                minDuration,
                maxDuration,
                successRate
            );
        }
    }
    
    /**
     * Log detailed performance report
     */
    public static void logPerformanceReport() {
        Log.d(TAG, "📊 ===== INTERNET CONNECTIVITY PERFORMANCE REPORT =====");
        
        // Individual operation stats
        String[] operations = {
            "DNS Resolution Test",
            "HTTP Connectivity Test", 
            "Internet Reachability Test",
            "Overall Internet Verification"
        };
        
        for (String operation : operations) {
            PerformanceStats stats = getStats(operation);
            if (stats.sampleCount > 0) {
                Log.d(TAG, "📊 " + operation + ":");
                Log.d(TAG, "   Samples: " + stats.sampleCount);
                Log.d(TAG, "   Average: " + stats.avgDurationMs + "ms");
                Log.d(TAG, "   Min: " + stats.minDurationMs + "ms");
                Log.d(TAG, "   Max: " + stats.maxDurationMs + "ms");
                Log.d(TAG, "   Success Rate: " + String.format("%.1f", stats.successRate) + "%");
                Log.d(TAG, "   Total Time: " + stats.totalDurationMs + "ms");
            }
        }
        
        // Overall stats
        OverallStats overall = getOverallStats();
        Log.d(TAG, "📊 OVERALL STATISTICS:");
        Log.d(TAG, "   Total Samples: " + overall.totalSamples);
        Log.d(TAG, "   Average Duration: " + overall.avgDurationMs + "ms");
        Log.d(TAG, "   Min Duration: " + overall.minDurationMs + "ms");
        Log.d(TAG, "   Max Duration: " + overall.maxDurationMs + "ms");
        Log.d(TAG, "   Overall Success Rate: " + String.format("%.1f", overall.successRate) + "%");
        
        Log.d(TAG, "📊 ===== END PERFORMANCE REPORT =====");
    }
    
    /**
     * Clear all measurements (useful for testing)
     */
    public static void clearMeasurements() {
        synchronized (measurements) {
            measurements.clear();
            Log.d(TAG, "📊 Cleared all timing measurements");
        }
    }
    
    /**
     * Performance statistics for a specific operation
     */
    public static class PerformanceStats {
        public final String operation;
        public final int sampleCount;
        public final long avgDurationMs;
        public final long minDurationMs;
        public final long maxDurationMs;
        public final double successRate;
        public final long totalDurationMs;
        
        public PerformanceStats(String operation, int sampleCount, long avgDurationMs, 
                               long minDurationMs, long maxDurationMs, double successRate, long totalDurationMs) {
            this.operation = operation;
            this.sampleCount = sampleCount;
            this.avgDurationMs = avgDurationMs;
            this.minDurationMs = minDurationMs;
            this.maxDurationMs = maxDurationMs;
            this.successRate = successRate;
            this.totalDurationMs = totalDurationMs;
        }
    }
    
    /**
     * Overall performance statistics
     */
    public static class OverallStats {
        public final int totalSamples;
        public final long avgDurationMs;
        public final long minDurationMs;
        public final long maxDurationMs;
        public final double successRate;
        
        public OverallStats(int totalSamples, long avgDurationMs, long minDurationMs, 
                           long maxDurationMs, double successRate) {
            this.totalSamples = totalSamples;
            this.avgDurationMs = avgDurationMs;
            this.minDurationMs = minDurationMs;
            this.maxDurationMs = maxDurationMs;
            this.successRate = successRate;
        }
    }
}
