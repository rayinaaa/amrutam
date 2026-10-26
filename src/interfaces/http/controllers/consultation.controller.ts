import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { consultationService } from '../../../application/consultation.service';
import { ConsultationStatus, UserRole } from '../../../domain/types';

export const UpdateConsultationStatusSchema = z.object({
  status: z.nativeEnum(ConsultationStatus),
  clinicalNotes: z.string().optional(),
});

export class ConsultationController {
  public static async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await consultationService.getConsultationById(
        req.params.id,
        { userId: req.user!.userId, role: req.user!.role },
        req
      );
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async getMyConsultations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      let result;
      if (req.user!.role === UserRole.DOCTOR) {
        result = await consultationService.getDoctorConsultations(req.user!.userId);
      } else {
        result = await consultationService.getPatientConsultations(req.user!.userId);
      }
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await consultationService.updateConsultationStatus(
        req.params.id,
        req.body.status,
        { userId: req.user!.userId, role: req.user!.role },
        req.body.clinicalNotes,
        req
      );
      res.status(200).json({
        success: true,
        message: 'Consultation status updated successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
}
