import { Router } from 'express';
import {
  DoctorController,
  CreateDoctorProfileSchema,
  SearchDoctorQuerySchema,
  CreateSlotsSchema,
  GetSlotsQuerySchema,
} from '../controllers/doctor.controller';
import { validateRequest } from '../middleware/validate.middleware';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/rbac.middleware';
import { UserRole } from '../../../domain/types';

const router = Router();

// Public doctor search and slot browsing
router.get('/', validateRequest({ query: SearchDoctorQuerySchema }), DoctorController.searchDoctors);
router.get('/:id', DoctorController.getDoctorById);
router.get('/:id/slots', validateRequest({ query: GetSlotsQuerySchema }), DoctorController.getAvailableSlots);

// Protected doctor routes
router.use(authenticate);
router.post(
  '/',
  authorize(UserRole.DOCTOR, UserRole.ADMIN),
  validateRequest({ body: CreateDoctorProfileSchema }),
  DoctorController.createProfile
);

router.post(
  '/:id/slots',
  authorize(UserRole.DOCTOR, UserRole.ADMIN),
  validateRequest({ body: CreateSlotsSchema }),
  DoctorController.createSlots
);

export const doctorRoutes = router;
