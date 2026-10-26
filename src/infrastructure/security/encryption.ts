import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { config } from '../../config';
import { TokenPayload } from '../../domain/types';

// AES-256-GCM Encryption for PHI (Protected Health Information)
export class SecurityService {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly IV_LENGTH = 16;
  private static readonly TAG_LENGTH = 16;
  private static readonly KEY = Buffer.from(config.ENCRYPTION_KEY, 'hex');

  /**
   * Encrypts sensitive health/clinical data using AES-256-GCM with authentication tag
   */
  public static encryptPhi(plaintext: string): string {
    if (!plaintext) return plaintext;
    const iv = crypto.randomBytes(this.IV_LENGTH);
    const cipher = crypto.createCipheriv(this.ALGORITHM, this.KEY, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:encryptedContent
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypts AES-256-GCM encrypted health data and verifies authentication tag
   */
  public static decryptPhi(ciphertext: string): string {
    if (!ciphertext || !ciphertext.includes(':')) return ciphertext;
    try {
      const parts = ciphertext.split(':');
      if (parts.length !== 3) return ciphertext;

      const iv = Buffer.from(parts[0], 'hex');
      const authTag = Buffer.from(parts[1], 'hex');
      const encryptedText = parts[2];

      const decipher = crypto.createDecipheriv(this.ALGORITHM, this.KEY, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (err) {
      throw new Error('Decryption failed: corrupted ciphertext or authentication tag mismatch');
    }
  }

  /**
   * Generates a tamper-proof SHA-256 cryptographic hash of a prescription
   */
  public static generatePrescriptionSignature(data: {
    consultationId: string;
    doctorId: string;
    patientId: string;
    diagnosis: string;
    medications: any;
    issuedAt: string;
  }): string {
    const payload = JSON.stringify({
      consultationId: data.consultationId,
      doctorId: data.doctorId,
      patientId: data.patientId,
      diagnosis: data.diagnosis,
      medications: data.medications,
      issuedAt: data.issuedAt,
    });
    return crypto.createHmac('sha256', config.JWT_SECRET).update(payload).digest('hex');
  }

  /**
   * Hashes passwords using bcrypt with cost factor 12
   */
  public static async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(12);
    return bcrypt.hash(password, salt);
  }

  /**
   * Verifies password against bcrypt hash
   */
  public static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Generates standard JWT Access Token
   */
  public static generateAccessToken(payload: TokenPayload): string {
    return jwt.sign(payload, config.JWT_SECRET, {
      expiresIn: config.JWT_EXPIRES_IN as any,
      issuer: config.APP_NAME,
    });
  }

  /**
   * Generates long-lived JWT Refresh Token
   */
  public static generateRefreshToken(payload: { userId: string }): string {
    return jwt.sign(payload, config.JWT_REFRESH_SECRET, {
      expiresIn: config.JWT_REFRESH_EXPIRES_IN as any,
      issuer: config.APP_NAME,
    });
  }

  /**
   * Verifies and decodes JWT Access Token
   */
  public static verifyAccessToken(token: string): TokenPayload {
    return jwt.verify(token, config.JWT_SECRET, {
      issuer: config.APP_NAME,
    }) as TokenPayload;
  }

  /**
   * Verifies and decodes JWT Refresh Token
   */
  public static verifyRefreshToken(token: string): { userId: string } {
    return jwt.verify(token, config.JWT_REFRESH_SECRET, {
      issuer: config.APP_NAME,
    }) as { userId: string };
  }

  /**
   * Generates RFC 6238 TOTP MFA Secret & Authenticator QR Code
   */
  public static async generateMfaSecret(email: string): Promise<{ secret: string; otpauthUrl: string; qrCodeDataUrl: string }> {
    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(email, 'Amrutam Telemedicine', secret);
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);
    return { secret, otpauthUrl, qrCodeDataUrl };
  }

  /**
   * Validates 6-digit TOTP token against user secret with 1-step window tolerance
   */
  public static verifyMfaToken(token: string, secret: string): boolean {
    authenticator.options = { window: 1 };
    return authenticator.check(token, secret);
  }
}
