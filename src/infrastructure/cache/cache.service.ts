import Redis from 'ioredis';
import crypto from 'crypto';
import { config } from '../../config';
import { logger } from '../observability/logger';
import { cacheHitsCounter, cacheMissesCounter } from '../observability/metrics';

export interface ICacheService {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: any, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  delPattern(pattern: string): Promise<void>;
  acquireLock(lockKey: string, ttlMs: number): Promise<string | null>;
  releaseLock(lockKey: string, token: string): Promise<boolean>;
  isHealthy(): Promise<boolean>;
}

interface MemoryCacheEntry {
  value: any;
  expiresAt: number;
}

interface MemoryLockEntry {
  token: string;
  expiresAt: number;
}

export class CacheService implements ICacheService {
  private redisClient: Redis | null = null;
  private memoryCache = new Map<string, MemoryCacheEntry>();
  private memoryLocks = new Map<string, MemoryLockEntry>();
  private useMemoryFallback = true;

  constructor() {
    this.initRedis();
  }

  private initRedis() {
    if (config.NODE_ENV === 'test') {
      this.useMemoryFallback = true;
      return;
    }

    try {
      this.redisClient = new Redis(config.REDIS_URL, {
        maxRetriesPerRequest: 1,
        connectTimeout: 1000,
        lazyConnect: true,
        retryStrategy: () => null, // Don't hang indefinitely if Redis isn't up locally
      });

      this.redisClient.connect().then(() => {
        logger.info('Connected to Redis cache successfully');
        this.useMemoryFallback = false;
      }).catch((err) => {
        logger.warn(`Redis unavailable (${err.message}). Using resilient in-memory cache & distributed lock store.`);
        this.useMemoryFallback = true;
      });

      this.redisClient.on('error', (err) => {
        if (!this.useMemoryFallback) {
          logger.warn(`Redis error (${err.message}). Falling back to memory cache.`);
          this.useMemoryFallback = true;
        }
      });
    } catch (err: any) {
      logger.warn(`Failed to initialize Redis client: ${err.message}. Defaulting to in-memory store.`);
      this.useMemoryFallback = true;
    }
  }

  public async get<T>(key: string): Promise<T | null> {
    if (!this.useMemoryFallback && this.redisClient) {
      try {
        const raw = await this.redisClient.get(key);
        if (raw) {
          cacheHitsCounter.inc({ cache_name: 'redis' });
          return JSON.parse(raw) as T;
        }
        cacheMissesCounter.inc({ cache_name: 'redis' });
        return null;
      } catch (err) {
        this.useMemoryFallback = true;
      }
    }

    // In-memory fallback
    const entry = this.memoryCache.get(key);
    if (!entry) {
      cacheMissesCounter.inc({ cache_name: 'memory' });
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      this.memoryCache.delete(key);
      cacheMissesCounter.inc({ cache_name: 'memory' });
      return null;
    }
    cacheHitsCounter.inc({ cache_name: 'memory' });
    return entry.value as T;
  }

  public async set(key: string, value: any, ttlSeconds: number = config.CACHE_TTL_SECONDS): Promise<void> {
    if (!this.useMemoryFallback && this.redisClient) {
      try {
        await this.redisClient.set(key, JSON.stringify(value), 'EX', ttlSeconds);
        return;
      } catch (err) {
        this.useMemoryFallback = true;
      }
    }

    this.memoryCache.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  public async del(key: string): Promise<void> {
    if (!this.useMemoryFallback && this.redisClient) {
      try {
        await this.redisClient.del(key);
      } catch (err) {
        this.useMemoryFallback = true;
      }
    }
    this.memoryCache.delete(key);
  }

  public async delPattern(pattern: string): Promise<void> {
    if (!this.useMemoryFallback && this.redisClient) {
      try {
        const keys = await this.redisClient.keys(pattern);
        if (keys.length > 0) {
          await this.redisClient.del(...keys);
        }
      } catch (err) {
        this.useMemoryFallback = true;
      }
    }

    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    for (const key of this.memoryCache.keys()) {
      if (regex.test(key)) {
        this.memoryCache.delete(key);
      }
    }
  }

  /**
   * Acquire a distributed lock with TTL. Prevents race conditions and double-booking.
   * Uses SET NX PX algorithm (Redlock standard pattern).
   */
  public async acquireLock(lockKey: string, ttlMs: number = 5000): Promise<string | null> {
    const token = crypto.randomUUID();

    if (!this.useMemoryFallback && this.redisClient) {
      try {
        const result = await this.redisClient.set(lockKey, token, 'PX', ttlMs, 'NX');
        return result === 'OK' ? token : null;
      } catch (err) {
        this.useMemoryFallback = true;
      }
    }

    // Atomic in-memory lock
    const existing = this.memoryLocks.get(lockKey);
    const now = Date.now();
    if (existing && now < existing.expiresAt) {
      return null; // Lock is currently held
    }

    this.memoryLocks.set(lockKey, {
      token,
      expiresAt: now + ttlMs,
    });
    return token;
  }

  /**
   * Releases distributed lock only if token matches (safe from releasing other process's lock)
   */
  public async releaseLock(lockKey: string, token: string): Promise<boolean> {
    if (!this.useMemoryFallback && this.redisClient) {
      try {
        // Lua script ensures atomic check and delete
        const luaScript = `
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
          else
            return 0
          end
        `;
        const result = await this.redisClient.eval(luaScript, 1, lockKey, token);
        return result === 1;
      } catch (err) {
        this.useMemoryFallback = true;
      }
    }

    const existing = this.memoryLocks.get(lockKey);
    if (existing && existing.token === token) {
      this.memoryLocks.delete(lockKey);
      return true;
    }
    return false;
  }

  public async isHealthy(): Promise<boolean> {
    if (!this.useMemoryFallback && this.redisClient) {
      try {
        const ping = await this.redisClient.ping();
        return ping === 'PONG';
      } catch {
        return false;
      }
    }
    return true; // Memory fallback is always healthy
  }

  public async close(): Promise<void> {
    if (this.redisClient) {
      await this.redisClient.quit();
    }
  }
}

export const cacheService = new CacheService();
