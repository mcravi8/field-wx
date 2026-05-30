'use strict';

// Simple in-memory cache with TTL support
const store = new Map();

/**
 * Get a cached value by key, or invoke producerFn to compute and cache it.
 * @param {string} key - Cache key
 * @param {() => Promise<any>} producerFn - Async function to produce the value on cache miss
 * @param {number} ttlMs - Time-to-live in milliseconds (default 5 minutes)
 * @returns {Promise<any>} Cached or freshly produced value
 */
async function getCached(key, producerFn, ttlMs = 300000) {
  const now = Date.now();
  const entry = store.get(key);

  if (entry && (now - entry.ts) < ttlMs) {
    return entry.value;
  }

  const value = await producerFn();
  store.set(key, { value, ts: now });
  return value;
}

/**
 * Manually invalidate a cache entry.
 * @param {string} key
 */
function invalidate(key) {
  store.delete(key);
}

/**
 * Clear all cache entries.
 */
function clear() {
  store.clear();
}

module.exports = { getCached, invalidate, clear };
