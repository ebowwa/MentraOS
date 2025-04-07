/**
 * test-displays.ts
 * 
 * Utility functions for creating test display requests.
 */

import { DisplayRequest, TpaToCloudMessageType, ViewType, LayoutType } from '@augmentos/sdk';

/**
 * Create a simple text display request
 */
export function createTextDisplay(
  packageName: string,
  text: string,
  options: {
    durationMs?: number;
    forceDisplay?: boolean;
    view?: ViewType;
  } = {}
): DisplayRequest {
  return {
    type: TpaToCloudMessageType.DISPLAY_REQUEST,
    packageName,
    view: options.view || ViewType.MAIN,
    layout: {
      layoutType: LayoutType.TEXT_WALL,
      text
    },
    timestamp: new Date(),
    durationMs: options.durationMs,
    forceDisplay: options.forceDisplay
  };
}

/**
 * Create a reference card display request
 */
export function createReferenceCard(
  packageName: string,
  title: string,
  text: string,
  options: {
    durationMs?: number;
    forceDisplay?: boolean;
    view?: ViewType;
  } = {}
): DisplayRequest {
  return {
    type: TpaToCloudMessageType.DISPLAY_REQUEST,
    packageName,
    view: options.view || ViewType.MAIN,
    layout: {
      layoutType: LayoutType.REFERENCE_CARD,
      title,
      text
    },
    timestamp: new Date(),
    durationMs: options.durationMs,
    forceDisplay: options.forceDisplay
  };
}

/**
 * Create a command list display request
 */
export function createCommandList(
  packageName: string,
  title: string,
  commands: string[],
  options: {
    durationMs?: number;
    forceDisplay?: boolean;
    view?: ViewType;
  } = {}
): DisplayRequest {
  return {
    type: TpaToCloudMessageType.DISPLAY_REQUEST,
    packageName,
    view: options.view || ViewType.MAIN,
    layout: {
      layoutType: LayoutType.COMMAND_LIST,
      title,
      commands
    },
    timestamp: new Date(),
    durationMs: options.durationMs,
    forceDisplay: options.forceDisplay
  };
}

/**
 * Create a notification display request
 */
export function createNotification(
  packageName: string,
  title: string,
  message: string,
  options: {
    durationMs?: number;
    forceDisplay?: boolean;
  } = {}
): DisplayRequest {
  return {
    type: TpaToCloudMessageType.DISPLAY_REQUEST,
    packageName,
    view: ViewType.MAIN,
    layout: {
      layoutType: LayoutType.NOTIFICATION,
      title,
      message
    },
    timestamp: new Date(),
    durationMs: options.durationMs || 5000, // Default 5s for notifications
    forceDisplay: options.forceDisplay
  };
}