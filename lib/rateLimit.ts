const RATE_LIMIT_STATE = Symbol.for("flarewatcher.rateLimit");
const LOCKOUT_STATE = Symbol.for("flarewatcher.lockout");

type RateLimitEntry = { hits: number[] };

type LockoutEntry = {
  failures: number;
  firstAt: number;
  lockUntil: number | null;
};

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
};

type LockoutResult = {
  locked: boolean;
  retryAfterSec: number;
};

const getRateLimitStore = (): Map<string, RateLimitEntry> => {
  const globalScope = globalThis as typeof globalThis & {
    [RATE_LIMIT_STATE]?: Map<string, RateLimitEntry>;
  };
  if (!globalScope[RATE_LIMIT_STATE]) {
    globalScope[RATE_LIMIT_STATE] = new Map();
  }
  return globalScope[RATE_LIMIT_STATE];
};

const getLockoutStore = (): Map<string, LockoutEntry> => {
  const globalScope = globalThis as typeof globalThis & {
    [LOCKOUT_STATE]?: Map<string, LockoutEntry>;
  };
  if (!globalScope[LOCKOUT_STATE]) {
    globalScope[LOCKOUT_STATE] = new Map();
  }
  return globalScope[LOCKOUT_STATE];
};

export const getClientIp = (request: Request): string => {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) {
    return cfIp;
  }
  return "unknown";
};

export const rateLimit = (
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult => {
  const store = getRateLimitStore();
  const now = Date.now();
  const entry = store.get(key) ?? { hits: [] };
  const windowStart = now - windowMs;

  entry.hits = entry.hits.filter((timestamp) => timestamp > windowStart);

  if (entry.hits.length >= limit) {
    const retryAfterMs = entry.hits[0] + windowMs - now;
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)),
    };
  }

  entry.hits.push(now);
  store.set(key, entry);
  return {
    allowed: true,
    remaining: Math.max(0, limit - entry.hits.length),
    retryAfterSec: 0,
  };
};

export const getLockout = (key: string): LockoutResult => {
  const store = getLockoutStore();
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || !entry.lockUntil) {
    return { locked: false, retryAfterSec: 0 };
  }
  if (entry.lockUntil <= now) {
    store.delete(key);
    return { locked: false, retryAfterSec: 0 };
  }
  return {
    locked: true,
    retryAfterSec: Math.max(1, Math.ceil((entry.lockUntil - now) / 1000)),
  };
};

export const recordFailure = (
  key: string,
  options: { maxAttempts: number; windowMs: number; lockMs: number }
): LockoutResult => {
  const store = getLockoutStore();
  const now = Date.now();
  const entry = store.get(key) ?? {
    failures: 0,
    firstAt: now,
    lockUntil: null,
  };

  if (now - entry.firstAt > options.windowMs) {
    entry.failures = 0;
    entry.firstAt = now;
    entry.lockUntil = null;
  }

  entry.failures += 1;

  if (entry.failures >= options.maxAttempts) {
    entry.failures = 0;
    entry.lockUntil = now + options.lockMs;
    store.set(key, entry);
    return {
      locked: true,
      retryAfterSec: Math.max(1, Math.ceil(options.lockMs / 1000)),
    };
  }

  store.set(key, entry);
  return { locked: false, retryAfterSec: 0 };
};

export const clearFailures = (key: string) => {
  const store = getLockoutStore();
  store.delete(key);
};
