import crypto from 'crypto';
import { Request } from 'express';
import { db } from '../infrastructure/database';
import { Payment, PaymentStatus } from '../domain/types';
import { paymentsTotalCounter } from '../infrastructure/observability/metrics';
import { auditService } from './audit.service';
import { workerService } from '../infrastructure/queue/worker.service';

export class PaymentService {
  /**
   * Processes a payment with idempotency guarantee
   */
  public async processPayment(
    data: {
      consultationId: string;
      patientId: string;
      amount: number;
      idempotencyKey?: string;
    },
    req?: Request
  ): Promise<Payment> {
    if (data.idempotencyKey) {
      const existing = await db.findPaymentByIdempotencyKey(data.idempotencyKey);
      if (existing) {
        return existing;
      }
    }

    const payment: Payment = {
      id: crypto.randomUUID(),
      consultation_id: data.consultationId,
      patient_id: data.patientId,
      amount: data.amount,
      currency: 'INR',
      status: PaymentStatus.SUCCESS,
      transaction_reference: `TXN-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
      payment_gateway: 'MOCK_RAZORPAY',
      idempotency_key: data.idempotencyKey || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const saved = await db.createPayment(payment);
    paymentsTotalCounter.inc({ status: PaymentStatus.SUCCESS });

    await auditService.logEvent({
      action: 'PAYMENT_PROCESSED',
      entityType: 'PAYMENT',
      entityId: saved.id,
      userId: data.patientId,
      req,
      details: { amount: data.amount, txRef: saved.transaction_reference },
    });

    return saved;
  }

  public async refundPayment(
    paymentId: string,
    reason: string,
    req?: Request
  ): Promise<Payment> {
    const payment = await db.findPaymentById(paymentId);
    if (!payment) throw new Error('Payment not found');

    if (payment.status !== PaymentStatus.SUCCESS) {
      throw new Error(`Cannot refund payment in status ${payment.status}`);
    }

    const updated = await db.updatePayment(paymentId, {
      status: PaymentStatus.REFUNDED,
      failure_reason: reason,
    });

    paymentsTotalCounter.inc({ status: PaymentStatus.REFUNDED });

    workerService.enqueue('PROCESS_REFUND', {
      paymentId,
      amount: payment.amount,
      reason,
    });

    await auditService.logEvent({
      action: 'PAYMENT_REFUNDED',
      entityType: 'PAYMENT',
      entityId: paymentId,
      userId: payment.patient_id,
      req,
      details: { amount: payment.amount, reason },
    });

    return updated!;
  }
}

export const paymentService = new PaymentService();
