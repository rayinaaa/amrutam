import { Router } from 'express';
import {
  ConsultationController,
  UpdateConsultationStatusSchema,
} from '../controllers/consultation.controller';
import { validateRequest } from '../middleware/validate.middleware';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', ConsultationController.getMyConsultations);
router.get('/:id', ConsultationController.getById);
router.patch(
  '/:id/status',
  validateRequest({ body: UpdateConsultationStatusSchema }),
  ConsultationController.updateStatus
);

export const consultationRoutes = router;
