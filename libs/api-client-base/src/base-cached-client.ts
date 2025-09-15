import { Injectable, Inject, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

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

@Injectable()
export abstract class BaseCachedClient {
  protected readonly logger: Logger;
  protected readonly clientName: string;

  constructor(
    @Inject(CACHE_MANAGER) protected readonly cacheManager: Cache,
    clientName: string
  ) {
    this.clientName = clientName;
    this.logger = new Logger(clientName);
  }

  protected generateRequestId(endpoint: string): string {
    const pathSegments = endpoint.split('/').filter(segment => segment.length > 0);
    const apiPath = pathSegments[pathSegments.length - 1] || 'unknown';
    const timestamp = Date.now();
    const randomChars = Math.random().toString(36).substring(2, 11);
    return `${this.clientName}:${apiPath}:${timestamp}-${randomChars}`;
  }

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

      const key = `api_logs:${requestId}`;
      await this.cacheManager.set(key, logEntry, 7 * 24 * 60 * 60 * 1000); // 7 days TTL

      const timelineKey = `api_timeline:${this.clientName}`;
      const existingTimeline = (await this.cacheManager.get<string[]>(timelineKey)) || [];
      existingTimeline.push(requestId);

      // Keep only last 10000 entries
      if (existingTimeline.length > 10000) {
        existingTimeline.splice(0, existingTimeline.length - 10000);
      }

      await this.cacheManager.set(timelineKey, existingTimeline, 7 * 24 * 60 * 60 * 1000);

      this.logger.debug(
        `Logged request ${requestId}; Method=${httpMethod}; Url=${url.substring(0, 100)}; HasBody=${!!body}`
      );
    } catch (error) {
      this.logger.error('Failed to log request to cache:', error);
    }
  }

  protected async logResponse(
    requestId: string,
    status: number,
    body: any,
    duration: number,
    error?: Error
  ): Promise<void> {
    try {
      const key = `api_logs:${requestId}`;
      const existingLog = await this.cacheManager.get<ApiLogEntry>(key);

      if (!existingLog) {
        this.logger.warn(`No existing request log found for ${requestId}`);
        return;
      }

      if (error) {
        existingLog.status = 'error';
        existingLog.error = {
          message: error.message,
          stack: error.stack,
          timestamp: Date.now(),
        };
      } else {
        existingLog.status = 'ok';
        existingLog.response = {
          timestamp: Date.now(),
          status,
          body,
          duration,
          clientName: this.clientName,
        };
      }

      await this.cacheManager.set(key, existingLog, 7 * 24 * 60 * 60 * 1000);

      this.logger.debug(`Logged response ${requestId}; Status=${status}; Duration=${duration}ms; HasError=${!!error}`);
    } catch (logError) {
      this.logger.error('Failed to log response to cache:', logError);
    }
  }

  public async getApiLogs(startTime?: number, endTime?: number, limit: number = 100): Promise<ApiLogEntry[]> {
    try {
      const timelineKey = `api_timeline:${this.clientName}`;
      const timeline = (await this.cacheManager.get<string[]>(timelineKey)) || [];

      const logs: ApiLogEntry[] = [];
      for (const requestId of timeline.slice(-limit)) {
        const key = `api_logs:${requestId}`;
        const log = await this.cacheManager.get<ApiLogEntry>(key);
        if (log) {
          const requestTime = log.request.timestamp;
          if ((!startTime || requestTime >= startTime) && (!endTime || requestTime <= endTime)) {
            logs.push(log);
          }
        }
      }

      return logs.sort((a, b) => b.request.timestamp - a.request.timestamp);
    } catch (error) {
      this.logger.error('Failed to get API logs from cache:', error);
      return [];
    }
  }
}