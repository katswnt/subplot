import type { VercelRequest } from '@vercel/node';
import { getRedis } from './redis.js';

/**
 * Fixed-window per-IP rate limiter, backed by the shared Redis instance.
 *
 * The public endpoints proxy TMDb (billed to our key) and — on resolve — can
 * fan out live Letterboxd fetches, so an unthrottled caller could burn quota or
 * amplify scraping. This caps requests per IP per route. Fails OPEN: if Redis is
 * unavailable the app still works (availability > enforcement for a demo), and
 * per-request caps (MAX_FILMS, the live-scrape budget in resolve) bound the
 * blast radius even without it.
 */
export type RateLimitResult = { ok: boolean; retryAfter: number };

const clientIp = (req: VercelRequest): string => {
  const fwd = req.headers['x-forwarded-for'];
  const raw = Array.isArray(fwd) ? fwd[0] : fwd;
  return (raw?.split(',')[0].trim() || (req.headers['x-real-ip'] as string) || 'unknown').slice(0, 64);
};

export async function checkRateLimit(
  req: VercelRequest,
  route: string,
  limit = 40,
  windowSec = 60,
): Promise<RateLimitResult> {
  const redis = getRedis();
  if (!redis) return { ok: true, retryAfter: 0 }; // fail open — no Redis, no limit

  const window = Math.floor(Date.now() / 1000 / windowSec);
  const key = `subplot:rl:${route}:${clientIp(req)}:${window}`;
  try {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, windowSec);
    if (count > limit) {
      const retryAfter = windowSec - (Math.floor(Date.now() / 1000) % windowSec);
      return { ok: false, retryAfter };
    }
    return { ok: true, retryAfter: 0 };
  } catch {
    return { ok: true, retryAfter: 0 }; // Redis error → don't block the user
  }
}
