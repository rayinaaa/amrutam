import { db } from '../infrastructure/database';
import { cacheService } from '../infrastructure/cache/cache.service';
import { workerService } from '../infrastructure/queue/worker.service';

export class AnalyticsService {
  public async getDashboardMetrics() {
    const cacheKey = 'analytics:dashboard';
    const cached = await cacheService.get<any>(cacheKey);
    if (cached) return cached;

    const summary = await db.getAnalyticsSummary();
    const queueStats = workerService.getQueueStats();

    const result = {
      ...summary,
      asyncQueue: queueStats,
      scaleMetrics: {
        dailyCapacityTarget: 100000,
        currentThroughputQPS: Math.round(100000 / 86400 * 10) / 10,
        readLatencyTargetP95: '< 200ms',
        writeLatencyTargetP95: '< 500ms',
        availabilityTarget: '99.95%',
      },
    };

    await cacheService.set(cacheKey, result, 15); // 15 sec cache
    return result;
  }
}

export const analyticsService = new AnalyticsService();
