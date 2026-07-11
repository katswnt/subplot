/**
 * Server-only Redis client (ioredis). Copied from Letterbddy's api/_lib so
 * Subplot has its own function budget without touching the parent app.
 * DO NOT import this file in client-side code.
 */

import Redis from 'ioredis';
import type { Redis as RedisType } from 'ioredis';

if (typeof (globalThis as Record<string, unknown>).window !== 'undefined') {
  throw new Error('Redis client cannot be used in browser code');
}

// Vercel prefixes integration env vars with the project name; support both.
const REDIS_URL = process.env.subplot_REDIS_URL || process.env.REDIS_URL;

let redis: RedisType | null = null;

export function getRedis(): RedisType | null {
  if (!REDIS_URL) {
    console.warn('Redis URL not configured (subplot_REDIS_URL or REDIS_URL)');
    return null;
  }

  if (!redis) {
    const Ctor = Redis as unknown as new (
      url: string,
      options: Record<string, unknown>,
    ) => RedisType;
    redis = new Ctor(REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times: number) {
        if (times > 3) return null;
        return Math.min(times * 100, 1000);
      },
      connectTimeout: 5000,
      commandTimeout: 5000,
      enableReadyCheck: false,
    });

    redis!.on('error', (err) => {
      console.error('Redis connection error:', err.message);
    });
  }

  return redis;
}

export async function getCached<T>(key: string): Promise<T | null> {
  const client = getRedis();
  if (!client) return null;
  try {
    const value = await client.get(key);
    if (!value) return null;
    return JSON.parse(value) as T;
  } catch (err) {
    console.error('Redis get error:', err);
    return null;
  }
}

export async function setCached(key: string, value: unknown, expiresInSeconds?: number): Promise<boolean> {
  const client = getRedis();
  if (!client) return false;
  try {
    const json = JSON.stringify(value);
    if (expiresInSeconds) {
      await client.setex(key, expiresInSeconds, json);
    } else {
      await client.set(key, json);
    }
    return true;
  } catch (err) {
    console.error('Redis set error:', err);
    return false;
  }
}

// Subplot cache-key namespace (shares the Redis instance with Letterbddy).
export const CACHE_KEYS = {
  RESOLVE_IMDB: 'subplot:resolve:v1:imdb:',
  RESOLVE_SEARCH: 'subplot:resolve:v1:search:',
  WATCH_PROVIDERS: 'subplot:wp:v2:', // v2: include free + ads buckets
} as const;

export const CACHE_DURATION = {
  // IMDb→TMDb mappings are permanent; provider availability is ~daily-stale.
  RESOLVE: 60 * 60 * 24 * 180, // 180 days
  WATCH_PROVIDERS: 60 * 60 * 24 * 30, // 30 days
} as const;
