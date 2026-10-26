import { Request, Response, NextFunction } from 'express';
import { config } from '../../../config';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const memoryRateLimitStore = new Map<string, RateLimitRecord>();

export function rateLimiter(
  windowMs: number = config.RATE_LIMIT_WINDOW_MS,
  maxRequests: number = config.RATE_LIMIT_MAX_REQUESTS
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const identifier = req.user?.userId || req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    const record = memoryRateLimitStore.get(identifier);

    if (!record || now > record.resetAt) {
      memoryRateLimitStore.set(identifier, {
        count: 1,
        resetAt: now + windowMs,
      });
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', maxRequests - 1);
      next();
      return;
    }

    if (record.count >= maxRequests) {
      const retryAfterSeconds = Math.ceil((record.resetAt - now) / 1000);
      res.setHeader('Retry-After', retryAfterSeconds);
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', 0);
      res.status(429).json({
        success: false,
        error: {
          code: 'TOO_MANY_REQUESTS',
          message: `Rate limit exceeded. Try again in ${retryAfterSeconds} seconds.`,
        },
      });
      return;
    }

    record.count++;
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', maxRequests - record.count);
    next();
  };
}
