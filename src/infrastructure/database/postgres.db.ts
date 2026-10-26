import { Pool, PoolClient } from 'pg';
import { config } from '../../config';
import { logger } from '../observability/logger';
import { memoryDb } from './memory.db';

export class PostgresDatabase {
  private pool: Pool | null = null;
  private isConnected = false;

  constructor() {
    this.initPool();
  }

  private initPool() {
    if (config.DB_DRIVER === 'memory') {
      logger.info('Database driver configured as "memory". Using in-memory relational store.');
      return;
    }

    try {
      this.pool = new Pool({
        connectionString: config.DATABASE_URL,
        host: config.DB_HOST,
        port: config.DB_PORT,
        user: config.DB_USER,
        password: config.DB_PASSWORD,
        database: config.DB_NAME,
        min: config.DB_POOL_MIN,
        max: config.DB_POOL_MAX,
        connectionTimeoutMillis: 2000,
        idleTimeoutMillis: 10000,
        ssl: config.DB_SSL ? { rejectUnauthorized: false } : false,
      });

      this.pool.on('error', (err) => {
        logger.error(`Unexpected PostgreSQL client error: ${err.message}`);
      });
    } catch (err: any) {
      logger.warn(`Postgres pool init failed: ${err.message}. Using memory store.`);
    }
  }

  public async checkConnection(): Promise<boolean> {
    if (!this.pool) return false;
    try {
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();
      this.isConnected = true;
      return true;
    } catch {
      this.isConnected = false;
      return false;
    }
  }

  public async query<T = any>(text: string, params?: any[]): Promise<T[]> {
    if (!this.pool || !this.isConnected) {
      throw new Error('Postgres pool is not connected');
    }
    const res = await this.pool.query(text, params);
    return res.rows;
  }

  public async getClient(): Promise<PoolClient> {
    if (!this.pool) {
      throw new Error('Postgres pool not initialized');
    }
    return this.pool.connect();
  }

  public async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
  }
}

export const postgresDb = new PostgresDatabase();
