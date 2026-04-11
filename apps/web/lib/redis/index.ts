import Redis from "ioredis";

let client: Redis | null = null;

type MemoryEntry = {
  value: string;
  expiresAt: number | null;
  touchedAt: number;
  softScore: number;
};

const memoryStore = new Map<string, MemoryEntry>();

const SESSION_TTL_SECONDS = Number(process.env.SESSION_TTL_SECONDS ?? 45 * 60);
const SESSION_SOFT_DECAY_WINDOW_SECONDS = Number(
  process.env.SESSION_SOFT_DECAY_WINDOW_SECONDS ?? 20 * 60,
);
const SESSION_PREFIX = "session:";

const nowMs = () => Date.now();

const isSessionKey = (key: string) => key.startsWith(SESSION_PREFIX);

const getSessionExpiry = () => {
  const clamped = Math.max(30 * 60, Math.min(60 * 60, SESSION_TTL_SECONDS));
  return clamped;
};

const getSessionSoftDecayWindowMs = () => {
  const clamped = Math.max(
    10 * 60,
    Math.min(60 * 60, SESSION_SOFT_DECAY_WINDOW_SECONDS),
  );
  return clamped * 1000;
};

const defaultTtlForKey = (key: string) => {
  if (isSessionKey(key)) {
    return getSessionExpiry();
  }
  return null;
};

const cleanupExpiredMemoryKeys = () => {
  const now = nowMs();
  for (const [key, entry] of memoryStore.entries()) {
    if (entry.expiresAt != null && entry.expiresAt <= now) {
      memoryStore.delete(key);
    }
  }
};

const applySoftDecayToMemory = () => {
  const now = nowMs();
  const decayWindowMs = getSessionSoftDecayWindowMs();
  for (const [key, entry] of memoryStore.entries()) {
    if (!isSessionKey(key)) {
      continue;
    }
    const idleMs = now - entry.touchedAt;
    if (idleMs <= decayWindowMs) {
      continue;
    }

    const decayFactor = Math.exp(-idleMs / decayWindowMs);
    entry.softScore = entry.softScore * decayFactor;
    if (entry.softScore < 0.05) {
      memoryStore.delete(key);
      continue;
    }
    entry.touchedAt = now;
    memoryStore.set(key, entry);
  }
};

const getMemoryEntry = (key: string) => {
  cleanupExpiredMemoryKeys();
  applySoftDecayToMemory();
  const entry = memoryStore.get(key);
  if (!entry) {
    return null;
  }
  if (entry.expiresAt != null && entry.expiresAt <= nowMs()) {
    memoryStore.delete(key);
    return null;
  }
  return entry;
};

const upsertMemoryEntry = (
  key: string,
  value: string,
  ttlSeconds?: number | null,
) => {
  const ttl = ttlSeconds ?? defaultTtlForKey(key);
  const expiresAt = ttl && ttl > 0 ? nowMs() + ttl * 1000 : null;
  memoryStore.set(key, {
    value,
    expiresAt,
    touchedAt: nowMs(),
    softScore: 1,
  });
};

export const getRedisClient = (): Redis | null => {
  const url = process.env.REDIS_URL;
  if (!url) {
    return null;
  }

  if (!client) {
    client = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableAutoPipelining: true,
      lazyConnect: true,
    });
  }

  return client;
};

async function touchRedisSessionKey(redis: Redis, key: string) {
  if (!isSessionKey(key)) {
    return;
  }
  await redis.expire(key, getSessionExpiry());
}

export async function cacheJson<T>(key: string, value: T, ttlSeconds = 300) {
  const redis = getRedisClient();
  if (!redis) {
    upsertMemoryEntry(key, JSON.stringify(value), ttlSeconds);
    return;
  }
  try {
    if (redis.status === "wait") {
      await redis.connect();
    }
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch {
    upsertMemoryEntry(key, JSON.stringify(value), ttlSeconds);
  }
}

export async function setJsonValue<T>(
  key: string,
  value: T,
  ttlSeconds?: number,
) {
  const redis = getRedisClient();
  if (!redis) {
    upsertMemoryEntry(key, JSON.stringify(value), ttlSeconds);
    return;
  }
  try {
    if (redis.status === "wait") {
      await redis.connect();
    }

    const effectiveTtl = ttlSeconds ?? defaultTtlForKey(key);
    if (effectiveTtl && effectiveTtl > 0) {
      await redis.set(key, JSON.stringify(value), "EX", effectiveTtl);
      return;
    }
    await redis.set(key, JSON.stringify(value));
  } catch {
    upsertMemoryEntry(key, JSON.stringify(value), ttlSeconds);
  }
}

export async function getCachedJson<T>(key: string): Promise<T | null> {
  const redis = getRedisClient();
  if (!redis) {
    const entry = getMemoryEntry(key);
    if (!entry) {
      return null;
    }
    try {
      return JSON.parse(entry.value) as T;
    } catch {
      return null;
    }
  }
  try {
    if (redis.status === "wait") {
      await redis.connect();
    }
    const raw = await redis.get(key);
    if (!raw) {
      return null;
    }
    await touchRedisSessionKey(redis, key);
    return JSON.parse(raw) as T;
  } catch {
    const entry = getMemoryEntry(key);
    if (!entry) {
      return null;
    }
    try {
      return JSON.parse(entry.value) as T;
    } catch {
      return null;
    }
  }
}

export async function getJsonValue<T>(key: string): Promise<T | null> {
  const redis = getRedisClient();
  if (!redis) {
    const entry = getMemoryEntry(key);
    if (!entry) {
      return null;
    }
    try {
      return JSON.parse(entry.value) as T;
    } catch {
      return null;
    }
  }
  try {
    if (redis.status === "wait") {
      await redis.connect();
    }
    const raw = await redis.get(key);
    if (!raw) {
      return null;
    }
    await touchRedisSessionKey(redis, key);
    return JSON.parse(raw) as T;
  } catch {
    const entry = getMemoryEntry(key);
    if (!entry) {
      return null;
    }
    try {
      return JSON.parse(entry.value) as T;
    } catch {
      return null;
    }
  }
}

export async function storeJsonArray<T>(key: string, values: T[]) {
  const redis = getRedisClient();
  if (!redis) {
    upsertMemoryEntry(key, JSON.stringify(values), null);
    return;
  }
  try {
    if (redis.status === "wait") {
      await redis.connect();
    }

    const ttl = defaultTtlForKey(key);
    if (ttl && ttl > 0) {
      await redis.set(key, JSON.stringify(values), "EX", ttl);
      return;
    }
    await redis.set(key, JSON.stringify(values));
  } catch {
    upsertMemoryEntry(key, JSON.stringify(values), null);
  }
}

export async function getJsonArray<T>(key: string): Promise<T[]> {
  const redis = getRedisClient();
  if (!redis) {
    const entry = getMemoryEntry(key);
    if (!entry) {
      return [];
    }
    try {
      return JSON.parse(entry.value) as T[];
    } catch {
      return [];
    }
  }
  try {
    if (redis.status === "wait") {
      await redis.connect();
    }
    const raw = await redis.get(key);
    if (!raw) {
      return [];
    }
    await touchRedisSessionKey(redis, key);
    return JSON.parse(raw) as T[];
  } catch {
    const entry = getMemoryEntry(key);
    if (!entry) {
      return [];
    }
    try {
      return JSON.parse(entry.value) as T[];
    } catch {
      return [];
    }
  }
}
