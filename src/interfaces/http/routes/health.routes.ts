import { Router, Request, Response } from 'express';
import { cacheService } from '../../../infrastructure/cache/cache.service';
import { workerService } from '../../../infrastructure/queue/worker.service';
import { metricsRegistry } from '../../../infrastructure/observability/metrics';

const router = Router();

// Liveness Probe
router.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'UP',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
  });
});

// Readiness Probe (K8s / Load Balancer)
router.get('/ready', async (req: Request, res: Response) => {
  const isCacheHealthy = await cacheService.isHealthy();
  const queueStats = workerService.getQueueStats();

  const isReady = isCacheHealthy;

  const payload = {
    status: isReady ? 'READY' : 'DEGRADED',
    timestamp: new Date().toISOString(),
    components: {
      database: 'UP',
      cache: isCacheHealthy ? 'UP' : 'FALLBACK_MEMORY',
      workerQueue: queueStats,
    },
  };

  res.status(isReady ? 200 : 503).json(payload);
});

// Prometheus Metrics Exporter Endpoint
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    res.setHeader('Content-Type', metricsRegistry.contentType);
    const metrics = await metricsRegistry.metrics();
    res.send(metrics);
  } catch (err: any) {
    res.status(500).send(err.message);
  }
});

export const healthRoutes = router;
