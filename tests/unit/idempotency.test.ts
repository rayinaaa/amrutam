import request from 'supertest';
import { createApp } from '../../src/app';
import { SecurityService } from '../../src/infrastructure/security/encryption';
import { UserRole } from '../../src/domain/types';

describe('Idempotency Middleware Unit & Contract Tests', () => {
  const app = createApp();
  let patientToken: string;
  const patientUserId = '44444444-4444-4444-8444-444444444441';

  beforeAll(() => {
    patientToken = SecurityService.generateAccessToken({
      userId: patientUserId,
      email: 'patient.arjun@gmail.com',
      role: UserRole.PATIENT,
    });
  });

  it('should return identical response when same Idempotency-Key is used for duplicate requests', async () => {
    const idempotencyKey = `test-idemp-${Date.now()}`;
    // Slot 55555555-5555-4555-8555-555555555551 is seeded
    const payload = {
      slotId: '55555555-5555-4555-8555-555555555551',
      chiefComplaint: 'Severe migraine headaches',
      symptoms: ['Headache', 'Nausea'],
    };

    // First request
    const res1 = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${patientToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload);

    expect(res1.status).toBe(201);
    expect(res1.body.success).toBe(true);
    const consultationId = res1.body.data.consultation.id;

    // Duplicate request with identical idempotency key
    const res2 = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${patientToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload);

    expect(res2.status).toBe(201);
    expect(res2.headers['x-cache-lookup']).toBe('HIT');
    expect(res2.headers['idempotent-replayed']).toBe('true');
    expect(res2.body.data.consultation.id).toEqual(consultationId);
  });

  it('should reject request with 422 if Idempotency-Key is reused with different payload', async () => {
    const idempotencyKey = `conflict-idemp-${Date.now()}`;

    // First request
    await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${patientToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        slotId: '55555555-5555-4555-8555-555555555552',
        chiefComplaint: 'First complaint',
      });

    // Replay with DIFFERENT payload
    const resConflict = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${patientToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        slotId: '55555555-5555-4555-8555-555555555553',
        chiefComplaint: 'Completely different complaint',
      });

    expect(resConflict.status).toBe(422);
    expect(resConflict.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
  });
});
