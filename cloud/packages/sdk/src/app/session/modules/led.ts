/**
 * 💡 LED Control Module
 *
 * Provides RGB LED control functionality for App Sessions.
 * Controls the RGB LEDs on smart glasses with custom colors and timing patterns.
 */

import {
  RgbLedControlRequest,
  AppToCloudMessageType,
  LedColor,
} from "../../../types";
import { Logger } from "pino";

/**
 * Options for LED control
 */
export interface LedControlOptions {
  /** LED color */
  color?: LedColor;
  /** LED on duration in milliseconds */
  ontime?: number;
  /** LED off duration in milliseconds */
  offtime?: number;
  /** Number of on/off cycles */
  count?: number;
}

/**
 * 💡 LED Control Module Implementation
 *
 * Provides methods for controlling RGB LEDs on smart glasses.
 * Supports low-level on/off control and higher-level pattern methods.
 *
 * @example
 * ```typescript
 * // Turn on red LED for 1 second
 * await session.led.turnOn({ color: 'red', ontime: 1000, count: 1 });
 *
 * // Blink green LED
 * await session.led.blink('green', 500, 500, 5);
 *
 * // Pulse blue LED
 * await session.led.pulse('blue', 2000);
 *
 * // Solid white LED for 5 seconds
 * await session.led.solid('white', 5000);
 *
 * // Turn off LEDs
 * await session.led.turnOff();
 * ```
 */
export class LedModule {
  private send: (message: any) => void;
  private packageName: string;
  private sessionId: string;
  private logger: Logger;

  /**
   * Create a new LedModule
   *
   * @param packageName - The App package name
   * @param sessionId - The current session ID
   * @param send - Function to send messages to the cloud
   * @param logger - Logger instance for debugging
   */
  constructor(
    packageName: string,
    sessionId: string,
    send: (message: any) => void,
    logger?: Logger,
  ) {
    this.packageName = packageName;
    this.sessionId = sessionId;
    this.send = send;
    this.logger = logger || (console as any);
  }

  // =====================================
  // 💡 Low-level LED Control
  // =====================================

  /**
   * 💡 Turn on an LED with specified timing parameters
   *
   * @param options - LED control options (color, timing, count)
   * @returns Promise that resolves immediately after sending the command
   *
   * @example
   * ```typescript
   * // Solid red for 2 seconds
   * await session.led.turnOn({ color: 'red', ontime: 2000, count: 1 });
   *
   * // Blink white 3 times
   * await session.led.turnOn({ color: 'white', ontime: 500, offtime: 500, count: 3 });
   * ```
   */
  async turnOn(options: LedControlOptions): Promise<void> {
    try {
      // Generate unique request ID for tracking
      const requestId = `led_req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      // Create LED control request message
      const message: RgbLedControlRequest = {
        type: AppToCloudMessageType.RGB_LED_CONTROL,
        packageName: this.packageName,
        sessionId: this.sessionId,
        requestId,
        timestamp: new Date(),
        action: "on",
        color: options.color || "red",
        ontime: options.ontime || 1000,
        offtime: options.offtime || 0,
        count: options.count || 1,
      };

      // Send request to cloud (fire-and-forget)
      this.send(message);

      this.logger.info(
        {
          requestId,
          color: options.color,
          ontime: options.ontime,
          offtime: options.offtime,
          count: options.count,
        },
        `💡 LED control request sent`,
      );

      // Resolve immediately - no waiting for response
      return Promise.resolve();
    } catch (error) {
      this.logger.error({ error, options }, "❌ Error in LED turnOn request");
      throw error;
    }
  }

  /**
   * 💡 Turn off all LEDs
   *
   * @returns Promise that resolves immediately after sending the command
   *
   * @example
   * ```typescript
   * await session.led.turnOff();
   * ```
   */
  async turnOff(): Promise<void> {
    try {
      // Generate unique request ID for tracking
      const requestId = `led_req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      // Create LED control request message
      const message: RgbLedControlRequest = {
        type: AppToCloudMessageType.RGB_LED_CONTROL,
        packageName: this.packageName,
        sessionId: this.sessionId,
        requestId,
        timestamp: new Date(),
        action: "off",
      };

      // Send request to cloud (fire-and-forget)
      this.send(message);

      this.logger.info({ requestId }, `💡 LED turn off request sent`);

      // Resolve immediately - no waiting for response
      return Promise.resolve();
    } catch (error) {
      this.logger.error({ error }, "❌ Error in LED turnOff request");
      throw error;
    }
  }

  // =====================================
  // 💡 Pattern Methods (SDK-generated)
  // =====================================

  /**
   * 💡 Blink an LED with specified timing
   *
   * @param color - LED color to use
   * @param ontime - How long LED stays on (ms)
   * @param offtime - How long LED stays off (ms)
   * @param count - Number of blink cycles
   * @returns Promise that resolves when the pattern completes
   *
   * @example
   * ```typescript
   * // Blink red LED 5 times (500ms on, 500ms off)
   * await session.led.blink('red', 500, 500, 5);
   * ```
   */
  async blink(
    color: LedColor,
    ontime: number,
    offtime: number,
    count: number,
  ): Promise<void> {
    return this.turnOn({
      color,
      ontime,
      offtime,
      count,
    });
  }

  /**
   * 💡 Pulse an LED (smooth fade effect simulated with rapid blinking)
   *
   * Creates a pulsing effect by rapidly blinking the LED with varying timing.
   *
   * @param color - LED color to use
   * @param duration - Total duration of pulse effect (ms)
   * @returns Promise that resolves when the pulse completes
   *
   * @example
   * ```typescript
   * // Pulse blue LED for 2 seconds
   * await session.led.pulse('blue', 2000);
   * ```
   */
  async pulse(color: LedColor, duration: number): Promise<void> {
    // Simulate pulse with rapid blinking (20ms on, 80ms off for soft glow effect)
    const cycleTime = 100; // 100ms per cycle
    const count = Math.floor(duration / cycleTime);

    return this.turnOn({
      color,
      ontime: 20,
      offtime: 80,
      count,
    });
  }

  /**
   * 💡 Solid LED mode - LED stays on continuously for specified duration
   *
   * Creates a solid LED effect with no off time, perfect for continuous illumination.
   *
   * @param color - LED color to use
   * @param duration - How long LED stays on (ms)
   * @returns Promise that resolves when the command is sent
   *
   * @example
   * ```typescript
   * // Solid red LED for 5 seconds
   * await session.led.solid('red', 5000);
   *
   * // Solid white LED for 30 seconds
   * await session.led.solid('white', 30000);
   * ```
   */
  async solid(color: LedColor, duration: number): Promise<void> {
    return this.turnOn({
      color,
      ontime: duration,
      offtime: 0, // No off time for solid mode
      count: 1, // Single cycle
    });
  }

  // =====================================
  // 💡 Cleanup
  // =====================================

  /**
   * Clean up LED module
   *
   * @internal
   */
  cleanup(): void {
    this.logger.info("🧹 LED module cleaned up");
  }
}
