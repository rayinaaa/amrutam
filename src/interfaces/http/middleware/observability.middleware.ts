import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { Tracer } from '../../../infrastructure/observability/tracer';
import { httpRequestCounter, httpRequestDurationHistogram } from '../../../infrastructure/observability/metrics';
import { logger } from '../../../infrastructure/observability/logger';

export function observabilityMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startHrTime = process.hrtime();
  const requestId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
  const traceContext = Tracer.extractOrGenerateTraceContext(req);

  req.requestId = requestId;
  req.traceId = traceContext.traceId;

  res.setHeader('X-Request-Id', requestId);
  res.setHeader('traceparent', Tracer.formatTraceparent(traceContext));

  res.on('finish', () => {
    const elapsedHrTime = process.hrtime(startHrTime);
    const durationInSeconds = elapsedHrTime[0] + elapsedHrTime[1] / 1e9;

    const route = req.route?.path || req.baseUrl || req.path || 'unknown';
    const statusCode = res.statusCode.toString();

    // Record Prometheus metrics
    httpRequestCounter.inc({
      method: req.method,
      route,
      status_code: statusCode,
    });

    httpRequestDurationHistogram.observe(
      {
        method: req.method,
        route,
        status_code: statusCode,
      },
      durationInSeconds
    );

    // Structured JSON log
    logger.info(`HTTP ${req.method} ${req.originalUrl} ${statusCode} - ${Math.round(durationInSeconds * 1000)}ms`, {
      requestId,
      traceId: traceContext.traceId,
      spanId: traceContext.spanId,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Math.round(durationInSeconds * 1000),
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
    });
  });

  next();
}
