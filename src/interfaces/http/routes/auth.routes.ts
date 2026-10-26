import { Router } from 'express';
import {
  AuthController,
  RegisterSchema,
  LoginSchema,
  MfaVerifySchema,
  MfaLoginSchema,
  RefreshTokenSchema,
} from '../controllers/auth.controller';
import { validateRequest } from '../middleware/validate.middleware';
import { authenticate } from '../middleware/auth.middleware';
import { rateLimiter } from '../middleware/rate-limiter.middleware';

const router = Router();

// Public routes with stricter rate limit for brute-force prevention
router.post('/register', rateLimiter(60000, 20), validateRequest({ body: RegisterSchema }), AuthController.register);
router.post('/login', rateLimiter(60000, 20), validateRequest({ body: LoginSchema }), AuthController.login);
router.post('/mfa/login', rateLimiter(60000, 10), validateRequest({ body: MfaLoginSchema }), AuthController.verifyMfaLogin);
router.post('/refresh', validateRequest({ body: RefreshTokenSchema }), AuthController.refreshToken);

// Protected routes
router.use(authenticate);
router.get('/profile', AuthController.getProfile);
router.post('/mfa/setup', AuthController.setupMfa);
router.post('/mfa/verify', validateRequest({ body: MfaVerifySchema }), AuthController.verifyMfa);

export const authRoutes = router;
