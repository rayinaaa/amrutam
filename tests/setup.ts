import { config } from '../src/config';
import { logger } from '../src/infrastructure/observability/logger';
import { workerService } from '../src/infrastructure/queue/worker.service';

beforeAll(() => {
  // Silence console logs during tests to keep output pristine
  logger.transports.forEach((t) => (t.silent = true));
});

afterAll(async () => {
  workerService.stop();
});
