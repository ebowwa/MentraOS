// packages/utils/src/logger.ts
import winston from 'winston';
import { UserSession } from '@augmentos/sdk';

// Create a format to include error stacks
const errorStackFormat = winston.format((info) => {
  if (info.error instanceof Error) {
    info.stack = info.error.stack;
    info.errorMessage = info.error.message;
    delete info.error;
  }
  return info;
});

// Factory function to create a logger
export function createLogger(defaultMeta = {}) {
  return winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
      errorStackFormat(),
      winston.format.timestamp(),
      winston.format.json()
    ),
    defaultMeta: {
      service: process.env.SERVICE_NAME || 'unknown-service',
      ...defaultMeta
    },
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, userId, sessionId, service, stack, ...rest }) => {
            const userInfo = userId ? `[${userId}]` : '';
            const sessionInfo = sessionId ? `[${sessionId}]` : '';
            const meta = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
            const errorStack = stack ? `\n${stack}` : '';
            return `${timestamp} [${service}]${userInfo}${sessionInfo} ${level}: ${message}${meta}${errorStack}`;
          })
        )
      })
    ]
  });
}

// System logger for non-session events
export const systemLogger = createLogger();
export const logger = systemLogger;

// Add logger to UserSession
export function createLoggerForUserSession(userId: string): winston.Logger {
  // Since userId and sessionId are typically the same, just use one
  const sessionLogger = createLogger({ userId,});

  return sessionLogger;
}