import { Router } from 'express';
import { AnalyticsController } from '../controllers/analytics.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/rbac.middleware';
import { UserRole } from '../../../domain/types';

const router = Router();

router.use(authenticate);
router.use(authorize(UserRole.ADMIN));

router.get('/dashboard', AnalyticsController.getDashboard);
router.get('/audit-logs', AnalyticsController.getAuditLogs);

export const analyticsRoutes = router;
