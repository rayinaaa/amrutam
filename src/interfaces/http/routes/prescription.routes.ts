import { Router } from 'express';
import {
  PrescriptionController,
  CreatePrescriptionSchema,
} from '../controllers/prescription.controller';
import { validateRequest } from '../middleware/validate.middleware';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/rbac.middleware';
import { UserRole } from '../../../domain/types';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  authorize(UserRole.DOCTOR, UserRole.ADMIN),
  validateRequest({ body: CreatePrescriptionSchema }),
  PrescriptionController.create
);

router.get('/consultation/:consultationId', PrescriptionController.getByConsultation);

export const prescriptionRoutes = router;
