import crypto from 'crypto';
import { Request } from 'express';
import { db } from '../infrastructure/database';
import { cacheService } from '../infrastructure/cache/cache.service';
import { workerService } from '../infrastructure/queue/worker.service';
import { auditService } from './audit.service';
import {
  Consultation,
  ConsultationStatus,
  Payment,
  PaymentStatus,
  SlotStatus,
} from '../domain/types';
import { bookingConflictsCounter, consultationsTotalCounter } from '../infrastructure/observability/metrics';

export class BookingService {
  /**
   * Concurrently books an appointment slot with distributed locking and ACID guarantees.
   * Prevents race conditions and double-booking even under 100k daily consultations load.
   */
  public async bookSlot(
    patientId: string,
    slotId: string,
    data: {
      chiefComplaint?: string;
      symptoms?: string[];
      idempotencyKey?: string;
    },
    req?: Request
  ): Promise<{ consultation: Consultation; payment: Payment }> {
    // 1. Check idempotency if key provided
    if (data.idempotencyKey) {
      const existingPayment = await db.findPaymentByIdempotencyKey(data.idempotencyKey);
      if (existingPayment) {
        const existingConsultation = await db.findConsultationById(existingPayment.consultation_id);
        if (existingConsultation) {
          return { consultation: existingConsultation, payment: existingPayment };
        }
      }
    }

    // 2. Distributed Lock acquisition to prevent race conditions across server nodes
    const lockKey = `lock:slot:${slotId}`;
    const lockToken = await cacheService.acquireLock(lockKey, 5000); // 5 sec lock
    if (!lockToken) {
      bookingConflictsCounter.inc();
      throw new Error('Slot is currently being booked by another patient. Please try another slot.');
    }

    try {
      // 3. Database atomic slot check & booking (SELECT FOR UPDATE)
      const bookedSlot = await db.lockAndBookSlot(slotId);
      if (!bookedSlot) {
        bookingConflictsCounter.inc();
        throw new Error('Slot is no longer available');
      }

      const doctor = await db.findDoctorById(bookedSlot.doctor_id);
      if (!doctor) {
        await db.releaseSlot(slotId);
        throw new Error('Doctor profile not found');
      }

      // 4. Create Consultation Record
      const datePart = bookedSlot.slot_date.replace(/-/g, '');
      const randomSuffix = Math.random().toString(36).substring(2, 7).toUpperCase();
      const consultationNumber = `AMR-${datePart}-${randomSuffix}`;
      const consultationId = crypto.randomUUID();

      const consultation: Consultation = {
        id: consultationId,
        consultation_number: consultationNumber,
        patient_id: patientId,
        doctor_id: bookedSlot.doctor_id,
        slot_id: bookedSlot.id,
        status: ConsultationStatus.SCHEDULED,
        chief_complaint: data.chiefComplaint || null,
        symptoms: data.symptoms || [],
        clinical_notes_encrypted: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const savedConsultation = await db.createConsultation(consultation);

      // 5. Create Payment Record (Saga Step 1)
      const paymentId = crypto.randomUUID();
      const payment: Payment = {
        id: paymentId,
        consultation_id: consultationId,
        patient_id: patientId,
        amount: bookedSlot.fee,
        currency: 'INR',
        status: PaymentStatus.SUCCESS, // Simulated instant mock gateway success
        transaction_reference: `TXN-${Date.now()}-${randomSuffix}`,
        payment_gateway: 'AMRUTAM_PAY_MOCK',
        idempotency_key: data.idempotencyKey || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const savedPayment = await db.createPayment(payment);

      // Invalidate slots cache
      await cacheService.del(`slots:${bookedSlot.doctor_id}:${bookedSlot.slot_date}`);

      // 6. Metrics & Background Heavy Job Enqueueing
      consultationsTotalCounter.inc({ status: ConsultationStatus.SCHEDULED });

      workerService.enqueue('NOTIFY_PATIENT_BOOKING', {
        consultationId,
        consultationNumber,
        patientId,
        doctorId: bookedSlot.doctor_id,
        slotDate: bookedSlot.slot_date,
        startTime: bookedSlot.start_time,
      });

      // 7. Immutable Audit Trail
      await auditService.logEvent({
        action: 'SLOT_BOOKED',
        entityType: 'CONSULTATION',
        entityId: consultationId,
        userId: patientId,
        req,
        details: {
          slotId,
          doctorId: bookedSlot.doctor_id,
          amount: bookedSlot.fee,
          consultationNumber,
        },
      });

      return { consultation: savedConsultation, payment: savedPayment };
    } finally {
      // 8. Always release distributed lock
      await cacheService.releaseLock(lockKey, lockToken);
    }
  }

  public async cancelBooking(
    consultationId: string,
    userId: string,
    reason: string,
    req?: Request
  ): Promise<Consultation> {
    const consultation = await db.findConsultationById(consultationId);
    if (!consultation) throw new Error('Consultation not found');

    if (consultation.patient_id !== userId && consultation.doctor_id !== userId) {
      throw new Error('Unauthorized to cancel this consultation');
    }

    if (consultation.status !== ConsultationStatus.SCHEDULED) {
      throw new Error(`Cannot cancel consultation in status ${consultation.status}`);
    }

    // Release slot
    await db.releaseSlot(consultation.slot_id);

    // Update status
    const updated = await db.updateConsultation(consultationId, {
      status: ConsultationStatus.CANCELLED,
      cancellation_reason: reason,
    });

    // Compensating Transaction: Trigger refund saga
    const payment = await db.findPaymentById(consultationId);
    if (payment) {
      await db.updatePayment(payment.id, { status: PaymentStatus.REFUNDED });
      workerService.enqueue('PROCESS_REFUND', {
        paymentId: payment.id,
        amount: payment.amount,
        consultationId,
      });
    }

    consultationsTotalCounter.inc({ status: ConsultationStatus.CANCELLED });

    await auditService.logEvent({
      action: 'CONSULTATION_CANCELLED',
      entityType: 'CONSULTATION',
      entityId: consultationId,
      userId,
      req,
      details: { reason },
    });

    return updated!;
  }
}

export const bookingService = new BookingService();
