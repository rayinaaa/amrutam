import crypto from 'crypto';
import { db } from '../infrastructure/database';
import { Doctor, AvailabilitySlot, SlotStatus } from '../domain/types';
import { cacheService } from '../infrastructure/cache/cache.service';
import { auditService } from './audit.service';
import { Request } from 'express';

export class DoctorService {
  public async createDoctorProfile(
    userId: string,
    data: {
      specialization: string;
      licenseNumber: string;
      yearsOfExperience: number;
      consultationFee: number;
      bio?: string;
      languages?: string[];
    },
    req?: Request
  ): Promise<Doctor> {
    const existing = await db.findDoctorByUserId(userId);
    if (existing) {
      throw new Error('Doctor profile already exists for this user');
    }

    const doctor: Doctor = {
      id: crypto.randomUUID(),
      user_id: userId,
      specialization: data.specialization,
      license_number: data.licenseNumber,
      years_of_experience: data.yearsOfExperience,
      consultation_fee: data.consultationFee,
      bio: data.bio || null,
      rating: 5.0,
      total_reviews: 0,
      languages: data.languages || ['English', 'Hindi'],
      is_verified: true, // Auto-verified in demo
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const saved = await db.createDoctor(doctor);
    await cacheService.delPattern('doctors:*');

    await auditService.logEvent({
      action: 'DOCTOR_PROFILE_CREATED',
      entityType: 'DOCTOR',
      entityId: saved.id,
      userId,
      req,
    });

    return saved;
  }

  public async getDoctorById(doctorId: string): Promise<Doctor> {
    const cacheKey = `doctor:${doctorId}`;
    const cached = await cacheService.get<Doctor>(cacheKey);
    if (cached) return cached;

    const doctor = await db.findDoctorById(doctorId);
    if (!doctor) throw new Error('Doctor not found');

    await cacheService.set(cacheKey, doctor, 300); // 5 min cache
    return doctor;
  }

  public async searchDoctors(filters: {
    specialization?: string;
    minRating?: number;
    maxFee?: number;
    language?: string;
    page?: number;
    limit?: number;
  }): Promise<{ doctors: Doctor[]; total: number; page: number; limit: number }> {
    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const offset = (page - 1) * limit;

    const cacheKey = `doctors:search:${JSON.stringify(filters)}`;
    const cached = await cacheService.get<{ doctors: Doctor[]; total: number }>(cacheKey);
    if (cached) {
      return { ...cached, page, limit };
    }

    const result = await db.searchDoctors({
      ...filters,
      limit,
      offset,
    });

    await cacheService.set(cacheKey, result, 60); // 1 min cache for search results
    return { ...result, page, limit };
  }

  /**
   * Generates discrete availability slots for a doctor on a specific date
   */
  public async createAvailabilitySlots(
    doctorId: string,
    slotDate: string,
    startTime: string,
    endTime: string,
    slotDurationMinutes: number = 30,
    fee?: number,
    req?: Request
  ): Promise<AvailabilitySlot[]> {
    const doctor = await db.findDoctorById(doctorId);
    if (!doctor) throw new Error('Doctor not found');

    const slotFee = fee || doctor.consultation_fee;
    const createdSlots: AvailabilitySlot[] = [];

    // Parse start and end times (HH:MM:SS)
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);

    let currentMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    while (currentMinutes + slotDurationMinutes <= endMinutes) {
      const sH = Math.floor(currentMinutes / 60).toString().padStart(2, '0');
      const sM = (currentMinutes % 60).toString().padStart(2, '0');
      const nextMinutes = currentMinutes + slotDurationMinutes;
      const eH = Math.floor(nextMinutes / 60).toString().padStart(2, '0');
      const eM = (nextMinutes % 60).toString().padStart(2, '0');

      const slot: AvailabilitySlot = {
        id: crypto.randomUUID(),
        doctor_id: doctorId,
        slot_date: slotDate,
        start_time: `${sH}:${sM}:00`,
        end_time: `${eH}:${eM}:00`,
        status: SlotStatus.AVAILABLE,
        fee: slotFee,
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const saved = await db.createSlot(slot);
      createdSlots.push(saved);
      currentMinutes += slotDurationMinutes;
    }

    // Invalidate slot cache for this doctor and date
    await cacheService.del(`slots:${doctorId}:${slotDate}`);

    await auditService.logEvent({
      action: 'SLOTS_CREATED',
      entityType: 'DOCTOR',
      entityId: doctorId,
      userId: doctor.user_id,
      req,
      details: { count: createdSlots.length, slotDate },
    });

    return createdSlots;
  }

  public async getAvailableSlots(doctorId: string, slotDate: string): Promise<AvailabilitySlot[]> {
    const cacheKey = `slots:${doctorId}:${slotDate}`;
    const cached = await cacheService.get<AvailabilitySlot[]>(cacheKey);
    if (cached) return cached;

    const allSlots = await db.findSlotsByDoctorAndDate(doctorId, slotDate);
    const available = allSlots.filter((s) => s.status === SlotStatus.AVAILABLE);

    await cacheService.set(cacheKey, available, 30); // 30 sec cache for slots
    return available;
  }
}

export const doctorService = new DoctorService();
