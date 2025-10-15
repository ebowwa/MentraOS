/**
 * OpenTelemetry Setup for Photo Capture Performance Tracing
 *
 * Configures distributed tracing across SDK → Cloud → Mobile → Glasses pipeline
 */

import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import { Resource } from "@opentelemetry/resources";
import {
  BatchSpanProcessor,
  InMemorySpanExporter,
} from "@opentelemetry/sdk-trace-node";
import { trace, context, SpanStatusCode, Span } from "@opentelemetry/api";
import { logger as rootLogger } from "../services/logging/pino-logger";

const logger = rootLogger.child({ service: "otel-setup" });

// In-memory exporter for storing spans locally
export const inMemoryExporter = new InMemorySpanExporter();

// Optional OTLP exporter for external observability platforms
let otlpExporter: OTLPTraceExporter | undefined;
let sdk: NodeSDK | undefined;

/**
 * Initialize OpenTelemetry SDK
 */
export function initializeTracing(): void {
  const enabled = process.env.OTEL_ENABLED === "true";

  if (!enabled) {
    logger.info(
      "📊 OpenTelemetry tracing disabled (OTEL_ENABLED not set to true)",
    );
    return;
  }

  try {
    logger.info("📊 Initializing OpenTelemetry tracing...");

    // Create resource with service information
    const resource = new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]:
        process.env.OTEL_SERVICE_NAME || "mentra-cloud",
    });

    // Create span processors
    const spanProcessors = [
      // Always use in-memory exporter for local storage
      new BatchSpanProcessor(inMemoryExporter),
    ];

    // Optionally add OTLP exporter if endpoint is configured
    const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    if (otlpEndpoint) {
      logger.info({ otlpEndpoint }, "📡 Configuring OTLP exporter");
      otlpExporter = new OTLPTraceExporter({
        url: otlpEndpoint,
      });
      spanProcessors.push(new BatchSpanProcessor(otlpExporter));
    }

    // Initialize SDK
    sdk = new NodeSDK({
      resource,
      spanProcessors,
    });

    sdk.start();
    logger.info("✅ OpenTelemetry tracing initialized successfully");
  } catch (error) {
    logger.error({ error }, "❌ Failed to initialize OpenTelemetry tracing");
  }
}

/**
 * Shutdown OpenTelemetry SDK
 */
export async function shutdownTracing(): Promise<void> {
  if (sdk) {
    logger.info("📊 Shutting down OpenTelemetry tracing...");
    await sdk.shutdown();
    logger.info("✅ OpenTelemetry tracing shut down");
  }
}

/**
 * Get the global tracer for photo capture instrumentation
 */
export function getPhotoTracer() {
  return trace.getTracer("mentra-photo-capture", "1.0.0");
}

/**
 * Create a checkpoint span for timing measurements
 */
export function createCheckpoint(
  name: string,
  checkpointId: string,
  attributes: Record<string, any> = {},
): Span {
  const tracer = getPhotoTracer();
  const span = tracer.startSpan(name, {
    attributes: {
      "checkpoint.id": checkpointId,
      "checkpoint.timestamp": Date.now(),
      ...attributes,
    },
  });
  return span;
}

/**
 * Extract trace context from JSON message
 */
export function extractTraceContext(message: any):
  | {
      traceId?: string;
      spanId?: string;
      traceFlags?: number;
    }
  | undefined {
  if (message.traceContext) {
    return {
      traceId: message.traceContext.traceId,
      spanId: message.traceContext.spanId,
      traceFlags: message.traceContext.traceFlags || 1,
    };
  }
  return undefined;
}

/**
 * Inject trace context into JSON message
 */
export function injectTraceContext(message: any, span: Span): any {
  const spanContext = span.spanContext();
  return {
    ...message,
    traceContext: {
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
      traceFlags: spanContext.traceFlags,
    },
  };
}

/**
 * Record checkpoint timing
 */
export function recordCheckpoint(
  checkpointId: string,
  requestId: string,
  additionalData: Record<string, any> = {},
): void {
  const timestamp = Date.now();
  logger.debug(
    {
      checkpointId,
      requestId,
      timestamp,
      ...additionalData,
    },
    `📍 Checkpoint: ${checkpointId}`,
  );
}

export { trace, context, SpanStatusCode };
