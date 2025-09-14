import createClient from 'openapi-fetch';
import type { paths } from './schema';
import { OneTokenConfig } from './types';
import { GlobalConfig, Logger } from '@acpms/common';
import { RedisCachedClient } from '../RedisCachedClient';
import crypto from 'crypto';
import { SocksProxyAgent } from 'socks-proxy-agent';
import fetch from 'node-fetch';

type ApiResponse<
  Path extends keyof paths,
  Method extends keyof paths[Path],
  Status extends number = 200,
> = Method extends keyof paths[Path]
  ? paths[Path][Method] extends { responses: infer R }
    ? Status extends keyof R
      ? R[Status] extends { content: { 'application/json': infer T } }
        ? T
        : never
      : never
    : never
  : never;

export type ListPortfolioResponse = ApiResponse<'/fundv3/openapi/portfolio/list-portfolio', 'get'>;
export type ListExchangeAccountResponse = ApiResponse<'/cefiacc/openapi/list-exchange-account', 'post'>;
export type ListCustodyAccountResponse = ApiResponse<'/cefiacc/openapi/list-custody-account', 'post'>;
export type ListAllAccountsResponse = ApiResponse<'/tradeacc/list-all-accounts', 'get'>;
export type GetPortfolioHistoricalNavResponse = ApiResponse<'/fundv3/openapi/portfolio/get-historical-nav', 'post'>;
export type GetAssetPositionResponse = ApiResponse<'/anp/openapi/account/get-asset-position', 'post'>;
export type GetCryptocurrenciesResponse = ApiResponse<'/quote/cryptocurrencies', 'get'>;
export type GetLastPriceBeforeTimestampResponse = ApiResponse<'/quote/last-price-before-timestamp', 'get'>;

/**
 * Create 1Token authentication middleware
 */
const createOneTokenAuthMiddleware = (config: OneTokenConfig, logger: Logger) => {
  const generateSignature = (verb: string, path: string, timestamp: number, data: string = ''): string => {
    const message = verb + path + timestamp + data;
    const secret = Buffer.from(config.apiSecret, 'base64');
    const signature = crypto.createHmac('sha256', secret).update(message).digest('base64');

    return signature;
  };

  return async ({ request, options }: any) => {
    // Generate timestamp
    const timestamp = Math.floor(Date.now() / 1000);

    // Extract method and path
    const url = new URL(request.url);
    // Remove the base URL path from the pathname to get just the API path
    const baseUrlPath = new URL(config.baseUrl || '').pathname;
    let path = url.pathname;
    if (baseUrlPath && path.startsWith(baseUrlPath)) {
      path = path.substring(baseUrlPath.length);
    }
    // Add query string but decode URL-encoded parameters for signature
    let queryString = url.search;
    if (queryString) {
      queryString = decodeURIComponent(queryString);
    }
    path = path + queryString;
    const method = request.method.toUpperCase();

    // Get request body from options (openapi-fetch provides it here)
    let body = '';

    // Check if there's a body in the request itself (for JSON requests)
    const contentType = request.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      // For JSON requests, openapi-fetch sets the body on the request
      // We need to clone the request to read the body without consuming it
      const clonedRequest = request.clone();
      try {
        body = await clonedRequest.text();
      } catch (e) {
        logger.debug('Could not read body from request', e);
      }
    }

    // If we couldn't get the body from the request, try options
    if (!body && options.body) {
      if (typeof options.body === 'string') {
        body = options.body;
      } else if (options.body instanceof FormData) {
        // FormData not supported for signature
        logger.warn('FormData body not supported for signature generation');
      } else {
        // It's likely already a JSON string or buffer
        body = options.body.toString();
      }
    }

    // Generate signature
    const signature = generateSignature(method, path, timestamp, body);

    // Add authentication headers
    request.headers.set('Api-Timestamp', timestamp.toString());
    request.headers.set('Api-Key', config.apiKey);
    request.headers.set('Api-Signature', signature);

    return request;
  };
};

/**
 * Create custom fetch function with SOCKS5 proxy support
 */
