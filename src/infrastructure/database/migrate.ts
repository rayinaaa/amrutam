import fs from 'fs';
import path from 'path';
import { postgresDb } from './postgres.db';
import { logger } from '../observability/logger';

export async function runMigrations() {
  logger.info('Starting database migration runner...');
  const isConnected = await postgresDb.checkConnection();
  if (!isConnected) {
    logger.warn('PostgreSQL is not reachable. Migrations skipped (in-memory database active).');
    return;
  }

  try {
    const migrationFilePath = path.join(__dirname, 'migrations', '001_initial_schema.sql');
    const sql = fs.readFileSync(migrationFilePath, 'utf8');
    await postgresDb.query(sql);
    logger.info('Database schema migration applied successfully.');
  } catch (err: any) {
    logger.error(`Migration failed: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  runMigrations().then(() => process.exit(0));
}
