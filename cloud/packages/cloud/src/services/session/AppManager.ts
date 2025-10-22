/**
 * Canonical AppManager export
 *
 * This module re-exports the new AppsManager as the default AppManager.
 * The legacy implementation is preserved in AppManager.legacy.ts for reference.
 */
export { AppsManager as default } from "./apps/AppsManager";
export type {
  AppStartResult,
  AppSessionI,
  AppSessionFactory,
} from "./apps/AppsManager";
export { AppSession } from "./apps/AppSession";
