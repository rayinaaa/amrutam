import crypto from 'crypto';
import { Request } from 'express';
import { db } from '../infrastructure/database';
import { SecurityService } from '../infrastructure/security/encryption';
import { workerService } from '../infrastructure/queue/worker.service';
import { auditService } from './audit.service';
import {
  Prescription,
  MedicationItem,
  ConsultationStatus,
  UserRole,
} from '../domain/types';

export class PrescriptionService {
  public async createPrescription(
    userId: string,
    data: {
      consultationId: string;
      diagnosis: string;
      medications: MedicationItem[];
      dietaryAdvice?: string;
      followUpDate?: string;
    },
    req?: Request
  ): Promise<Prescription> {
    const consultation = await db.findConsultationById(data.consultationId);
    if (!consultation) throw new Error('Consultation not found');

    const doctor = await db.findDoctorByUserId(userId);
    if (!doctor || doctor.id !== consultation.doctor_id) {
      throw new Error('Only the assigned doctor can issue a prescription for this consultation');
    }

    if (
      consultation.status !== ConsultationStatus.IN_PROGRESS &&
      consultation.status !== ConsultationStatus.COMPLETED
    ) {
      throw new Error('Prescription can only be issued during or after consultation');
    }

    const existing = await db.findPrescriptionByConsultationId(data.consultationId);
    if (existing) {
      throw new Error('Prescription has already been generated for this consultation');
    }

    const issuedAt = new Date().toISOString();

    // Generate cryptographic tamper-proof SHA-256 digital signature
    const digitalSignatureHash = SecurityService.generatePrescriptionSignature({
      consultationId: data.consultationId,
      doctorId: doctor.id,
      patientId: consultation.patient_id,
      diagnosis: data.diagnosis,
      medications: data.medications,
      issuedAt,
    });

    const prescription: Prescription = {
      id: crypto.randomUUID(),
      consultation_id: data.consultationId,
      doctor_id: doctor.id,
      patient_id: consultation.patient_id,
      diagnosis: data.diagnosis,
      medications: data.medications,
      dietary_advice: data.dietaryAdvice || null,
      follow_up_date: data.followUpDate || null,
      digital_signature_hash: digitalSignatureHash,
      issued_at: issuedAt,
      created_at: issuedAt,
      updated_at: issuedAt,
    };

    const saved = await db.createPrescription(prescription);

    // If consultation was IN_PROGRESS, complete it
    if (consultation.status === ConsultationStatus.IN_PROGRESS) {
      await db.updateConsultation(consultation.id, {
        status: ConsultationStatus.COMPLETED,
        end_time: new Date().toISOString(),
      });
    }

    // Heavy background job: generate PDF and dispatch notification
    workerService.enqueue('GENERATE_PRESCRIPTION_PDF', {
      prescriptionId: saved.id,
      consultationId: data.consultationId,
      patientId: consultation.patient_id,
    });

    await auditService.logEvent({
      action: 'PRESCRIPTION_ISSUED',
      entityType: 'PRESCRIPTION',
      entityId: saved.id,
      userId,
      req,
      details: {
        consultationId: data.consultationId,
        digitalSignatureHash,
        medicationCount: data.medications.length,
      },
    });

    return saved;
  }

  public async getPrescriptionByConsultation(
    consultationId: string,
    currentUser: { userId: string; role: UserRole }
  ): Promise<Prescription> {
    const p = await db.findPrescriptionByConsultationId(consultationId);
    if (!p) throw new Error('Prescription not found');

    const consultation = await db.findConsultationById(consultationId);
    if (!consultation) throw new Error('Consultation not found');

    const isPatient = consultation.patient_id === currentUser.userId;
    const isDoctor = consultation.doctor?.user_id === currentUser.userId;
    const isAdmin = currentUser.role === UserRole.ADMIN;

    if (!isPatient && !isDoctor && !isAdmin) {
      throw new Error('Access denied: You cannot view this prescription');
    }

    return p;
  }

  public async verifyPrescriptionIntegrity(prescription: Prescription): Promise<boolean> {
    const expectedHash = SecurityService.generatePrescriptionSignature({
      consultationId: prescription.consultation_id,
      doctorId: prescription.doctor_id,
      patientId: prescription.patient_id,
      diagnosis: prescription.diagnosis,
      medications: prescription.medications,
      issuedAt: prescription.issued_at,
    });

    return expectedHash === prescription.digital_signature_hash;
  }
}

export const prescriptionService = new PrescriptionService();
