import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authService } from '../../../application/auth.service';
import { UserRole } from '../../../domain/types';

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  role: z.nativeEnum(UserRole).optional(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  dateOfBirth: z.string().optional(),
  gender: z.string().optional(),
  bloodGroup: z.string().optional(),
  emergencyContact: z.string().optional(),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const MfaVerifySchema = z.object({
  token: z.string().length(6, 'MFA code must be exactly 6 digits'),
});

export const MfaLoginSchema = z.object({
  tempToken: z.string().min(1),
  token: z.string().length(6, 'MFA code must be exactly 6 digits'),
});

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export class AuthController {
  public static async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.register(req.body, req);
      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.login(req.body.email, req.body.password, req);
      res.status(200).json({
        success: true,
        message: result.mfaRequired ? 'MFA code verification required' : 'Login successful',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async setupMfa(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.setupMfa(req.user!.userId);
      res.status(200).json({
        success: true,
        message: 'MFA secret generated. Scan QR code in authenticator app.',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async verifyMfa(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.verifyAndEnableMfa(req.user!.userId, req.body.token, req);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async verifyMfaLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.verifyMfaLogin(req.body.tempToken, req.body.token, req);
      res.status(200).json({
        success: true,
        message: 'MFA verified, login successful',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async refreshToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.refreshToken(req.body.refreshToken);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.getProfile(req.user!.userId);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
}
