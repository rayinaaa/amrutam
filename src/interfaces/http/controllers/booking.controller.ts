import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { bookingService } from '../../../application/booking.service';

export const BookSlotSchema = z.object({
  slotId: z.string().uuid(),
  chiefComplaint: z.string().optional(),
  symptoms: z.array(z.string()).optional(),
});

export const CancelBookingSchema = z.object({
  reason: z.string().min(5, 'Cancellation reason must be at least 5 characters long'),
});

export class BookingController {
  public static async bookSlot(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const patientId = req.user!.userId;
      const idempotencyKey = (req.headers['idempotency-key'] || req.headers['x-idempotency-key']) as string | undefined;

      const result = await bookingService.bookSlot(
        patientId,
        req.body.slotId,
        {
          chiefComplaint: req.body.chiefComplaint,
          symptoms: req.body.symptoms,
          idempotencyKey,
        },
        req
      );

      res.status(201).json({
        success: true,
        message: 'Appointment booked successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async cancelBooking(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const consultationId = req.params.id;
      const userId = req.user!.userId;
      const result = await bookingService.cancelBooking(consultationId, userId, req.body.reason, req);

      res.status(200).json({
        success: true,
        message: 'Consultation cancelled and refund initiated successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
}
