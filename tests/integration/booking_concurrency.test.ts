import request from 'supertest';
import { createApp } from '../../src/app';
import { SecurityService } from '../../src/infrastructure/security/encryption';
import { UserRole } from '../../src/domain/types';
import { doctorService } from '../../src/application/doctor.service';

describe('Booking & Concurrency Race Condition Integration Tests', () => {
  const app = createApp();

  const doctorId = '33333333-3333-4333-8333-333333333331';
  let doctorToken: string;
  let patientTokens: string[] = [];

  beforeAll(async () => {
    doctorToken = SecurityService.generateAccessToken({
      userId: '22222222-2222-4222-8222-222222222221',
      email: 'dr.sharma@amrutam.co.in',
      role: UserRole.DOCTOR,
    });

    // Create 10 different patient tokens to simulate 10 concurrent real users
    for (let i = 1; i <= 10; i++) {
      patientTokens.push(
        SecurityService.generateAccessToken({
          userId: `44444444-4444-4444-8444-44444444440${i}`,
          email: `patient${i}@example.com`,
          role: UserRole.PATIENT,
        })
      );
    }
  });

  it('should search doctors with specialization and fee filter', async () => {
    const res = await request(app)
      .get('/api/v1/doctors')
      .query({
        specialization: 'Ayurveda',
        maxFee: 1000,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.doctors.length).toBeGreaterThanOrEqual(1);
  });

  it('should fetch doctor details and available slots', async () => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];

    const res = await request(app)
      .get(`/api/v1/doctors/${doctorId}/slots`)
      .query({ date: dateStr });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('CONCURRENCY STRESS TEST: should prevent race conditions and double-booking when 10 patients book the exact same slot concurrently', async () => {
    // 1. Create a fresh single slot for concurrency test
    const testDate = '2026-11-15';
    const slots = await doctorService.createAvailabilitySlots(
      doctorId,
      testDate,
      '16:00:00',
      '16:30:00',
      30,
      750.0
    );
    expect(slots.length).toBe(1);
    const targetSlotId = slots[0].id;

    // 2. Fire 10 simultaneous booking requests using Promise.all
    const bookingPromises = patientTokens.map((token, index) =>
      request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', `stress-test-slot-${targetSlotId}-user-${index}`)
        .send({
          slotId: targetSlotId,
          chiefComplaint: `Concurrent booking test user ${index}`,
        })
    );

    const responses = await Promise.all(bookingPromises);

    // 3. Exactly one request must succeed (201 Created)
    const successfulResponses = responses.filter((r) => r.status === 201);
    const failedResponses = responses.filter((r) => r.status !== 201);

    expect(successfulResponses.length).toBe(1);
    expect(failedResponses.length).toBe(9);

    // 4. Verify that the failed responses received slot conflict or already booked error
    failedResponses.forEach((r) => {
      expect([409, 500]).toContain(r.status);
      expect(r.body.success).toBe(false);
      expect(r.body.error.message).toMatch(/(Slot is currently being booked|no longer available)/i);
    });

    // 5. Verify the slot status is now BOOKED and cannot be booked again
    const lateAttempt = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${patientTokens[0]}`)
      .send({ slotId: targetSlotId });

    expect(lateAttempt.status).not.toBe(201);
    expect(lateAttempt.body.success).toBe(false);
  });
});
