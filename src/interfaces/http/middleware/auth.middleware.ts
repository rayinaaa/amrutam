import { Request, Response, NextFunction } from 'express';
import { SecurityService } from '../../../infrastructure/security/encryption';
import { TokenPayload, UserRole } from '../../../domain/types';

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
      requestId?: string;
      traceId?: string;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication token required in format "Bearer <token>"',
      },
    });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = SecurityService.verifyAccessToken(token);
    if (payload.mfaPending) {
      res.status(403).json({
        success: false,
        error: {
          code: 'MFA_REQUIRED',
          message: 'Two-factor authentication code required to complete login',
        },
      });
      return;
    }

    req.user = payload;
    next();
  } catch (err: any) {
    res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'Token is invalid or has expired',
      },
    });
  }
}