const createFetchWithProxy = (
  config: OneTokenConfig,
  logger: Logger
): ((input: Request) => Promise<Response>) | undefined => {
  if (!config.proxy) {
    return undefined;
  }

  const { host, port, username, password } = config.proxy;

  // Create SOCKS5 proxy URL
  let proxyUrl = `socks5://`;
  if (username && password) {
    proxyUrl += `${username}:${password}@`;
  }
  proxyUrl += `${host}:${port}`;

  // Create proxy agent
  const agent = new SocksProxyAgent(proxyUrl);

  logger.info(`Configured SOCKS5 proxy: ${host}:${port}`);

  // Return custom fetch that uses the proxy agent
  return async (input: Request) => {
    // Convert Request to URL and init for node-fetch
    const url = input.url;
    const init: any = {
      method: input.method,
      headers: Object.fromEntries(input.headers.entries()),
      agent,
    };

    // Add body if present
    if (input.body) {
      init.body = await input.text();
    }

    const response = await fetch(url, init);
    return response as unknown as Response;
  };
};

/**
 * 1Token API Client
 *
 * This class provides a client for interacting with the 1Token API.
 * It handles authentication, proxy support, and caching of API calls.
 */
export class OneTokenClient extends RedisCachedClient {
  private client: ReturnType<typeof createClient<paths>>;
  private oneTokenConfig: OneTokenConfig;

  constructor(config: OneTokenConfig, globalConfig: GlobalConfig) {
    super(globalConfig, 'OneTokenClient');
    this.oneTokenConfig = config;

    // Create custom fetch with proxy support if configured
    const customFetch = createFetchWithProxy(this.oneTokenConfig, this.logger);

    // Initialize openapi-fetch client
    this.client = createClient<paths>({
      baseUrl: this.oneTokenConfig.baseUrl || 'https://www.1tokencam.com/api/v1',
      headers: {
        'Content-Type': 'application/json',
      },
      // Use custom fetch if proxy is configured
      ...(customFetch && { fetch: customFetch }),
    });

    // Add authentication middleware
    this.client.use({
      onRequest: createOneTokenAuthMiddleware(this.oneTokenConfig, this.logger),
    });
  }

  /**
   * Get the raw openapi-fetch client for direct API calls
   */
  getClient() {
    return this.client;
  }

