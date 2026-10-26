import request from 'supertest';
import { createApp } from '../../src/app';
import { UserRole } from '../../src/domain/types';
import { authenticator } from 'otplib';

describe('Auth & RBAC Integration Tests', () => {
  const app = createApp();

  const testPatientEmail = `test.patient.${Date.now()}@example.com`;
  const testPassword = 'AmrutamSecurePassword2026!';
  let patientToken: string;

  it('should register a new patient user and profile', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: testPatientEmail,
        password: testPassword,
        role: UserRole.PATIENT,
        firstName: 'Priya',
        lastName: 'Menon',
        phone: '+919876501234',
        gender: 'Female',
        bloodGroup: 'O+',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(testPatientEmail);
    expect(res.body.data.user.role).toBe(UserRole.PATIENT);
    expect(res.body.data.user.password_hash).toBeUndefined(); // Ensure hash is never leaked
    expect(res.body.data.token).toBeDefined();

    patientToken = res.body.data.token;
  });

  it('should authenticate user and return access token on login', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: testPatientEmail,
        password: testPassword,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
  });

  it('should reject login with invalid password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: testPatientEmail,
        password: 'WrongPassword!',
      });

    expect(res.status).toBe(500); // Handled error
    expect(res.body.success).toBe(false);
  });

  it('should allow user to setup and enable TOTP MFA', async () => {
    // 1. Setup MFA
    const setupRes = await request(app)
      .post('/api/v1/auth/mfa/setup')
      .set('Authorization', `Bearer ${patientToken}`);

    expect(setupRes.status).toBe(200);
    expect(setupRes.body.data.secret).toBeDefined();
    expect(setupRes.body.data.qrCodeDataUrl).toBeDefined();

    const secret = setupRes.body.data.secret;
    const token = authenticator.generate(secret);

    // 2. Verify and activate MFA
    const verifyRes = await request(app)
      .post('/api/v1/auth/mfa/verify')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ token });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.success).toBe(true);

    // 3. Login now requires MFA token
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: testPatientEmail,
        password: testPassword,
      });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.mfaRequired).toBe(true);
    expect(loginRes.body.data.tempMfaToken).toBeDefined();

    // 4. Complete login with MFA token
    const mfaLoginRes = await request(app)
      .post('/api/v1/auth/mfa/login')
      .send({
        tempToken: loginRes.body.data.tempMfaToken,
        token: authenticator.generate(secret),
      });

    expect(mfaLoginRes.status).toBe(200);
    expect(mfaLoginRes.body.data.token).toBeDefined();
  });

  it('should enforce RBAC: prevent patient from creating doctor availability slots (403 Forbidden)', async () => {
    const res = await request(app)
      .post('/api/v1/doctors/33333333-3333-4333-8333-333333333331/slots')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        slotDate: '2026-10-30',
        startTime: '10:00:00',
        endTime: '11:00:00',
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('should enforce RBAC: prevent non-admin from accessing admin analytics', async () => {
    const res = await request(app)
      .get('/api/v1/analytics/dashboard')
      .set('Authorization', `Bearer ${patientToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});
