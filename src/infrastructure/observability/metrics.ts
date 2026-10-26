import client from 'prom-client';

// Collect default system metrics (Memory, CPU, Event loop lag, GC)
client.collectDefaultMetrics({ prefix: 'amrutam_' });

// HTTP Request Counter
export const httpRequestCounter = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests processed',
  labelNames: ['method', 'route', 'status_code'],
});

// HTTP Request Duration Histogram (Custom buckets for p95 < 200ms reads, < 500ms writes validation)
export const httpRequestDurationHistogram = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.025, 0.05, 0.1, 0.2, 0.35, 0.5, 1, 2.5, 5],
});

// Business Metrics: Consultations
export const consultationsTotalCounter = new client.Counter({
  name: 'telemedicine_consultations_total',
  help: 'Total number of consultations by status',
  labelNames: ['status'],
});

// Business Metrics: Booking Conflicts (Race conditions caught and prevented)
export const bookingConflictsCounter = new client.Counter({
  name: 'telemedicine_booking_conflicts_total',
  help: 'Total number of slot booking conflicts / double-booking attempts prevented',
});

// Business Metrics: Active Consultations
export const activeConsultationsGauge = new client.Gauge({
  name: 'telemedicine_active_consultations',
  help: 'Current number of active ongoing consultations',
});

// Business Metrics: Payments
export const paymentsTotalCounter = new client.Counter({
  name: 'telemedicine_payments_total',
  help: 'Total number of payments processed by status',
  labelNames: ['status'],
});

// Cache Metrics
export const cacheHitsCounter = new client.Counter({
  name: 'cache_hits_total',
  help: 'Total cache hits',
  labelNames: ['cache_name'],
});

export const cacheMissesCounter = new client.Counter({
  name: 'cache_misses_total',
  help: 'Total cache misses',
  labelNames: ['cache_name'],
});

export const metricsRegistry = client.register;
