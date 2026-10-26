import { Request } from 'express';
import { db } from '../infrastructure/database';
import { SecurityService } from '../infrastructure/security/encryption';
import { Consultation, ConsultationStatus, UserRole } from '../domain/types';
import { auditService } from './audit.service';
import { activeConsultationsGauge, consultationsTotalCounter } from '../infrastructure/observability/metrics';

export class ConsultationService {
  public async getConsultationById(
    id: string,
    currentUser: { userId: string; role: UserRole },
    req?: Request
  ): Promise<Consultation> {
    const consultation = await db.findConsultationById(id);
    if (!consultation) throw new Error('Consultation not found');

    // Granular RBAC Check
    const isPatient = consultation.patient_id === currentUser.userId;
    const isDoctor = consultation.doctor?.user_id === currentUser.userId;
    const isAdmin = currentUser.role === UserRole.ADMIN;

    if (!isPatient && !isDoctor && !isAdmin) {
      throw new Error('Access denied: You do not have permission to view this medical record');
    }

    // Decrypt clinical notes if present and caller is authorized
    if (consultation.clinical_notes_encrypted) {
      consultation.clinical_notes_encrypted = SecurityService.decryptPhi(consultation.clinical_notes_encrypted);
    }

    // Audit PHI access for compliance
    await auditService.logEvent({
      action: 'VIEW_MEDICAL_RECORD',
      entityType: 'CONSULTATION',
      entityId: id,
      userId: currentUser.userId,
      req,
      details: { role: currentUser.role },
    });

    return consultation;
  }

  public async getPatientConsultations(patientId: string): Promise<Consultation[]> {
    return db.findConsultationsByPatient(patientId);
  }

  public async getDoctorConsultations(doctorId: string): Promise<Consultation[]> {
    return db.findConsultationsByDoctor(doctorId);
  }

  public async updateConsultationStatus(
    id: string,
    newStatus: ConsultationStatus,
    currentUser: { userId: string; role: UserRole },
    clinicalNotes?: string,
    req?: Request
  ): Promise<Consultation> {
    const consultation = await db.findConsultationById(id);
    if (!consultation) throw new Error('Consultation not found');

    const isDoctor = consultation.doctor?.user_id === currentUser.userId;
    const isAdmin = currentUser.role === UserRole.ADMIN;

    if (!isDoctor && !isAdmin) {
      throw new Error('Only the assigned doctor or an admin can update consultation progress');
    }

    const updates: Partial<Consultation> = {
      status: newStatus,
    };

    if (newStatus === ConsultationStatus.IN_PROGRESS && !consultation.start_time) {
      updates.start_time = new Date().toISOString();
      activeConsultationsGauge.inc();
    }

    if (newStatus === ConsultationStatus.COMPLETED) {
      updates.end_time = new Date().toISOString();
      if (consultation.status === ConsultationStatus.IN_PROGRESS) {
        activeConsultationsGauge.dec();
      }
    }

    if (clinicalNotes) {
      // Encrypt PHI using AES-256-GCM before writing to database
      updates.clinical_notes_encrypted = SecurityService.encryptPhi(clinicalNotes);
    }

    const updated = await db.updateConsultation(id, updates);
    consultationsTotalCounter.inc({ status: newStatus });

    await auditService.logEvent({
      action: `CONSULTATION_STATUS_${newStatus}`,
      entityType: 'CONSULTATION',
      entityId: id,
      userId: currentUser.userId,
      req,
      details: { previousStatus: consultation.status, newStatus },
    });

    return updated!;
  }
}

export const consultationService = new ConsultationService();
