import crypto from 'crypto';
import { db } from '../infrastructure/database';
import { SecurityService } from '../infrastructure/security/encryption';
import { User, Profile, UserRole, TokenPayload } from '../domain/types';
import { auditService } from './audit.service';
import { Request } from 'express';

export class AuthService {
  public async register(
    data: {
      email: string;
      password: string;
      role?: UserRole;
      firstName: string;
      lastName: string;
      phone?: string;
      dateOfBirth?: string;
      gender?: string;
      bloodGroup?: string;
      emergencyContact?: string;
    },
    req?: Request
  ): Promise<{ user: Omit<User, 'password_hash' | 'mfa_secret'>; profile: Profile; token: string }> {
    const existing = await db.findUserByEmail(data.email);
    if (existing) {
      throw new Error('User with this email already exists');
    }

    const passwordHash = await SecurityService.hashPassword(data.password);
    const userId = crypto.randomUUID();

    const newUser: User = {
      id: userId,
      email: data.email.toLowerCase().trim(),
      password_hash: passwordHash,
      role: data.role || UserRole.PATIENT,
      is_active: true,
      mfa_enabled: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const savedUser = await db.createUser(newUser);

    const profile: Profile = {
      id: crypto.randomUUID(),
      user_id: userId,
      first_name: data.firstName,
      last_name: data.lastName,
      phone: data.phone || null,
      date_of_birth: data.dateOfBirth || null,
      gender: data.gender || null,
      blood_group: data.bloodGroup || null,
      emergency_contact: data.emergencyContact || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const savedProfile = await db.createProfile(profile);

    const tokenPayload: TokenPayload = {
      userId: savedUser.id,
      email: savedUser.email,
      role: savedUser.role,
    };
    const token = SecurityService.generateAccessToken(tokenPayload);

    await auditService.logEvent({
      action: 'USER_REGISTERED',
      entityType: 'USER',
      entityId: savedUser.id,
      userId: savedUser.id,
      req,
      details: { role: savedUser.role, email: savedUser.email },
    });

    const { password_hash, mfa_secret, ...safeUser } = savedUser;
    return { user: safeUser, profile: savedProfile, token };
  }

  public async login(
    email: string,
    password: string,
    req?: Request
  ): Promise<{
    user: Omit<User, 'password_hash' | 'mfa_secret'>;
    token?: string;
    refreshToken?: string;
    mfaRequired?: boolean;
    tempMfaToken?: string;
  }> {
    const user = await db.findUserByEmail(email);
    if (!user || !user.is_active) {
      throw new Error('Invalid email or password');
    }

    const isValid = await SecurityService.verifyPassword(password, user.password_hash);
    if (!isValid) {
      await auditService.logEvent({
        action: 'LOGIN_FAILED',
        entityType: 'USER',
        entityId: user.id,
        userId: user.id,
        req,
        details: { reason: 'Incorrect password' },
      });
      throw new Error('Invalid email or password');
    }

    // Check if MFA is required
    if (user.mfa_enabled && user.mfa_secret) {
      const tempMfaToken = SecurityService.generateAccessToken({
        userId: user.id,
        email: user.email,
        role: user.role,
        mfaPending: true,
      });

      return {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          is_active: user.is_active,
          mfa_enabled: true,
          created_at: user.created_at,
          updated_at: user.updated_at,
        },
        mfaRequired: true,
        tempMfaToken,
      };
    }

    const tokenPayload: TokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };
    const token = SecurityService.generateAccessToken(tokenPayload);
    const refreshToken = SecurityService.generateRefreshToken({ userId: user.id });

    await auditService.logEvent({
      action: 'USER_LOGIN_SUCCESS',
      entityType: 'USER',
      entityId: user.id,
      userId: user.id,
      req,
      details: { role: user.role },
    });

    const { password_hash, mfa_secret, ...safeUser } = user;
    return { user: safeUser, token, refreshToken };
  }

  public async setupMfa(userId: string) {
    const user = await db.findUserById(userId);
    if (!user) throw new Error('User not found');

    const { secret, otpauthUrl, qrCodeDataUrl } = await SecurityService.generateMfaSecret(user.email);

    // Save secret temporarily until confirmed
    await db.updateUser(userId, { mfa_secret: secret });

    return { secret, otpauthUrl, qrCodeDataUrl };
  }

  public async verifyAndEnableMfa(userId: string, token: string, req?: Request) {
    const user = await db.findUserById(userId);
    if (!user || !user.mfa_secret) throw new Error('MFA setup not initiated');

    const isValid = SecurityService.verifyMfaToken(token, user.mfa_secret);
    if (!isValid) throw new Error('Invalid MFA token code');

    await db.updateUser(userId, { mfa_enabled: true });

    await auditService.logEvent({
      action: 'MFA_ENABLED',
      entityType: 'USER',
      entityId: userId,
      userId,
      req,
    });

    return { success: true, message: 'Two-factor authentication successfully enabled' };
  }

  public async verifyMfaLogin(tempToken: string, token: string, req?: Request) {
    const decoded = SecurityService.verifyAccessToken(tempToken);
    if (!decoded.mfaPending) throw new Error('Invalid MFA session token');

    const user = await db.findUserById(decoded.userId);
    if (!user || !user.mfa_secret) throw new Error('MFA configuration invalid');

    const isValid = SecurityService.verifyMfaToken(token, user.mfa_secret);
    if (!isValid) throw new Error('Invalid 6-digit MFA code');

    const tokenPayload: TokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };
    const accessToken = SecurityService.generateAccessToken(tokenPayload);
    const refreshToken = SecurityService.generateRefreshToken({ userId: user.id });

    await auditService.logEvent({
      action: 'MFA_LOGIN_SUCCESS',
      entityType: 'USER',
      entityId: user.id,
      userId: user.id,
      req,
    });

    const { password_hash, mfa_secret, ...safeUser } = user;
    return { user: safeUser, token: accessToken, refreshToken };
  }

  public async refreshToken(refreshToken: string) {
    const decoded = SecurityService.verifyRefreshToken(refreshToken);
    const user = await db.findUserById(decoded.userId);
    if (!user || !user.is_active) throw new Error('Invalid refresh token');

    const tokenPayload: TokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };
    const newAccessToken = SecurityService.generateAccessToken(tokenPayload);
    return { token: newAccessToken };
  }

  public async getProfile(userId: string) {
    const user = await db.findUserById(userId);
    if (!user) throw new Error('User not found');
    const profile = await db.findProfileByUserId(userId);
    const { password_hash, mfa_secret, ...safeUser } = user;
    return { user: safeUser, profile };
  }
}

export const authService = new AuthService();
