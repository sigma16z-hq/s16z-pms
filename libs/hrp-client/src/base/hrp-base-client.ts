import { Logger } from '@nestjs/common';
import { Cache } from 'cache-manager';
import createClient from 'openapi-fetch';
import type { paths as HRPDataPaths } from '../schemas/data/schema';
import { HRPConfig } from '../types';
import { HRPAuthClient } from '../auth/hrp-auth-client';
import { SocksProxyAgent } from 'socks-proxy-agent';
import fetch from 'node-fetch';

/**
 * Base HRP Client class that can be instantiated multiple times
 * for different share classes with different credentials
 */
export class HRPBaseClient {
  protected readonly logger: Logger;
  protected readonly hrpConfig: HRPConfig;
  protected readonly authClient: HRPAuthClient;
  protected readonly client: ReturnType<typeof createClient<HRPDataPaths>>;
  protected readonly customFetch: ((input: any) => Promise<any>) | undefined;
  protected readonly cacheManager?: Cache;
  protected readonly clientName: string;

  constructor(
    config: HRPConfig,
    cacheManager?: Cache,
    clientName: string = 'HRPBaseClient'
  ) {
    this.hrpConfig = config;
    this.cacheManager = cacheManager;
    this.clientName = clientName;
    this.logger = new Logger(clientName);

    // Create auth client
    this.authClient = new HRPAuthClient(config);

    // Create fetch with proxy if needed
    this.customFetch = this.createFetchWithProxy();

    // Create the API client
    this.client = createClient<HRPDataPaths>({
      baseUrl: this.hrpConfig.dataBaseUrl || 'https://api.hiddenroad.com',
      headers: {
        'Content-Type': 'application/json',
      },
      fetch: this.customFetch,
    });

    // Add auth middleware
    this.client.use({
      onRequest: this.createAuthMiddleware(),
    });
  }

  private createAuthMiddleware() {
    return async ({ request }: { request: Request }) => {
      try {
        const accessToken = await this.authClient.getAccessToken();
        request.headers.set('Authorization', `Bearer ${accessToken}`);
        return request;
      } catch (error) {
        this.logger.error('Failed to authenticate HRP request', { error });
        throw error;
      }
    };
  }

  private createFetchWithProxy() {
    if (!this.hrpConfig.proxy) {
      return async (input: any) => {
        const url = input.url;
        const init = {
          method: input.method,
          headers: Object.fromEntries(input.headers.entries()),
        } as any;

        if (input.body) {
          init.body = await input.text();
        }

        const response = await fetch(url, init);
        return response as any;
      };
    }

    const { host, port, username, password } = this.hrpConfig.proxy;
    let proxyUrl = `socks5://`;

    if (username && password) {
      proxyUrl += `${username}:${password}@`;
    }
    proxyUrl += `${host}:${port}`;

    const agent = new SocksProxyAgent(proxyUrl);
    this.logger.log(`Configured SOCKS5 proxy for HRP data: ${host}:${port}`);

    return async (input: any) => {
      const url = input.url;
      const init = {
        method: input.method,
        headers: Object.fromEntries(input.headers.entries()),
        agent,
      } as any;

      if (input.body) {
        init.body = await input.text();
      }

      const response = await fetch(url, init);
      return response as any;
    };
  }

  // Cache-related utility methods (optional, only if cache manager provided)
  protected generateRequestId(endpoint: string): string {
    const pathSegments = endpoint.split('/').filter(segment => segment.length > 0);
    const apiPath = pathSegments[pathSegments.length - 1] || 'unknown';
    const timestamp = Date.now();
    const randomChars = Math.random().toString(36).substring(2, 11);
    return `${this.clientName}:${apiPath}:${timestamp}-${randomChars}`;
  }

  protected async logApiCall(
    httpMethod: string,
    endpoint: string,
    requestData: any,
    responseData: any,
    duration: number,
    queryParams?: Record<string, any>
  ) {
    if (!this.cacheManager) {
      return; // Skip logging if no cache manager
    }

    let fullUrl = `${this.hrpConfig.dataBaseUrl || 'https://api.hiddenroad.com'}${endpoint}`;

    if (queryParams && Object.keys(queryParams).length > 0) {
      const queryString = new URLSearchParams();
      Object.entries(queryParams).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryString.append(key, String(value));
        }
      });
      if (queryString.toString()) {
        fullUrl += `?${queryString.toString()}`;
      }
    }

    const requestId = this.generateRequestId(endpoint);
    await this.logRequest(requestId, httpMethod, fullUrl, requestData);
    await this.logResponse(requestId, 200, responseData, duration);
  }

  protected async logRequest(requestId: string, httpMethod: string, url: string, body: any) {
    if (!this.cacheManager) return;

    try {
      const requestLog = {
        timestamp: Date.now(),
        clientName: this.clientName,
        httpMethod,
        url,
        body,
      };

      const logEntry = {
        id: requestId,
        status: 'ok',
        request: requestLog,
      };

      const key = `api_logs:${requestId}`;
      await this.cacheManager.set(key, logEntry, 7 * 24 * 60 * 60 * 1000);

      this.logger.debug(`Logged request ${requestId}; Method=${httpMethod}; Url=${url.substring(0, 100)}; HasBody=${!!body}`);
    } catch (error) {
      this.logger.error('Failed to log request to cache:', error);
    }
  }

  protected async logResponse(requestId: string, status: number, body: any, duration: number, error?: Error) {
    if (!this.cacheManager) return;

    try {
      const key = `api_logs:${requestId}`;
      const existingLog = await this.cacheManager.get(key) as any;

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

  // API Methods
  async listAccounts() {
    const startTime = Date.now();

    const { data, error } = await this.client.GET('/v0/accountactivity/accounts', {
      params: {},
    });

    await this.logApiCall('GET', '/v0/accountactivity/accounts', null, { data, error }, Date.now() - startTime);

    if (error) {
      throw new Error(`Failed to list accounts: ${JSON.stringify(error)}`);
    }

    if (!data?.results) {
      throw new Error('Invalid response format: missing results');
    }

    return data.results;
  }

  // Add other API methods as needed...
  // (fetchTradesPage, fetchAllTrades, etc.)

  /**
   * Get the underlying API client for direct access
   */
  getClient() {
    return this.client;
  }

  /**
   * Get the auth client for token management
   */
  getAuthClient() {
    return this.authClient;
  }
}