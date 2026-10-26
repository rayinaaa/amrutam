import { memoryDb } from './memory.db';
import { postgresDb } from './postgres.db';

export const db = memoryDb;
export { postgresDb, memoryDb };
