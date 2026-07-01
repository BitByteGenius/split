/*const redis = require('redis');
const logger = require('../utils/logger');

let client = null;
let useMemoryCache = false;
const memoryCache = new Map();

const initRedis = async () => {
  if (process.env.USE_REDIS === 'false') {
    logger.info('Redis is explicitly disabled. Using in-memory cache.');
    useMemoryCache = true;
    return;
  }

  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  
  try {
    client = redis.createClient({ url: redisUrl });
    
    client.on('error', (err) => {
      logger.error('Redis Client Error, switching to memory cache: ', err);
      useMemoryCache = true;
    });

    client.on('connect', () => {
      logger.info('Redis client connected');
      useMemoryCache = false;
    });

    await client.connect();
  } catch (error) {
    logger.error('Failed to connect to Redis. Falling back to memory cache: ', error);
    useMemoryCache = true;
  }
};

const cache = {
  get: async (key) => {
    try {
      if (useMemoryCache || !client) {
        const item = memoryCache.get(key);
        if (!item) return null;
        if (item.expires && item.expires < Date.now()) {
          memoryCache.delete(key);
          return null;
        }
        return item.value;
      }
      return await client.get(key);
    } catch (err) {
      logger.error(`Redis GET error for key ${key}: `, err);
      return null;
    }
  },

  set: async (key, value, ttlSeconds = 3600) => {
    try {
      if (useMemoryCache || !client) {
        memoryCache.set(key, {
          value: typeof value === 'string' ? value : JSON.stringify(value),
          expires: Date.now() + (ttlSeconds * 1000)
        });
        return true;
      }
      const valStr = typeof value === 'string' ? value : JSON.stringify(value);
      await client.set(key, valStr, { EX: ttlSeconds });
      return true;
    } catch (err) {
      logger.error(`Redis SET error for key ${key}: `, err);
      return false;
    }
  },

  del: async (key) => {
    try {
      if (useMemoryCache || !client) {
        return memoryCache.delete(key);
      }
      await client.del(key);
      return true;
    } catch (err) {
      logger.error(`Redis DEL error for key ${key}: `, err);
      return false;
    }
  },

  clear: async () => {
    try {
      if (useMemoryCache || !client) {
        memoryCache.clear();
        return true;
      }
      await client.flushAll();
      return true;
    } catch (err) {
      logger.error('Redis FLUSH error: ', err);
      return false;
    }
  }
};

module.exports = { initRedis, cache };*/


const redis = require('redis');
const logger = require('../utils/logger');

let client = null;
let useMemoryCache = false;
const memoryCache = new Map();

const initRedis = async () => {
  if (process.env.USE_REDIS !== 'true') {
    logger.info('Redis disabled. Using in-memory cache.');
    useMemoryCache = true;
    return;
  }

  if (!process.env.REDIS_URL) {
    logger.warn('REDIS_URL not found. Using in-memory cache.');
    useMemoryCache = true;
    return;
  }

  try {
    client = redis.createClient({
      url: process.env.REDIS_URL,
      socket: {
        reconnectStrategy: false
      }
    });

    client.on('error', (err) => {
      logger.error('Redis connection error:', err);
      useMemoryCache = true;
    });

    await client.connect();

    logger.info('Redis connected successfully');
    useMemoryCache = false;

  } catch (err) {
    logger.warn('Redis unavailable. Using in-memory cache.');
    useMemoryCache = true;

    if (client) {
      try {
        await client.quit();
      } catch (_) {}

      client = null;
    }
  }
};

const cache = {
  async get(key) {
    try {
      if (useMemoryCache || !client) {
        const item = memoryCache.get(key);

        if (!item) return null;

        if (item.expires < Date.now()) {
          memoryCache.delete(key);
          return null;
        }

        return item.value;
      }

      return await client.get(key);

    } catch (err) {
      logger.error(`Cache GET failed: ${key}`, err);
      return null;
    }
  },

  async set(key, value, ttl = 3600) {
    try {
      if (useMemoryCache || !client) {
        memoryCache.set(key, {
          value: typeof value === 'string'
            ? value
            : JSON.stringify(value),
          expires: Date.now() + ttl * 1000
        });

        return true;
      }

      const val =
        typeof value === 'string'
          ? value
          : JSON.stringify(value);

      await client.set(key, val, {
        EX: ttl
      });

      return true;

    } catch (err) {
      logger.error(`Cache SET failed: ${key}`, err);
      return false;
    }
  },

  async del(key) {
    try {
      if (useMemoryCache || !client) {
        memoryCache.delete(key);
        return true;
      }

      await client.del(key);
      return true;

    } catch (err) {
      logger.error(`Cache DEL failed: ${key}`, err);
      return false;
    }
  },

  async clear() {
    try {
      if (useMemoryCache || !client) {
        memoryCache.clear();
        return true;
      }

      await client.flushAll();
      return true;

    } catch (err) {
      logger.error('Cache CLEAR failed', err);
      return false;
    }
  }
};

module.exports = {
  initRedis,
  cache
};