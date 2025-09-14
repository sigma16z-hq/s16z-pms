import Redis from 'ioredis';
import { createLogger, type IGlobalConfig } from '@acpms/common';

export interface ApiRequestLog {
  timestamp: number;
  clientName: string;
  httpMethod: string;
  url: string;
  body?: any;
}

export interface ApiResponseLog {
  timestamp: number;
  clientName: string;
  status: number;
  body?: any;
  duration: number;
}

export interface ApiLogEntry {
  id: string;
  status: 'ok' | 'error';
  request: ApiRequestLog;
  response?: ApiResponseLog;
  error?: {
    message: string;
    stack?: string;
    timestamp: number;
  };
}

export abstract class RedisCachedClient {
  protected redis: Redis;
  protected logger = createLogger('RedisCachedClient');
  protected clientName: string;
  protected config: IGlobalConfig;

  constructor(config: IGlobalConfig, clientName: string) {
    this.config = config;
    this.clientName = clientName;

    // Initialize Redis connection
    this.redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
      keyPrefix: config.redis.keyPrefix,
      maxRetriesPerRequest: 3,
    });

    this.redis.on('error', error => {
      this.logger.error('Redis connection error:', error);
    });

    this.redis.on('connect', () => {
      this.logger.info('Connected to Redis');
    });
  }

  /**
   * Generate a unique request ID for tracking
   * Format: clientName:api_path:timestamp-random_chars
   */
  protected generateRequestId(endpoint: string): string {
    // Extract the last path segment from endpoint
    const pathSegments = endpoint.split('/').filter(segment => segment.length > 0);
    const apiPath = pathSegments[pathSegments.length - 1] || 'unknown';

    const timestamp = Date.now();
    const randomChars = Math.random().toString(36).substring(2, 11);

    return `${this.clientName}:${apiPath}:${timestamp}-${randomChars}`;
  }

  /**
   * Log API request to Redis
   */
  protected async logRequest(requestId: string, httpMethod: string, url: string, body?: any): Promise<void> {
    try {
      const requestLog: ApiRequestLog = {
        timestamp: Date.now(),
        clientName: this.clientName,
        httpMethod,
        url,
        body,
      };

      const logEntry: ApiLogEntry = {
        id: requestId,
        status: 'ok',
        request: requestLog,
      };

      // Store in Redis with TTL (7 days)
      const key = `api_logs:${requestId}`;
      await this.redis.setex(key, 7 * 24 * 60 * 60, JSON.stringify(logEntry));

      // Add to request timeline for scanning
      const timelineKey = `api_timeline:${this.clientName}`;
      await this.redis.zadd(timelineKey, Date.now(), requestId);

      // Keep only last 10000 entries in timeline
      await this.redis.zremrangebyrank(timelineKey, 0, -10001);

      this.logger.debug(
        `Logged request ${requestId}; Method=${httpMethod}; Url=${url.substring(0, 100)}; HasBody=${!!body}`
      );
    } catch (error) {
      this.logger.error('Failed to log request to Redis:', error);
    }
  }

  /**
   * Log API response to Redis
   */
  protected async logResponse(
    requestId: string,
    status: number,
    body: any,
    duration: number,
    error?: Error
  ): Promise<void> {
    try {
      const key = `api_logs:${requestId}`;
      const existingLogStr = await this.redis.get(key);

      if (!existingLogStr) {
        this.logger.warn(`No existing request log found for ${requestId}`);
        return;
      }

      const logEntry: ApiLogEntry = JSON.parse(existingLogStr);

      if (error) {
        logEntry.status = 'error';
        logEntry.error = {
          message: error.message,
          stack: error.stack,
          timestamp: Date.now(),
        };
      } else {
        logEntry.status = 'ok';
        logEntry.response = {
          timestamp: Date.now(),
          status,
          body,
          duration,
          clientName: this.clientName,
        };
      }

      // Update in Redis with same TTL
      await this.redis.setex(key, 7 * 24 * 60 * 60, JSON.stringify(logEntry));

      this.logger.debug(`Logged response ${requestId}; Status=${status}; Duration=${duration}ms; HasError=${!!error}`);
    } catch (logError) {
      this.logger.error('Failed to log response to Redis:', logError);
    }
  }

  /**
   * Get API logs for a specific time range
   */
  public async getApiLogs(startTime?: number, endTime?: number, limit: number = 100): Promise<ApiLogEntry[]> {
    try {
      const timelineKey = `api_timeline:${this.clientName}`;
      const start = startTime || 0;
      const end = endTime || Date.now();

      // Get request IDs from timeline within time range
      const requestIds = await this.redis.zrangebyscore(timelineKey, start, end, 'LIMIT', 0, limit);

      // Fetch full log entries
      const logs: ApiLogEntry[] = [];
      for (const requestId of requestIds) {
        const key = `api_logs:${requestId}`;
        const logStr = await this.redis.get(key);
        if (logStr) {
          logs.push(JSON.parse(logStr));
        }
      }

      return logs.sort((a, b) => b.request.timestamp - a.request.timestamp);
    } catch (error) {
      this.logger.error('Failed to get API logs from Redis:', error);
      return [];
    }
  }

  /**
   * Clean up old API logs
   */
  public async cleanupOldLogs(olderThanDays: number = 7): Promise<void> {
    try {
      const cutoffTime = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
      const timelineKey = `api_timeline:${this.clientName}`;

      // Get old request IDs
      const oldRequestIds = await this.redis.zrangebyscore(timelineKey, 0, cutoffTime);

      // Delete old log entries
      for (const requestId of oldRequestIds) {
        await this.redis.del(`api_logs:${requestId}`);
      }

      // Remove from timeline
      await this.redis.zremrangebyscore(timelineKey, 0, cutoffTime);

      this.logger.info(`Cleaned up ${oldRequestIds.length} old API logs`);
    } catch (error) {
      this.logger.error('Failed to cleanup old logs:', error);
    }
  }

  /**
   * Close Redis connection
   */
  public async disconnect(): Promise<void> {
    try {
      await this.redis.quit();
      this.logger.info('Redis connection closed');
    } catch (error) {
      this.logger.error('Error closing Redis connection:', error);
    }
  }
}
