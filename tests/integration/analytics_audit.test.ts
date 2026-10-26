import request from 'supertest';
import { createApp } from '../../src/app';
import { SecurityService } from '../../src/infrastructure/security/encryption';
import { UserRole } from '../../src/domain/types';

describe('Admin Analytics, Compliance Audit & Observability Tests', () => {
  const app = createApp();

  let adminToken: string;

  beforeAll(() => {
    adminToken = SecurityService.generateAccessToken({
      userId: '11111111-1111-4111-8111-111111111111',
      email: 'admin@amrutam.co.in',
      role: UserRole.ADMIN,
    });
  });

  it('should return system analytics dashboard with operational KPIs and capacity metrics', async () => {
    const res = await request(app)
      .get('/api/v1/analytics/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.totalConsultations).toBeDefined();
    expect(res.body.data.financials.currency).toBe('INR');
    expect(res.body.data.scaleMetrics.dailyCapacityTarget).toBe(100000);
    expect(res.body.data.scaleMetrics.readLatencyTargetP95).toBe('< 200ms');
    expect(res.body.data.scaleMetrics.writeLatencyTargetP95).toBe('< 500ms');
  });

  it('should return immutable audit trail logs for regulatory compliance', async () => {
    const res = await request(app)
      .get('/api/v1/analytics/audit-logs')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.logs)).toBe(true);
    expect(res.body.data.logs.length).toBeGreaterThan(0);
  });

  it('should return 200 on /health and /ready probes', async () => {
    const healthRes = await request(app).get('/health');
    expect(healthRes.status).toBe(200);
    expect(healthRes.body.status).toBe('UP');

    const readyRes = await request(app).get('/ready');
    expect(readyRes.status).toBe(200);
    expect(readyRes.body.status).toBe('READY');
  });

  it('should expose Prometheus metrics on /metrics endpoint', async () => {
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.text).toContain('http_requests_total');
    expect(res.text).toContain('http_request_duration_seconds');
    expect(res.text).toContain('telemedicine_consultations_total');
  });
});
