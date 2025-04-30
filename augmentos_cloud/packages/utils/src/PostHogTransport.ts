// src/telemetry/PostHogTransport.ts
import Transport from 'winston-transport'          // <–– base class :contentReference[oaicite:1]{index=1}
import { posthog } from './posthog'

export interface PostHogTransportOpts extends Transport.TransportStreamOptions {
	captureExceptions?: boolean          // also call posthog.captureException
}

export class PostHogTransport extends Transport {
	private readonly captureExceptions: boolean

	constructor(opts: PostHogTransportOpts = {}) {
		super(opts)
		this.captureExceptions = opts.captureExceptions ?? true
	}

	log(info: any, callback: () => void) {
		setImmediate(() => this.emit('logged', info))  // Winston boiler-plate

		const { level, message, stack, error, ...rest } = info

		if (posthog) {
			if ((level === 'error' || level === 'warn') || (error instanceof Error || info instanceof Error)) {
				posthog.captureException(error ?? message ?? info as Error, rest.userId || 'system', {
					logger_level: level,
					stack: stack ?? error?.stack,
					...rest,
				})
			} else {
				posthog.capture({
					distinctId: rest.userId || 'system',
					event: `$LOG ${level}`,
					properties: {
						message,
						level,
						...rest,
						stack: stack ?? (error?.stack as string | undefined),
						timestamp: Date.now(),
					},
				})
			}
		}

		callback()
	}

	async close() {
		if (posthog) {
			await posthog.shutdown()
		}
	}
}
