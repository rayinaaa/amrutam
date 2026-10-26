import winston from 'winston';
import { config } from '../../config';

// Sensitive fields to redact for HIPAA / DISHA compliance
const SENSITIVE_KEYS = new Set([
  'password',
  'password_hash',
  'token',
  'authorization',
  'mfa_secret',
  'secret',
  'credit_card',
  'cvv',
  'clinical_notes',
  'clinical_notes_encrypted'
]);

function redactSensitiveData(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => redactSensitiveData(item));
  }

  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      sanitized[key] = '[REDACTED_CONFIDENTIAL]';
    } else if (typeof value === 'object') {
      sanitized[key] = redactSensitiveData(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

const redactFormat = winston.format((info) => {
  return redactSensitiveData(info);
});

export const logger = winston.createLogger({
  level: config.LOG_LEVEL,
  defaultMeta: { service: config.APP_NAME },
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
    winston.format.errors({ stack: true }),
    redactFormat(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format:
        config.NODE_ENV === 'production'
          ? winston.format.json()
          : winston.format.combine(
              winston.format.colorize(),
              winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
                const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
                return `[${timestamp}] [${level}] [${service}]: ${message}${metaStr}`;
              })
            ),
    }),
  ],
});
