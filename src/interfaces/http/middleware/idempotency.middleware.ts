import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { db } from '../../../infrastructure/database';
import { logger } from '../../../infrastructure/observability/logger';

export function idempotency(req: Request, res: Response, next: NextFunction): void {
  // Only apply to state-modifying HTTP methods
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    next();
    return;
  }

  const idempotencyKey = (req.headers['idempotency-key'] || req.headers['x-idempotency-key']) as string;
  if (!idempotencyKey) {
    // If not provided, proceed without idempotency guarantees
    next();
    return;
  }

  const userId = req.user?.userId || 'anonymous';
  const requestPayload = JSON.stringify(req.body || {});
  const requestHash = crypto
    .createHash('sha256')
    .update(`${req.method}:${req.originalUrl}:${userId}:${requestPayload}`)
    .digest('hex');

  // Check if idempotency key exists
  db.getIdempotencyRecord(idempotencyKey)
    .then((cachedRecord) => {
      if (cachedRecord) {
        if (cachedRecord.request_hash !== requestHash) {
          res.status(422).json({
            success: false,
            error: {
              code: 'IDEMPOTENCY_CONFLICT',
              message: 'Idempotency key was previously used with a different request payload',
            },
          });
          return;
        }

        logger.info(`Replaying cached idempotent response for key: ${idempotencyKey}`);
        res.setHeader('X-Cache-Lookup', 'HIT');
        res.setHeader('Idempotent-Replayed', 'true');
        res.status(cachedRecord.status_code).json(cachedRecord.response_body);
        return;
      }

      // Intercept response to store result
      const originalJson = res.json.bind(res);
      res.json = (body: any): Response => {
        // Cache response if status code is 2xx
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours
          db.saveIdempotencyRecord({
            key: idempotencyKey,
            user_id: req.user?.userId || null,
            route: req.originalUrl,
            request_hash: requestHash,
            status_code: res.statusCode,
            response_headers: {},
            response_body: body,
            created_at: new Date().toISOString(),
            expires_at: expiresAt,
          }).catch((err) => {
            logger.error(`Failed to save idempotency record: ${err.message}`);
          });
        }
        return originalJson(body);
      };

      next();
    })
    .catch((err) => {
      logger.error(`Error verifying idempotency key: ${err.message}`);
      next();
    });
}
