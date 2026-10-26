import { SecurityService } from '../../src/infrastructure/security/encryption';
import { UserRole } from '../../src/domain/types';

describe('SecurityService Unit Tests', () => {
  describe('AES-256-GCM Encryption for PHI (Protected Health Information)', () => {
    it('should encrypt and successfully decrypt sensitive clinical notes', () => {
      const sensitiveNotes = 'Patient exhibits severe Pitta aggravation, insomnia, and liver enzyme elevation.';
      const encrypted = SecurityService.encryptPhi(sensitiveNotes);

      expect(encrypted).toBeDefined();
      expect(encrypted).not.toEqual(sensitiveNotes);
      expect(encrypted.split(':')).toHaveLength(3); // iv : authTag : ciphertext

      const decrypted = SecurityService.decryptPhi(encrypted);
      expect(decrypted).toEqual(sensitiveNotes);
    });

    it('should fail decryption if auth tag or ciphertext is tampered with', () => {
      const sensitiveNotes = 'Confidential patient biopsy results.';
      const encrypted = SecurityService.encryptPhi(sensitiveNotes);
      const parts = encrypted.split(':');
      // Tamper with ciphertext
      const tampered = `${parts[0]}:${parts[1]}:${parts[2].substring(0, parts[2].length - 2)}ff`;

      expect(() => SecurityService.decryptPhi(tampered)).toThrow();
    });
  });

  describe('Prescription Cryptographic Tamper-Proofing', () => {
    it('should generate deterministic HMAC-SHA256 signature for prescription', () => {
      const data = {
        consultationId: 'c123',
        doctorId: 'd456',
        patientId: 'p789',
        diagnosis: 'Ayurvedic Pitta dosha',
        medications: [{ name: 'Ashwagandha', dosage: '500mg', frequency: 'daily', duration: '30d' }],
        issuedAt: '2026-10-26T12:00:00.000Z',
      };

      const sig1 = SecurityService.generatePrescriptionSignature(data);
      const sig2 = SecurityService.generatePrescriptionSignature(data);

      expect(sig1).toHaveLength(64);
      expect(sig1).toEqual(sig2);

      // Verify that any tampering changes the signature
      const tamperedData = {
        ...data,
        medications: [{ name: 'Ashwagandha', dosage: '1000mg', frequency: 'daily', duration: '30d' }],
      };
      const tamperedSig = SecurityService.generatePrescriptionSignature(tamperedData);
      expect(tamperedSig).not.toEqual(sig1);
    });
  });

  describe('Password Hashing & Verification (Bcrypt)', () => {
    it('should hash passwords and verify matching passwords', async () => {
      const password = 'SuperSecureTelemedPassword2026!';
      const hash = await SecurityService.hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash).not.toEqual(password);

      const isMatch = await SecurityService.verifyPassword(password, hash);
      expect(isMatch).toBe(true);

      const isWrongMatch = await SecurityService.verifyPassword('WrongPassword!', hash);
      expect(isWrongMatch).toBe(false);
    });
  });

  describe('MFA (RFC 6238 TOTP)', () => {
    it('should generate MFA secret and verify valid token', async () => {
      const { secret, otpauthUrl, qrCodeDataUrl } = await SecurityService.generateMfaSecret('doctor@amrutam.co.in');

      expect(secret).toBeDefined();
      expect(otpauthUrl).toContain('otpauth://totp/');
      expect(qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);

      // Generate current token using authenticator
      const { authenticator } = require('otplib');
      const currentToken = authenticator.generate(secret);

      const isValid = SecurityService.verifyMfaToken(currentToken, secret);
      expect(isValid).toBe(true);

      const isInvalid = SecurityService.verifyMfaToken('000000', secret);
      expect(isInvalid).toBe(false);
    });
  });

  describe('JWT Access & Refresh Tokens', () => {
    it('should generate and verify JWT access and refresh tokens', () => {
      const payload = {
        userId: 'u123',
        email: 'patient@example.com',
        role: UserRole.PATIENT,
      };

      const token = SecurityService.generateAccessToken(payload);
      const verified = SecurityService.verifyAccessToken(token);

      expect(verified.userId).toEqual(payload.userId);
      expect(verified.email).toEqual(payload.email);
      expect(verified.role).toEqual(payload.role);

      const refreshToken = SecurityService.generateRefreshToken({ userId: 'u123' });
      const verifiedRefresh = SecurityService.verifyRefreshToken(refreshToken);
      expect(verifiedRefresh.userId).toEqual('u123');
    });
  });
});
