import { Logger } from '@nestjs/common';
import { Cache } from 'cache-manager';
import createClient from 'openapi-fetch';
import type { paths as OneTokenPaths } from '../schemas/schema';
import { OneTokenConfig } from '../types';
import crypto from 'crypto';
import { SocksProxyAgent } from 'socks-proxy-agent';
import fetch from 'node-fetch';

/**
 * Base 1Token Client class that can be instantiated multiple times
 * for different share classes with different API credentials
 */
export class OneTokenBaseClient {
  protected readonly logger: Logger;
  protected readonly oneTokenConfig: OneTokenConfig;
  protected readonly client: ReturnType<typeof createClient<OneTokenPaths>>;
  protected readonly cacheManager?: Cache;
  protected readonly clientName: string;

  private useMiddleware = false;

  constructor(
    config: OneTokenConfig,
    cacheManager?: Cache,
    clientName: string = 'OneTokenBaseClient'
  ) {
    this.oneTokenConfig = config;
    this.cacheManager = cacheManager;
    this.clientName = clientName;
    this.logger = new Logger(clientName);

    const customFetch = this.createFetchWithProxy();

    this.client = createClient<OneTokenPaths>({
      baseUrl: this.oneTokenConfig.baseUrl || 'https://www.1tokencam.com/api/v1',
      headers: {
        'Content-Type': 'application/json',
      },
      ...(customFetch && { fetch: customFetch }),
    });

    // Add authentication middleware if supported
    try {
      (this.client as any).use({
        onRequest: this.createAuthMiddleware(),
      });
      this.useMiddleware = true;
      this.logger.debug('OneToken client using middleware-based authentication');
    } catch (error) {
      this.useMiddleware = false;
      this.logger.debug('OneToken client will use header-based authentication');
    }
  }

  private createAuthMiddleware() {
    return async ({ request, options }: { request: Request; options: any }) => {
      const timestamp = Math.floor(Date.now() / 1000);
      const url = new URL(request.url);
      const baseUrlPath = new URL(this.oneTokenConfig.baseUrl || '').pathname;

      let path = url.pathname;
      if (baseUrlPath && path.startsWith(baseUrlPath)) {
        path = path.substring(baseUrlPath.length);
      }

      let queryString = url.search;
      if (queryString) {
        queryString = decodeURIComponent(queryString);
      }

      path = path + queryString;
      const method = request.method.toUpperCase();
      let body = '';

      const contentType = request.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        const clonedRequest = request.clone();
        try {
          body = await clonedRequest.text();
        } catch (e) {
          this.logger.debug('Could not read body from request', e);
        }
      }

      if (!body && options.body) {
        if (typeof options.body === 'string') {
          body = options.body;
        } else {
          body = options.body.toString();
        }
      }

      const signature = this.generateSignature(method, path, timestamp, body);

      request.headers.set('Api-Timestamp', timestamp.toString());
      request.headers.set('Api-Key', this.oneTokenConfig.apiKey);
      request.headers.set('Api-Signature', signature);

      return request;
    };
  }

  private generateSignature(verb: string, path: string, timestamp: number, data: string = ''): string {
    const message = verb + path + timestamp + data;
    const secret = Buffer.from(this.oneTokenConfig.apiSecret, 'base64');
    const signature = crypto.createHmac('sha256', secret).update(message).digest('base64');
    return signature;
  }

  private createFetchWithProxy() {
    if (!this.oneTokenConfig.proxy) {
      return undefined;
    }

    const { host, port, username, password } = this.oneTokenConfig.proxy;
    let proxyUrl = `socks5://`;

    if (username && password) {
      proxyUrl += `${username}:${password}@`;
    }
    proxyUrl += `${host}:${port}`;

    const agent = new SocksProxyAgent(proxyUrl);
    this.logger.log(`Configured SOCKS5 proxy: ${host}:${port}`);

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

    let fullUrl = `${this.oneTokenConfig.baseUrl}${endpoint}`;

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

  /**
   * Get authentication headers for OneToken API requests
   */
  private async getAuthHeaders(): Promise<Record<string, string>> {
    const timestamp = Math.floor(Date.now() / 1000);
    const path = '/fundv3/openapi/portfolio/list-portfolio';
    const method = 'GET';
    const body = '';

    const signature = this.generateSignature(method, path, timestamp, body);

    return {
      'Api-Timestamp': timestamp.toString(),
      'Api-Key': this.oneTokenConfig.apiKey,
      'Api-Signature': signature,
    };
  }

  // API Methods
  async listPortfolios(options?: { department?: string }) {
    const startTime = Date.now();

    const requestOptions: any = {
      params: {
        query: options?.department ? { department: options.department } : {},
      },
    };

    // Add auth headers if not using middleware
    if (!this.useMiddleware) {
      requestOptions.headers = await this.getAuthHeaders();
    }

    const { data, error } = await this.client.GET('/fundv3/openapi/portfolio/list-portfolio', requestOptions);

    const queryParams = options?.department ? { department: options.department } : {};
    await this.logApiCall('GET', '/fundv3/openapi/portfolio/list-portfolio', options, { data, error }, Date.now() - startTime, queryParams);

    if (error) {
      this.logger.error('Failed to list OneToken portfolios', { error, options });
      throw new Error(`Failed to list portfolios: ${JSON.stringify(error)}`);
    }

    this.logger.debug(`Successfully retrieved portfolios`, {
      portfolioCount: data?.result?.fund_info_list?.length || 0,
      department: options?.department
    });

    return data;
  }

  // Add other API methods as needed...
  // (getPortfolioHistoricalNav, getCryptocurrencies, etc.)

  /**
   * Get the underlying API client for direct access
   */
  getClient(): ReturnType<typeof createClient<OneTokenPaths>> {
    return this.client;
  }
}