# Caching Implementation

## Overview

The application uses **Redis caching** with automatic fallback to **in-memory caching** if Redis is unavailable.

## Why Redis?

✅ **Better for Production:**
- **Shared cache** across multiple server instances (Render can scale horizontally)
- **Persistent** across server restarts
- **Better performance** for high-traffic applications
- **Scalable** - can handle large cache sizes

## Configuration

### Environment Variable

Set the `REDIS_URL` environment variable in your Render dashboard:

```
REDIS_URL=redis://default:FaeNDtkwl74GyCJ12H6yIo4D2HAw5nBq@redis-14966.c301.ap-south-1-1.ec2.cloud.redislabs.com:14966
```

If `REDIS_URL` is not set, the application will automatically fall back to in-memory caching.

## How It Works

1. **Redis Connection**: On server start, attempts to connect to Redis
2. **Fallback**: If Redis is unavailable, automatically uses in-memory cache
3. **Transparent**: All controllers use the same cache interface - no code changes needed

## Cached Endpoints

- `GET /api/student/boards` - Boards list (5 min TTL)
- `GET /api/subject` - Subjects list (5 min TTL)
- `GET /api/exams` - Exams list, first page only (5 min TTL)

## Cache Management

### View Cache Statistics
```bash
GET /api/cache/stats
```

Response:
```json
{
  "cache": {
    "type": "Redis",
    "connected": true,
    "dbSize": 10,
    "inMemoryFallback": { ... }
  }
}
```

### Clear Cache
```bash
DELETE /api/cache/clear
```

## Performance Benefits

- **Faster Response Times**: Cached responses return in < 10ms
- **Reduced Database Load**: Fewer MongoDB queries
- **Better Scalability**: Handles more concurrent requests
- **Automatic Expiration**: Data stays fresh with TTL

## Monitoring

Check the server logs for cache status:
- `✅ Redis: Connected and ready` - Redis is active
- `❌ Redis: Connection failed, using in-memory cache fallback` - Using fallback
- `⚡ Cache HIT` - Response served from cache
- `💾 Cache MISS` - Response fetched from database

