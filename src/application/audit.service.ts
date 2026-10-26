import crypto from 'crypto';
import { Request } from 'express';
import { db } from '../infrastructure/database';
import { AuditLog } from '../domain/types';
import { logger } from '../infrastructure/observability/logger';

export class AuditService {
  /**
   * Logs an immutable audit event for HIPAA / DISHA compliance
   */
  public async logEvent(params: {
    action: string;
    entityType: string;
    entityId: string;
    userId?: string | null;
    req?: Request;
    details?: Record<string, any>;
  }): Promise<AuditLog> {
    const ipAddress = params.req?.ip || params.req?.socket?.remoteAddress || null;
    const userAgent = params.req?.headers['user-agent'] || null;

    const auditEntry: AuditLog = {
      id: crypto.randomUUID(),
      user_id: params.userId || null,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId,
      ip_address: ipAddress,
      user_agent: userAgent,
      details: params.details || {},
      created_at: new Date().toISOString(),
    };

    const saved = await db.createAuditLog(auditEntry);
    logger.info(`[AUDIT] Action: ${params.action} | Entity: ${params.entityType}:${params.entityId} | User: ${params.userId || 'ANONYMOUS'}`);
    return saved;
  }

  public async getAuditLogs(filters: {
    userId?: string;
    entityType?: string;
    entityId?: string;
    limit?: number;
    offset?: number;
  }) {
    return db.getAuditLogs(filters);
  }
}

export const auditService = new AuditService();
