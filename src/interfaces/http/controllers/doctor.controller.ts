import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { doctorService } from '../../../application/doctor.service';

export const CreateDoctorProfileSchema = z.object({
  specialization: z.string().min(2),
  licenseNumber: z.string().min(3),
  yearsOfExperience: z.coerce.number().min(0),
  consultationFee: z.coerce.number().positive(),
  bio: z.string().optional(),
  languages: z.array(z.string()).optional(),
});

export const SearchDoctorQuerySchema = z.object({
  specialization: z.string().optional(),
  minRating: z.coerce.number().optional(),
  maxFee: z.coerce.number().optional(),
  language: z.string().optional(),
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
});

export const CreateSlotsSchema = z.object({
  slotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date format must be YYYY-MM-DD'),
  startTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Time format must be HH:MM or HH:MM:SS'),
  endTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Time format must be HH:MM or HH:MM:SS'),
  slotDurationMinutes: z.coerce.number().min(10).max(120).default(30),
  fee: z.coerce.number().positive().optional(),
});

export const GetSlotsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date format must be YYYY-MM-DD'),
});

export class DoctorController {
  public static async createProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await doctorService.createDoctorProfile(req.user!.userId, req.body, req);
      res.status(201).json({
        success: true,
        message: 'Doctor profile created successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async searchDoctors(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await doctorService.searchDoctors(req.query as any);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async getDoctorById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await doctorService.getDoctorById(req.params.id);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async createSlots(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const doctorId = req.params.id;
      const result = await doctorService.createAvailabilitySlots(
        doctorId,
        req.body.slotDate,
        req.body.startTime,
        req.body.endTime,
        req.body.slotDurationMinutes,
        req.body.fee,
        req
      );
      res.status(201).json({
        success: true,
        message: `${result.length} availability slots created`,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async getAvailableSlots(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const doctorId = req.params.id;
      const date = req.query.date as string;
      const result = await doctorService.getAvailableSlots(doctorId, date);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
}
