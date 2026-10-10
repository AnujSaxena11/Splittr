const { createClient } = require("redis");

const tokenBucketScript = `
local capacity = tonumber(ARGV[1])
local refillPerSecond = tonumber(ARGV[2])
local time = redis.call('TIME')
local now = (tonumber(time[1]) * 1000) + math.floor(tonumber(time[2]) / 1000)
local values = redis.call('HMGET', KEYS[1], 'tokens', 'timestamp')
local tokens = tonumber(values[1]) or capacity
local previous = tonumber(values[2]) or now
tokens = math.min(capacity, tokens + math.max(0, now - previous) * refillPerSecond / 1000)
local allowed = 0
local retryAfterMs = 0
if tokens >= 1 then
  tokens = tokens - 1
  allowed = 1
else
  retryAfterMs = math.ceil((1 - tokens) / refillPerSecond * 1000)
end
redis.call('HSET', KEYS[1], 'tokens', tokens, 'timestamp', now)
redis.call('PEXPIRE', KEYS[1], math.ceil(capacity / refillPerSecond * 2000))
return { allowed, math.floor(tokens), retryAfterMs }
`;

const redisClient = createClient({
  url: process.env.REDIS_URL,
  socket: {
    reconnectStrategy: (retries) => retries > 5
      ? new Error("Redis rate-limit store failed to reconnect")
      : Math.min(retries * 100, 3000),
  },
});

redisClient.on("error", (error) => {
  console.error("Redis rate-limit connection error:", error.message);
});

let connecting;

async function ensureRedisConnected() {
  if (!process.env.REDIS_URL) {
    throw new Error("REDIS_URL is required for rate limiting");
  }
  if (!redisClient.isReady && !redisClient.isOpen) {
    connecting ||= redisClient.connect().finally(() => { connecting = undefined; });
    await connecting;
  }
  if (!redisClient.isReady) {
    await new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeout);
        redisClient.off("ready", onReady);
        redisClient.off("error", onError);
      };
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onError = (error) => {
        if (!redisClient.isOpen) {
          cleanup();
          reject(error);
        }
      };
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("Redis rate-limit store did not become ready"));
      }, 2000);
      redisClient.once("ready", onReady);
      redisClient.on("error", onError);
      if (redisClient.isReady) onReady();
    });
  }
}

function createRateLimiter({ name, capacity, refillPerSecond }) {
  return async function rateLimit(req, res, next) {
    if (process.env.NODE_ENV === "test") return next();

    try {
      await ensureRedisConnected();
      const address = req.ip || req.socket.remoteAddress || "unknown";
      const result = await redisClient.eval(tokenBucketScript, {
        keys: [`splitter:rate:${name}:${address}`],
        arguments: [String(capacity), String(refillPerSecond)],
      });

      if (Number(result[0]) === 0) {
        const retryAfter = Math.max(1, Math.ceil(Number(result[2]) / 1000));
        res.set("Retry-After", String(retryAfter));
        return res.status(429).json({ message: "Too many requests. Please try again shortly." });
      }

      res.set("X-RateLimit-Limit", String(capacity));
      res.set("X-RateLimit-Remaining", String(result[1]));
      return next();
    } catch (error) {
      console.error("Redis rate limiting unavailable:", error.message);
      return res.status(503).json({ message: "Request protection is temporarily unavailable." });
    }
  };
}

module.exports = {
  authRateLimit: createRateLimiter({ name: "auth", capacity: 10, refillPerSecond: 1 / 60 }),
  apiRateLimit: createRateLimiter({ name: "api", capacity: 120, refillPerSecond: 2 }),
  connectRateLimitStore: ensureRedisConnected,
  closeRateLimitConnection: async () => {
    if (redisClient.isOpen) await redisClient.quit();
  },
  tokenBucketScript,
};
