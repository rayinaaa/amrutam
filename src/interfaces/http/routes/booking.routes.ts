import { Router } from 'express';
import {
  BookingController,
  BookSlotSchema,
  CancelBookingSchema,
} from '../controllers/booking.controller';
import { validateRequest } from '../middleware/validate.middleware';
import { authenticate } from '../middleware/auth.middleware';
import { idempotency } from '../middleware/idempotency.middleware';

const router = Router();

router.use(authenticate);

// Book appointment with Idempotency Key support
router.post(
  '/',
  idempotency,
  validateRequest({ body: BookSlotSchema }),
  BookingController.bookSlot
);

router.post(
  '/:id/cancel',
  validateRequest({ body: CancelBookingSchema }),
  BookingController.cancelBooking
);

export const bookingRoutes = router;
