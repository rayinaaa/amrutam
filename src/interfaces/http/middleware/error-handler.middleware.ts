import { Request, Response, NextFunction } from 'express';
import { logger } from '../../../infrastructure/observability/logger';
import { config } from '../../../config';

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const statusCode = err.statusCode || (err.message?.includes('not found') ? 404 : err.message?.includes('denied') || err.message?.includes('Unauthorized') ? 403 : 500);

  logger.error(`Error processing ${req.method} ${req.originalUrl}: ${err.message}`, {
    requestId: req.requestId,
    traceId: req.traceId,
    stack: err.stack,
  });

  res.status(statusCode).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_SERVER_ERROR',
      message: err.message || 'An unexpected error occurred',
      ...(config.NODE_ENV !== 'production' && { stack: err.stack }),
    },
  });
}
