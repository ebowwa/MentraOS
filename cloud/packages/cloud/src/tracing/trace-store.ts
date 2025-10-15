/**
 * In-Memory Trace Storage for Photo Capture Timing Analysis
 *
 * Stores timing checkpoints and spans for performance analysis
 */

import { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { inMemoryExporter } from "./otel-setup";
import { logger as rootLogger } from "../services/logging/pino-logger";

const logger = rootLogger.child({ service: "trace-store" });

interface Checkpoint {
  id: string;
  name: string;
  timestampMs: number;
  elapsedMs: number;
  attributes?: Record<string, any>;
}

interface TraceData {
  requestId: string;
  traceId: string;
  startTime: number;
  endTime?: number;
  totalDurationMs?: number;
  checkpoints: Checkpoint[];
  spans: Array<{
    name: string;
    startTime: number;
    endTime: number;
    durationMs: number;
    attributes: Record<string, any>;
  }>;
}

// In-memory storage: requestId -> TraceData
const traceStore = new Map<string, TraceData>();

// TTL for trace data (5 minutes)
const TRACE_TTL_MS = 5 * 60 * 1000;

/**
 * Store a checkpoint for a photo request
 */
export function storeCheckpoint(
  requestId: string,
  checkpointId: string,
  checkpointName: string,
  attributes: Record<string, any> = {},
): void {
  const timestamp = Date.now();

  let traceData = traceStore.get(requestId);
  if (!traceData) {
    traceData = {
      requestId,
      traceId: attributes.traceId || "unknown",
      startTime: timestamp,
      checkpoints: [],
      spans: [],
    };
    traceStore.set(requestId, traceData);

    // Set TTL cleanup
    setTimeout(() => {
      traceStore.delete(requestId);
      logger.debug({ requestId }, "🧹 Cleaned up trace data (TTL expired)");
    }, TRACE_TTL_MS);
  }

  const elapsedMs = timestamp - traceData.startTime;

  traceData.checkpoints.push({
    id: checkpointId,
    name: checkpointName,
    timestampMs: timestamp,
    elapsedMs,
    attributes,
  });

  logger.debug(
    { requestId, checkpointId, checkpointName, elapsedMs },
    `📍 Stored checkpoint: ${checkpointId}`,
  );
}

/**
 * Mark trace as complete
 */
export function completeTrace(requestId: string): void {
  const traceData = traceStore.get(requestId);
  if (traceData && !traceData.endTime) {
    traceData.endTime = Date.now();
    traceData.totalDurationMs = traceData.endTime - traceData.startTime;
    logger.info(
      { requestId, totalDurationMs: traceData.totalDurationMs },
      "✅ Trace completed",
    );
  }
}

/**
 * Get trace data for a photo request
 */
export function getTrace(requestId: string): TraceData | undefined {
  const traceData = traceStore.get(requestId);

  if (traceData) {
    // Enrich with spans from in-memory exporter
    const finishedSpans = inMemoryExporter.getFinishedSpans();
    const relevantSpans = finishedSpans.filter(
      (span: ReadableSpan) =>
        span.attributes["photo.requestId"] === requestId ||
        span.attributes["requestId"] === requestId,
    );

    traceData.spans = relevantSpans.map((span: ReadableSpan) => ({
      name: span.name,
      startTime: span.startTime[0] * 1000 + span.startTime[1] / 1000000,
      endTime: span.endTime[0] * 1000 + span.endTime[1] / 1000000,
      durationMs:
        (span.endTime[0] - span.startTime[0]) * 1000 +
        (span.endTime[1] - span.startTime[1]) / 1000000,
      attributes: span.attributes as Record<string, any>,
    }));

    // Sort checkpoints by timestamp
    traceData.checkpoints.sort((a, b) => a.timestampMs - b.timestampMs);
  }

  return traceData;
}

/**
 * Get all active traces
 */
export function getAllTraces(): TraceData[] {
  return Array.from(traceStore.values());
}

/**
 * Clear all traces (for testing)
 */
export function clearAllTraces(): void {
  traceStore.clear();
  inMemoryExporter.reset();
  logger.info("🧹 Cleared all trace data");
}
