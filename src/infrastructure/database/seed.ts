import { memoryDb } from './memory.db';
import { logger } from '../observability/logger';

export async function runSeeds() {
  logger.info('Running database seed script...');
  await memoryDb.seedInitialData();
  logger.info('Database seeded successfully.');
}

if (require.main === module) {
  runSeeds().then(() => process.exit(0));
}
