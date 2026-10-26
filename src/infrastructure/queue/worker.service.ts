import { logger } from '../observability/logger';

export interface BackgroundJob<T = any> {
  id: string;
  type: 'NOTIFY_PATIENT_BOOKING' | 'GENERATE_PRESCRIPTION_PDF' | 'PROCESS_REFUND' | 'AUDIT_ARCHIVE';
  payload: T;
  attempts: number;
  maxAttempts: number;
  backoffMs: number;
  createdAt: string;
}

export class WorkerService {
  private queue: BackgroundJob[] = [];
  private deadLetterQueue: BackgroundJob[] = [];
  private isProcessing = false;
  private intervalTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.startWorker();
  }

  public enqueue<T>(type: BackgroundJob['type'], payload: T, maxAttempts = 3, backoffMs = 1000): string {
    const job: BackgroundJob<T> = {
      id: `job_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      type,
      payload,
      attempts: 0,
      maxAttempts,
      backoffMs,
      createdAt: new Date().toISOString(),
    };

    this.queue.push(job);
    logger.info(`Enqueued background job ${job.id} of type ${type}`);
    return job.id;
  }

  private startWorker() {
    this.intervalTimer = setInterval(() => {
      this.processNextJob();
    }, 500);
  }

  private async processNextJob() {
    if (this.isProcessing || this.queue.length === 0) return;

    this.isProcessing = true;
    const job = this.queue.shift();
    if (!job) {
      this.isProcessing = false;
      return;
    }

    try {
      job.attempts++;
      logger.info(`Processing job ${job.id} [${job.type}] (Attempt ${job.attempts}/${job.maxAttempts})`);

      await this.executeJobHandler(job);

      logger.info(`Job ${job.id} [${job.type}] completed successfully`);
    } catch (err: any) {
      logger.error(`Job ${job.id} failed on attempt ${job.attempts}: ${err.message}`);

      if (job.attempts < job.maxAttempts) {
        // Exponential backoff with jitter
        const jitter = Math.random() * 200;
        const delay = job.backoffMs * Math.pow(2, job.attempts - 1) + jitter;
        logger.warn(`Retrying job ${job.id} in ${Math.round(delay)}ms`);
        setTimeout(() => {
          this.queue.push(job);
        }, delay);
      } else {
        logger.error(`Job ${job.id} reached max attempts. Moving to Dead Letter Queue (DLQ).`);
        this.deadLetterQueue.push(job);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async executeJobHandler(job: BackgroundJob): Promise<void> {
    switch (job.type) {
      case 'NOTIFY_PATIENT_BOOKING':
        // Simulates async dispatch to Twilio SMS / SendGrid Email
        await new Promise((resolve) => setTimeout(resolve, 50));
        logger.info(`Notification sent to patient for consultation ${job.payload.consultationNumber}`);
        break;

      case 'GENERATE_PRESCRIPTION_PDF':
        // Simulates async generation of digitally signed prescription PDF in S3
        await new Promise((resolve) => setTimeout(resolve, 80));
        logger.info(`Prescription PDF generated for consultation ${job.payload.consultationId}`);
        break;

      case 'PROCESS_REFUND':
        // Simulates async refund processing in Payment Gateway
        await new Promise((resolve) => setTimeout(resolve, 60));
        logger.info(`Refund processed for payment ${job.payload.paymentId}`);
        break;

      case 'AUDIT_ARCHIVE':
        await new Promise((resolve) => setTimeout(resolve, 30));
        break;

      default:
        throw new Error(`Unknown job type: ${(job as any).type}`);
    }
  }

  public getQueueStats() {
    return {
      pending: this.queue.length,
      dlq: this.deadLetterQueue.length,
    };
  }

  public stop() {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
    }
  }
}

export const workerService = new WorkerService();
