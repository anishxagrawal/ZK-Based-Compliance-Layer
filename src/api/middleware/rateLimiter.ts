/**
 * Shared API rate limiter configured through environment variables.
 */

import rateLimit from "express-rate-limit";

const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000);
const max = Number(process.env.RATE_LIMIT_MAX ?? 100);

export const apiRateLimiter = rateLimit({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false
});
