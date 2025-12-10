import winston from 'winston';
import { getConfigValue } from '../core/config.js';

const { combine, timestamp, printf, colorize, json } = winston.format;

const textFormat = printf(({ level, message, timestamp, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${timestamp} [${level}]: ${message}${metaStr}`;
});

function createLogger(): winston.Logger {
  let loggingConfig: { level: string; format: string; file?: string };

  try {
    loggingConfig = getConfigValue('logging');
  } catch {
    // Default logging config if config not yet loaded
    loggingConfig = { level: 'info', format: 'text' };
  }

  const transports: winston.transport[] = [
    new winston.transports.Console({
      format: combine(
        colorize(),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        loggingConfig.format === 'json' ? json() : textFormat
      ),
    }),
  ];

  if (loggingConfig.file) {
    transports.push(
      new winston.transports.File({
        filename: loggingConfig.file,
        format: combine(timestamp(), json()),
      })
    );
  }

  return winston.createLogger({
    level: loggingConfig.level,
    transports,
  });
}

export const logger = createLogger();

export const createChildLogger = (module: string): winston.Logger => {
  return logger.child({ module });
};
