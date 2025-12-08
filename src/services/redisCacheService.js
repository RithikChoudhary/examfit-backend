/**
 * Redis Cache Service
 * Provides Redis-based caching with fallback to in-memory cache
 */

import { createClient } from 'redis';
import inMemoryCache from './cacheService.js';

class RedisCacheService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.fallbackCache = inMemoryCache; // Fallback to in-memory cache
    
    // Redis connection URL from environment or default
    this.redisUrl = process.env.REDIS_URL || 
      'redis://default:FaeNDtkwl74GyCJ12H6yIo4D2HAw5nBq@redis-14966.c301.ap-south-1-1.ec2.cloud.redislabs.com:14966';
    
    this.connect();
  }

  async connect() {
    try {
      this.client = createClient({
        url: this.redisUrl,
        socket: {
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              console.error('Redis: Max reconnection attempts reached, using in-memory fallback');
              return new Error('Max reconnection attempts');
            }
            return Math.min(retries * 100, 3000);
          },
        },
      });

      this.client.on('error', (err) => {
        // Only log errors if we're not in the process of disconnecting
        if (this.client) {
          console.error('Redis Client Error:', err.message);
        }
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        console.log('🟢 Redis: Connecting...');
      });

      this.client.on('ready', () => {
        console.log('✅ Redis: Connected and ready');
        this.isConnected = true;
      });

      this.client.on('reconnecting', () => {
        console.log('🟡 Redis: Reconnecting...');
        this.isConnected = false;
      });

      this.client.on('end', () => {
        console.log('🔴 Redis: Connection ended');
        this.isConnected = false;
      });

      await this.client.connect();
    } catch (error) {
      console.error('❌ Redis: Connection failed, using in-memory cache fallback:', error.message);
      this.isConnected = false;
      this.client = null;
    }
  }

  /**
   * Get value from cache (Redis with in-memory fallback)
   * @param {string} key - Cache key
   * @returns {Promise<any|null>} - Cached value or null
   */
  async get(key) {
    if (this.isConnected && this.client) {
      try {
        const value = await this.client.get(key);
        if (value) {
          return JSON.parse(value);
        }
        return null;
      } catch (error) {
        console.error('Redis GET error:', error.message);
        // Fallback to in-memory cache
        return this.fallbackCache.get(key);
      }
    }
    // Fallback to in-memory cache
    return this.fallbackCache.get(key);
  }

  /**
   * Set value in cache (Redis with in-memory fallback)
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in milliseconds
   */
  async set(key, value, ttl = 5 * 60 * 1000) {
    if (this.isConnected && this.client) {
      try {
        const serialized = JSON.stringify(value);
        // Convert milliseconds to seconds for Redis
        const ttlSeconds = Math.floor(ttl / 1000);
        await this.client.setEx(key, ttlSeconds, serialized);
        return;
      } catch (error) {
        console.error('Redis SET error:', error.message);
        // Fallback to in-memory cache
        this.fallbackCache.set(key, value, ttl);
        return;
      }
    }
    // Fallback to in-memory cache
    this.fallbackCache.set(key, value, ttl);
  }

  /**
   * Delete a key from cache
   * @param {string} key - Cache key
   */
  async delete(key) {
    if (this.isConnected && this.client) {
      try {
        await this.client.del(key);
      } catch (error) {
        console.error('Redis DELETE error:', error.message);
      }
    }
    // Also delete from fallback cache
    this.fallbackCache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  async clear() {
    if (this.isConnected && this.client) {
      try {
        await this.client.flushDb();
      } catch (error) {
        console.error('Redis FLUSH error:', error.message);
      }
    }
    // Also clear fallback cache
    this.fallbackCache.clear();
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    const inMemoryStats = this.fallbackCache.getStats();
    
    if (this.isConnected && this.client) {
      try {
        const info = await this.client.info('stats');
        const keyspace = await this.client.info('keyspace');
        const dbSize = await this.client.dbSize();
        
        return {
          type: 'Redis',
          connected: true,
          dbSize,
          inMemoryFallback: inMemoryStats,
          redisInfo: {
            info: info.split('\n').slice(0, 5).join('\n'),
            keyspace: keyspace.split('\n').slice(0, 3).join('\n'),
          },
        };
      } catch (error) {
        console.error('Redis STATS error:', error.message);
      }
    }
    
    return {
      type: 'In-Memory (Redis unavailable)',
      connected: false,
      inMemory: inMemoryStats,
    };
  }

  /**
   * Check if key exists
   * @param {string} key - Cache key
   */
  async has(key) {
    if (this.isConnected && this.client) {
      try {
        const exists = await this.client.exists(key);
        return exists === 1;
      } catch (error) {
        console.error('Redis EXISTS error:', error.message);
        return this.fallbackCache.has(key);
      }
    }
    return this.fallbackCache.has(key);
  }

  /**
   * Disconnect from Redis
   */
  async disconnect() {
    if (this.client) {
      try {
        if (this.isConnected) {
          await this.client.quit();
          console.log('Redis: Disconnected gracefully');
        } else {
          // If not connected, just close the connection
          await this.client.quit().catch(() => {});
        }
        this.isConnected = false;
        this.client = null;
      } catch (error) {
        // Ignore errors during disconnect (connection might already be closed)
        this.isConnected = false;
        this.client = null;
      }
    }
  }
}

// Export singleton instance
export default new RedisCacheService();