  /**
   * Simple helper to log API calls
   */
  private async logApiCall(
    httpMethod: string,
    endpoint: string,
    requestData: any,
    responseData: any,
    duration: number,
    queryParams?: Record<string, any>
  ) {
    let fullUrl = `${this.oneTokenConfig.baseUrl}${endpoint}`;

    // Add query parameters to URL if provided
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

  async listExchangeAccounts(options?: {
    department?: string;
    venueNames?: string[];
    pageSize?: number;
    pageIndex?: number;
  }) {
    const startTime = Date.now();
    const requestData = {
      venue_name_list: options?.venueNames || [],
      page_size: options?.pageSize || 30,
      page_index: options?.pageIndex || 1,
    };

    const { data, error } = await this.client.POST('/cefiacc/openapi/list-exchange-account', {
      params: {
        query: options?.department ? { department: options.department } : {},
      },
      body: requestData,
    });

    const queryParams = options?.department ? { department: options.department } : {};
    await this.logApiCall(
      'POST',
      '/cefiacc/openapi/list-exchange-account',
      requestData,
      { data, error },
      Date.now() - startTime,
      queryParams
    );

    if (error) {
      throw new Error(`Failed to list exchange accounts: ${error.message || 'Unknown error'}`);
    }

    return data;
  }

  async listCustodyAccounts(options?: {
    department?: string;
    venueNames?: string[];
    pageSize?: number;
    pageIndex?: number;
  }) {
    const startTime = Date.now();
    const requestData = {
      venue_name_list: options?.venueNames || [],
      page_size: options?.pageSize || 30,
      page_index: options?.pageIndex || 1,
    };

    const { data, error } = await this.client.POST('/cefiacc/openapi/list-custody-account', {
      params: {
        query: options?.department ? { department: options.department } : {},
      },
      body: requestData,
    });

    const queryParams = options?.department ? { department: options.department } : {};
    await this.logApiCall(
      'POST',
      '/cefiacc/openapi/list-custody-account',
      requestData,
      { data, error },
      Date.now() - startTime,
      queryParams
    );

    if (error) {
      throw new Error(`Failed to list custody accounts: ${error.message || 'Unknown error'}`);
    }

    return data;
  }

  async listAllAccountsDeprecated() {
    const startTime = Date.now();
    const { data, error } = await this.client.GET('/tradeacc/list-all-accounts');

    await this.logApiCall('GET', '/tradeacc/list-all-accounts', null, { data, error }, Date.now() - startTime, {});

    if (error) {
      throw new Error(`Failed to list accounts: ${JSON.stringify(error)}`);
    }

    return data;
  }

  async listPortfolios(options?: { department?: string }) {
    const startTime = Date.now();
    const { data, error } = await this.client.GET('/fundv3/openapi/portfolio/list-portfolio', {
      params: {
        query: options?.department ? { department: options.department } : {},
      },
    });

    const queryParams = options?.department ? { department: options.department } : {};
    await this.logApiCall(
      'GET',
      '/fundv3/openapi/portfolio/list-portfolio',
      options,
      { data, error },
      Date.now() - startTime,
      queryParams
    );

    if (error) {
      throw new Error(`Failed to list portfolios: ${JSON.stringify(error)}`);
    }

    return data;
  }

  async fetchAccountAssetPositions(accountNames: string[], department?: string) {
    const startTime = Date.now();
    const requestData = { account_list: accountNames };

    const { data, error } = await this.client.POST('/anp/openapi/account/get-asset-position', {
      params: {
        query: department ? { department } : {},
      },
      body: requestData,
    });

    const queryParams = department ? { department } : {};
    await this.logApiCall(
      'POST',
      '/anp/openapi/account/get-asset-position',
      requestData,
      { data, error },
      Date.now() - startTime,
      queryParams
    );

    if (error) {
      throw new Error(`Failed to fetch account asset positions: ${JSON.stringify(error)}`);
    }

    return data;
  }

  async getPortfolioHistoricalNav(options: {
    fundName: string;
    startTime: number;
    endTime: number;
    frequency: 'daily' | 'hourly';
    offset?: string;
    department?: string;
  }) {
    const apiCallStartTime = Date.now();
    const requestData = {
      fund_name: options.fundName,
      start_time: options.startTime,
      end_time: options.endTime,
      frequency: options.frequency,
      ...(options.offset && { offset: options.offset }),
    };

    const { data, error } = await this.client.POST('/fundv3/openapi/portfolio/get-historical-nav', {
      params: {
        query: options.department ? { department: options.department } : {},
      },
      body: requestData,
    });

    const queryParams = options.department ? { department: options.department } : {};
    await this.logApiCall(
      'POST',
      '/fundv3/openapi/portfolio/get-historical-nav',
      requestData,
      { data, error },
      Date.now() - apiCallStartTime,
      queryParams
    );

    if (error) {
      throw new Error(`Failed to get portfolio historical NAV: ${error.message || 'Unknown error'}`);
    }

    return data;
  }

  async getCryptocurrencies(options?: {
    symbols?: string;
    department?: string;
  }) {
    const startTime = Date.now();

    const { data, error } = await this.client.GET('/quote/cryptocurrencies', {
      params: {
        query: {
          ...(options?.symbols && { symbols: options.symbols }),
          ...(options?.department && { department: options.department }),
        },
      },
    });

    const queryParams: Record<string, any> = {};
    if (options?.symbols) queryParams.symbols = options.symbols;
    if (options?.department) queryParams.department = options.department;

    await this.logApiCall(
      'GET',
      '/quote/cryptocurrencies',
      options,
      { data, error },
      Date.now() - startTime,
      queryParams
    );

    if (error) {
      throw new Error(`Failed to get cryptocurrencies: ${JSON.stringify(error)}`);
    }

    return data;
  }

  async getLastPriceBeforeTimestamp(options: {
    currency: string;
    exchange: 'index' | 'cmc';
    timestamp: string;
    department?: string;
  }) {
    const startTime = Date.now();

    const { data, error } = await this.client.GET('/quote/last-price-before-timestamp', {
      params: {
        query: {
          currency: options.currency,
          exchange: options.exchange,
          timestamp: options.timestamp,
          ...(options.department && { department: options.department }),
        },
      },
    });

    const queryParams: Record<string, any> = {
      currency: options.currency,
      exchange: options.exchange,
      timestamp: options.timestamp,
    };
    if (options.department) queryParams.department = options.department;

    await this.logApiCall(
      'GET',
      '/quote/last-price-before-timestamp',
      options,
      { data, error },
      Date.now() - startTime,
      queryParams
    );

    if (error) {
      throw new Error(`Failed to get last price before timestamp: ${JSON.stringify(error)}`);
    }

    return data;
  }
}
