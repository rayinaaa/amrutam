import http from 'http';
import { createApp } from './app';
import { config } from './config';
import { logger } from './infrastructure/observability/logger';
import { cacheService } from './infrastructure/cache/cache.service';
import { workerService } from './infrastructure/queue/worker.service';
import { postgresDb } from './infrastructure/database/postgres.db';

const app = createApp();
const server = http.createServer(app);

const PORT = config.PORT;

server.listen(PORT, () => {
  logger.info(`================================================================`);
  logger.info(`🚀 Amrutam Telemedicine Backend listening on port ${PORT}`);
  logger.info(`📚 Swagger Documentation : http://localhost:${PORT}/api-docs`);
  logger.info(`📊 Prometheus Metrics    : http://localhost:${PORT}/metrics`);
  logger.info(`💓 Health & Readiness    : http://localhost:${PORT}/ready`);
  logger.info(`🔒 Environment           : ${config.NODE_ENV}`);
  logger.info(`================================================================`);
});

// Graceful Shutdown handling for Kubernetes / Docker
async function gracefulShutdown(signal: string) {
  logger.info(`Received ${signal}. Initiating graceful shutdown...`);

  // Stop accepting new connections
  server.close(async () => {
    logger.info('HTTP server closed.');

    try {
      workerService.stop();
      logger.info('Background worker stopped.');

      await cacheService.close();
      logger.info('Cache client closed.');

      await postgresDb.close();
      logger.info('Database pool closed.');

      logger.info('Graceful shutdown completed successfully. Exiting.');
      process.exit(0);
    } catch (err: any) {
      logger.error(`Error during graceful shutdown: ${err.message}`);
      process.exit(1);
    }
  });

  // Force close after 10 seconds if hanging
  setTimeout(() => {
    logger.error('Forcefully terminating process after shutdown timeout.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export { server, app };
