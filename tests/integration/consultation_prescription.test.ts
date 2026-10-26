import request from 'supertest';
import { createApp } from '../../src/app';
import { SecurityService } from '../../src/infrastructure/security/encryption';
import { UserRole, ConsultationStatus } from '../../src/domain/types';
import { doctorService } from '../../src/application/doctor.service';

describe('Consultation Lifecycle & Digital Prescription Integration Tests', () => {
  const app = createApp();

  const doctorId = '33333333-3333-4333-8333-333333333331';
  let doctorToken: string;
  let patientToken: string;
  let unauthorizedToken: string;
  let consultationId: string;

  beforeAll(async () => {
    doctorToken = SecurityService.generateAccessToken({
      userId: '22222222-2222-4222-8222-222222222221',
      email: 'dr.sharma@amrutam.co.in',
      role: UserRole.DOCTOR,
    });

    patientToken = SecurityService.generateAccessToken({
      userId: '44444444-4444-4444-8444-444444444441',
      email: 'patient.arjun@gmail.com',
      role: UserRole.PATIENT,
    });

    unauthorizedToken = SecurityService.generateAccessToken({
      userId: '99999999-9999-9999-9999-999999999999',
      email: 'unauthorized@example.com',
      role: UserRole.PATIENT,
    });

    // Create slot and book it to obtain a consultation
    const slots = await doctorService.createAvailabilitySlots(
      doctorId,
      '2026-11-20',
      '14:00:00',
      '14:30:00',
      30,
      750.0
    );

    const bookingRes = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        slotId: slots[0].id,
        chiefComplaint: 'Chronic acidity and fatigue',
        symptoms: ['Fatigue', 'Acidity'],
      });

    expect(bookingRes.status).toBe(201);
    consultationId = bookingRes.body.data.consultation.id;
  });

  it('should allow authorized doctor to transition consultation to IN_PROGRESS and save encrypted clinical notes', async () => {
    const clinicalNotes = 'Patient observed with Pitta aggravation. Blood pressure 120/80. Prescribed herbal cooling regimen.';

    const res = await request(app)
      .patch(`/api/v1/consultations/${consultationId}/status`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        status: ConsultationStatus.IN_PROGRESS,
        clinicalNotes,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe(ConsultationStatus.IN_PROGRESS);
  });

  it('should allow authorized patient and doctor to read consultation with decrypted clinical notes', async () => {
    const res = await request(app)
      .get(`/api/v1/consultations/${consultationId}`)
      .set('Authorization', `Bearer ${patientToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.clinical_notes_encrypted).toContain('Pitta aggravation');
  });

  it('should reject unauthorized 3rd-party user from viewing patient medical records (403 Forbidden)', async () => {
    const res = await request(app)
      .get(`/api/v1/consultations/${consultationId}`)
      .set('Authorization', `Bearer ${unauthorizedToken}`);

    expect(res.status).toBe(403);
  });

  it('should issue digitally signed tamper-proof prescription and verify authenticity', async () => {
    // 1. Doctor issues prescription
    const prescriptionPayload = {
      consultationId,
      diagnosis: 'Amlapitta (Hyperacidity) due to Pitta imbalance',
      medications: [
        {
          name: 'Amrutam Shankh Vati',
          dosage: '2 tablets',
          frequency: 'Twice daily after meals',
          duration: '14 days',
          instructions: 'Take with lukewarm water',
        },
        {
          name: 'Amrutam Kuntal Care Herbal Tea',
          dosage: '1 cup',
          frequency: 'Once daily morning',
          duration: '30 days',
        },
      ],
      dietaryAdvice: 'Avoid fried and sour food items; consume coriander seed infused water.',
      followUpDate: '2026-12-05',
    };

    const issueRes = await request(app)
      .post('/api/v1/prescriptions')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send(prescriptionPayload);

    expect(issueRes.status).toBe(201);
    expect(issueRes.body.success).toBe(true);
    expect(issueRes.body.data.digital_signature_hash).toHaveLength(64);

    // 2. Patient retrieves prescription and verifies tamper-proof signature
    const getRes = await request(app)
      .get(`/api/v1/prescriptions/consultation/${consultationId}`)
      .set('Authorization', `Bearer ${patientToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.diagnosis).toBe(prescriptionPayload.diagnosis);
    expect(getRes.body.data.signatureVerification.isValid).toBe(true);
    expect(getRes.body.data.signatureVerification.status).toBe('VERIFIED_AUTHENTIC');
  });

  it('should cancel booking and trigger refund saga', async () => {
    // Create new booking to cancel
    const slots = await doctorService.createAvailabilitySlots(
      doctorId,
      '2026-11-25',
      '15:00:00',
      '15:30:00',
      30,
      750.0
    );

    const bookingRes = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ slotId: slots[0].id });

    const cancelConsultationId = bookingRes.body.data.consultation.id;

    const cancelRes = await request(app)
      .post(`/api/v1/bookings/${cancelConsultationId}/cancel`)
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ reason: 'Unavoidable work conflict' });

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.status).toBe(ConsultationStatus.CANCELLED);
    expect(cancelRes.body.data.cancellation_reason).toBe('Unavoidable work conflict');
  });
});
