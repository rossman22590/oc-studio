/**
 * Rate limiter for Ably messages to stay under 250k/hour limit
 * 
 * Strategy:
 * - Track messages sent per hour
 * - Throttle publishes when approaching limit
 * - Prefer HTTP polling when rate limit is high
 */

const MAX_MESSAGES_PER_HOUR = 200000; // Leave 50k buffer (250k limit)
const WARNING_THRESHOLD = 180000; // Warn at 180k

type MessageCount = {
  count: number;
  resetAt: number; // Timestamp when counter resets
};

const globalStore = globalThis as unknown as {
  __ablyRateLimit?: MessageCount;
};

if (!globalStore.__ablyRateLimit) {
  globalStore.__ablyRateLimit = {
    count: 0,
    resetAt: Date.now() + 60 * 60 * 1000, // Reset in 1 hour
  };
}

const rateLimitStore = globalStore.__ablyRateLimit;

export const checkRateLimit = (): { allowed: boolean; remaining: number; shouldThrottle: boolean } => {
  const now = Date.now();
  
  // Reset counter if hour has passed
  if (now >= rateLimitStore.resetAt) {
    rateLimitStore.count = 0;
    rateLimitStore.resetAt = now + 60 * 60 * 1000; // Next hour
  }
  
  const remaining = MAX_MESSAGES_PER_HOUR - rateLimitStore.count;
  const shouldThrottle = rateLimitStore.count > WARNING_THRESHOLD;
  const allowed = rateLimitStore.count < MAX_MESSAGES_PER_HOUR;
  
  return { allowed, remaining, shouldThrottle };
};

export const recordMessage = (count: number = 1): void => {
  const now = Date.now();
  
  // Reset counter if hour has passed
  if (now >= rateLimitStore.resetAt) {
    rateLimitStore.count = 0;
    rateLimitStore.resetAt = now + 60 * 60 * 1000;
  }
  
  rateLimitStore.count += count;
  
  if (rateLimitStore.count > WARNING_THRESHOLD) {
    console.warn(`[RateLimit] Ably messages: ${rateLimitStore.count}/${MAX_MESSAGES_PER_HOUR} (${Math.round(rateLimitStore.count / MAX_MESSAGES_PER_HOUR * 100)}%)`);
  }
};

export const getRateLimitStatus = () => {
  const { allowed, remaining, shouldThrottle } = checkRateLimit();
  return {
    allowed,
    remaining,
    shouldThrottle,
    current: rateLimitStore.count,
    max: MAX_MESSAGES_PER_HOUR,
    percentage: Math.round((rateLimitStore.count / MAX_MESSAGES_PER_HOUR) * 100),
  };
};
