// src/index.ts

// Export all types (including re-exports from @mentra/types and AuthenticatedRequest)
export * from "./types";

// Export app session and server exports
export * from "./app/index";

// Export app session modules
export * from "./app/session/modules";

// Export logging exports
export * from "./logging/logger";

// Utility exports
export * from "./utils/bitmap-utils";
export * from "./utils/animation-utils";

/**
 * WebSocket error information
 */
export interface WebSocketError {
  code: string;
  message: string;
  details?: unknown;
}
