/**
 * @mentra/sdk - Type Definitions
 *
 * This file re-exports all types from the shared @mentra/types package.
 * This ensures backward compatibility and a single source of truth.
 */

import { Request } from "express";
import { AppSession } from "../app/session";

export * from "@mentra/types";

/**
 * Request interface extended with authentication info
 */
export interface AuthenticatedRequest extends Request {
  authUserId?: string;
  activeSession?: AppSession | null;
}
