// Simple in-memory cache service for embeddings and other computed values
// In production, could be extended to use Redis or Cosmos DB for distributed caching

import { logger } from '../utils/logger';
import crypto from 'crypto';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class CacheService {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private defaultTTL = 7 * 24 * 60 * 60 * 1000; // 7 days

  /**
   * Generate cache key from content hash
   */
  generateKey(prefix: string, content: string): string {
    const hash = crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
    return `${prefix}:${hash}`;
  }

  /**
   * Get value from cache
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      logger.debug('Cache entry expired', { key });
      return null;
    }

    logger.debug('Cache hit', { key });
    return entry.value as T;
  }

  /**
   * Set value in cache
   */
  set<T>(key: string, value: T, ttlMs?: number): void {
    const ttl = ttlMs || this.defaultTTL;
    const expiresAt = Date.now() + ttl;

    this.cache.set(key, { value, expiresAt });
    logger.debug('Cache set', { key, expiresAt: new Date(expiresAt).toISOString() });
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    return this.get(key) !== null;
  }

  /**
   * Delete key from cache
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear expired entries (call periodically)
   */
  cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info('Cache cleanup completed', { entriesRemoved: cleaned });
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; entries: number } {
    return {
      size: this.cache.size,
      entries: this.cache.size,
    };
  }
}

export const cacheService = new CacheService();

// Run cleanup every hour
setInterval(() => {
  cacheService.cleanup();
}, 60 * 60 * 1000);
