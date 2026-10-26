import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prescriptionService } from '../../../application/prescription.service';
import { UserRole } from '../../../domain/types';

export const MedicationItemSchema = z.object({
  name: z.string().min(1),
  dosage: z.string().min(1),
  frequency: z.string().min(1),
  duration: z.string().min(1),
  instructions: z.string().optional(),
});

export const CreatePrescriptionSchema = z.object({
  consultationId: z.string().uuid(),
  diagnosis: z.string().min(3),
  medications: z.array(MedicationItemSchema).min(1, 'At least one medication is required'),
  dietaryAdvice: z.string().optional(),
  followUpDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export class PrescriptionController {
  public static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await prescriptionService.createPrescription(req.user!.userId, req.body, req);
      res.status(201).json({
        success: true,
        message: 'Prescription issued with digital signature hash',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async getByConsultation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await prescriptionService.getPrescriptionByConsultation(
        req.params.consultationId,
        { userId: req.user!.userId, role: req.user!.role }
      );
      const isSignatureValid = await prescriptionService.verifyPrescriptionIntegrity(result);

      res.status(200).json({
        success: true,
        data: {
          ...result,
          signatureVerification: {
            isValid: isSignatureValid,
            algorithm: 'HMAC-SHA256',
            status: isSignatureValid ? 'VERIFIED_AUTHENTIC' : 'TAMPERED_INVALID',
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }
}
