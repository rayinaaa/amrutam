import crypto from 'crypto';
import { Request } from 'express';

export interface TraceContext {
  traceId: string;
  spanId: string;
  traceFlags: string;
}

export class Tracer {
  /**
   * Generates a new 16-byte hex Trace ID
   */
  public static generateTraceId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Generates a new 8-byte hex Span ID
   */
  public static generateSpanId(): string {
    return crypto.randomBytes(8).toString('hex');
  }

  /**
   * Extracts or creates W3C traceparent context from HTTP request headers
   * Format: 00-{traceId}-{spanId}-{flags}
   */
  public static extractOrGenerateTraceContext(req: Request): TraceContext {
    const traceparent = req.headers['traceparent'] as string;
    if (traceparent && typeof traceparent === 'string') {
      const parts = traceparent.split('-');
      if (parts.length === 4 && parts[1].length === 32 && parts[2].length === 16) {
        return {
          traceId: parts[1],
          spanId: parts[2],
          traceFlags: parts[3],
        };
      }
    }

    return {
      traceId: this.generateTraceId(),
      spanId: this.generateSpanId(),
      traceFlags: '01',
    };
  }

  /**
   * Formats a W3C traceparent header string
   */
  public static formatTraceparent(context: TraceContext): string {
    return `00-${context.traceId}-${context.spanId}-${context.traceFlags}`;
  }
}
