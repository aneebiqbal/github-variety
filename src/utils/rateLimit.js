const crypto = require('crypto');
const prisma = require('./prisma');

/**
 * Prisma-backed rate limiter using an atomic upsert.
 *
 * ATOMICITY: The INSERT ... ON CONFLICT ... DO UPDATE SET count = count + 1
 * runs as a single statement with a row-level lock in Postgres. Concurrent
 * requests for the same key cannot race — each gets a monotonically increasing
 * count. No read-then-write sequence.
 *
 * FAIL OPEN: If the DB is unreachable, the request is allowed through.
 * Rationale: availability > strict rate limiting. The password (login) and
 * GitHub issue creation (feedback) remain as primary defenses.
 *
 * @param {string} prefix - Key prefix (e.g. 'login', 'feedback')
 * @param {number} limit - Max requests per window
 * @param {number} windowMs - Window size in milliseconds
 */
function createRateLimiter(prefix, limit, windowMs) {
  return async function rateLimitMiddleware(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    // Bucket the window so each time-slot gets its own row
    const windowBucket = Math.floor(now / windowMs);
    const key = `${prefix}:${ip}:${windowBucket}`;
    const expiresAt = new Date(now + windowMs);

    try {
      // Atomic upsert: insert new window or increment existing, return new count
      const result = await prisma.$queryRaw`
        INSERT INTO "RateLimit" ("id", "key", "count", "expiresAt", "createdAt")
        VALUES (${crypto.randomUUID()}, ${key}, 1, ${expiresAt}, NOW())
        ON CONFLICT ("key") DO UPDATE SET "count" = "RateLimit"."count" + 1
        RETURNING "count";
      `;

      const count = Number(result[0].count);
      if (count > limit) {
        return res.status(429).json({
          success: false,
          error: 'Too many requests. Please try again later.',
        });
      }
      next();
    } catch (err) {
      // DB unreachable — fail open (availability > strict rate limiting)
      console.warn(`[RateLimiter] DB error for ${prefix}, failing open:`, err.message);
      next();
    }
  };
}

module.exports = { createRateLimiter };
