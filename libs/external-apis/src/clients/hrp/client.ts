import createClient from 'openapi-fetch';
import type { paths as DataPaths } from './data/schema';
import {
  HRPConfig,
  PaginatedResponse,
  HRPTradeEvent,
  HRPAccount,
  HRPCIPCalculation,
  HRPERSCalculation,
  HRPFinancingCalculation,
  HRPExecutionPremiumCalculation,
  HRPTransferEvent,
  HRPAdjustmentEvent,
} from './types';
import { GlobalConfig, Logger } from '@acpms/common';
import { RedisCachedClient } from '../RedisCachedClient';
import { HRPAuthClient } from './auth-client';
import { SocksProxyAgent } from 'socks-proxy-agent';
import fetch from 'node-fetch';

type ApiResponse<
  Path extends keyof DataPaths,
  Method extends keyof DataPaths[Path],
  Status extends number = 200,
> = Method extends keyof DataPaths[Path]
  ? DataPaths[Path][Method] extends { responses: infer R }
    ? Status extends keyof R
      ? R[Status] extends { content: { 'application/json': infer T } }
        ? T
        : never
      : never
    : never
  : never;

type ListAccountsResponse = ApiResponse<'/v0/accountactivity/accounts', 'get'>;
type GetTradesResponse = ApiResponse<'/v0/accountactivity/trades', 'get'>;
type GetDepositsResponse = ApiResponse<'/v0/accountactivity/transfers/deposits', 'get'>;
type GetWithdrawalsResponse = ApiResponse<'/v0/accountactivity/transfers/withdrawals', 'get'>;

/**
 * Create HRP authentication middleware
 */
const createHRPAuthMiddleware = (authClient: HRPAuthClient, logger: Logger) => {
  return async ({ request }: any) => {
    try {
      // Get valid access token
      const accessToken = await authClient.getAccessToken();

      // Add Bearer token to Authorization header
      request.headers.set('Authorization', `Bearer ${accessToken}`);

      return request;
    } catch (error) {
      logger.error('Failed to authenticate HRP request', { error });
      throw error;
    }
  };
};

/**
 * Create custom fetch function with SOCKS5 proxy support for data client
 */
const createFetchWithProxy = (config: HRPConfig, logger: Logger): ((input: Request) => Promise<Response>) => {
  if (!config.proxy) {
    // Return a simple wrapper around fetch when no proxy is configured
    return async (input: Request) => {
      const url = input.url;
      const init: any = {
        method: input.method,
        headers: Object.fromEntries(input.headers.entries()),
      };

      // Add body if present
      if (input.body) {
        init.body = await input.text();
      }

      const response = await fetch(url, init);
      return response as unknown as Response;
    };
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

  logger.info(`Configured SOCKS5 proxy for HRP data: ${host}:${port}`);

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
 * HRP API Client
 *
 * This class provides a client for interacting with the HRP (Hidden Road Prices) API.
 * It handles authentication, proxy support, pagination, and caching of API calls.
 */
export class HRPClient extends RedisCachedClient {
  private client: ReturnType<typeof createClient<DataPaths>>;
  private hrpConfig: HRPConfig;
  private authClient: HRPAuthClient;
  private customFetch: (input: Request) => Promise<Response>;

  constructor(config: HRPConfig, globalConfig: GlobalConfig) {
    super(globalConfig, 'HRPClient');
    this.hrpConfig = config;

    // Initialize auth client
    this.authClient = new HRPAuthClient(this.hrpConfig, this.logger);

    // Create custom fetch with proxy support (always returns a function)
    this.customFetch = createFetchWithProxy(this.hrpConfig, this.logger);

    // Initialize openapi-fetch client for data API
    this.client = createClient<DataPaths>({
      baseUrl: this.hrpConfig.dataBaseUrl || 'https://api.hiddenroad.com',
      headers: {
        'Content-Type': 'application/json',
      },
      fetch: this.customFetch,
    });

    // Add authentication middleware
    this.client.use({
      onRequest: createHRPAuthMiddleware(this.authClient, this.logger),
    });
  }

  /**
   * Get the raw openapi-fetch client for direct API calls
   */
  getClient() {
    return this.client;
  }

  /**
   * Get authentication client for token management
   */
  getAuthClient() {
    return this.authClient;
  }

  /**
   * Generic pagination handler that follows next_page links
   */
  private async fetchAllPaginated<T>(
    firstPageFetcher: () => Promise<PaginatedResponse<T>>,
    nextPageFetcher: (nextPagePath: string) => Promise<PaginatedResponse<T>>,
    maxPages: number,
    dataType: string
  ): Promise<T[]> {
    const allResults: T[] = [];
    let pageCount = 0;

    this.logger.info(`Starting to fetch all ${dataType}`, { maxPages });

    // Fetch first page
    pageCount++;
    let response = await firstPageFetcher();
    allResults.push(...response.results);
    let nextPagePath = response.next_page;

    this.logger.debug(`${dataType} page ${pageCount} completed`, {
      resultsInPage: response.results.length,
      totalResults: allResults.length,
      hasNextPage: nextPagePath !== null,
    });

    // Continue fetching while next_page exists and within limits
    while (nextPagePath !== null && pageCount < maxPages) {
      pageCount++;

      this.logger.debug(`Fetching ${dataType} page ${pageCount} from: ${nextPagePath}`);

      response = await nextPageFetcher(nextPagePath);
      allResults.push(...response.results);
      nextPagePath = response.next_page;

      this.logger.debug(`${dataType} page ${pageCount} completed`, {
        resultsInPage: response.results.length,
        totalResults: allResults.length,
        hasNextPage: nextPagePath !== null,
      });
    }

    if (nextPagePath !== null && pageCount >= maxPages) {
      this.logger.warn(`Reached maximum page limit (${maxPages}) for ${dataType}, stopping pagination`);
    }

    this.logger.info(`Completed fetching all ${dataType}`, {
      totalResults: allResults.length,
      totalPages: pageCount,
    });

    return allResults;
  }

  /**
   * Fetch trades page by full URL (for pagination)
   */
  private async fetchTradesPageByUrl(nextPagePath: string): Promise<PaginatedResponse<HRPTradeEvent>> {
    const fullUrl = `${this.hrpConfig.dataBaseUrl || 'https://api.hiddenroad.com'}${nextPagePath}`;
    const startTime = Date.now();

    // Use custom fetch (proxy-aware) if available, otherwise fallback to built-in fetch
    const fetchFunction = this.customFetch || fetch;

    // Create request object for custom fetch or use regular fetch
    let response: Response;
    if (this.customFetch) {
      const request = new Request(fullUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${await this.authClient.getAccessToken()}`,
          'Content-Type': 'application/json',
        },
      });
      response = await this.customFetch(request);
    } else {
      response = await fetch(fullUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${await this.authClient.getAccessToken()}`,
          'Content-Type': 'application/json',
        },
      });
    }

    const data = await response.json();
    const duration = Date.now() - startTime;

    await this.logApiCall('GET', nextPagePath, null, { data }, duration);

    if (!response.ok) {
      throw new Error(`Failed to fetch trades from URL: ${response.status} ${response.statusText}`);
    }

    if (!data?.results) {
      throw new Error('Invalid response format: missing results');
    }

    return {
      results: data.results,
      next_page: data.next_page || null,
    };
  }

  /**
   * Fetch deposits page by full URL (for pagination)
   */
  private async fetchDepositsPageByUrl(nextPagePath: string): Promise<PaginatedResponse<HRPTransferEvent>> {
    const fullUrl = `${this.hrpConfig.dataBaseUrl || 'https://api.hiddenroad.com'}${nextPagePath}`;
    const startTime = Date.now();

    // Use custom fetch function (handles proxy if configured)
    const request = new Request(fullUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${await this.authClient.getAccessToken()}`,
        'Content-Type': 'application/json',
      },
    });
    const response = await this.customFetch(request);

    const data = await response.json();
    const duration = Date.now() - startTime;

    await this.logApiCall('GET', nextPagePath, null, { data }, duration);

    if (!response.ok) {
      throw new Error(`Failed to fetch deposits from URL: ${response.status} ${response.statusText}`);
    }

    if (!data?.results) {
      throw new Error('Invalid response format: missing results');
    }

    return {
      results: data.results,
      next_page: data.next_page || null,
    };
  }

  /**
   * Fetch withdrawals page by full URL (for pagination)
   */
  private async fetchWithdrawalsPageByUrl(nextPagePath: string): Promise<PaginatedResponse<HRPTransferEvent>> {
    const fullUrl = `${this.hrpConfig.dataBaseUrl || 'https://api.hiddenroad.com'}${nextPagePath}`;
    const startTime = Date.now();

    // Use custom fetch function (handles proxy if configured)
    const request = new Request(fullUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${await this.authClient.getAccessToken()}`,
        'Content-Type': 'application/json',
      },
    });
    const response = await this.customFetch(request);

    const data = await response.json();
    const duration = Date.now() - startTime;

    await this.logApiCall('GET', nextPagePath, null, { data }, duration);

    if (!response.ok) {
      throw new Error(`Failed to fetch withdrawals from URL: ${response.status} ${response.statusText}`);
    }

    if (!data?.results) {
      throw new Error('Invalid response format: missing results');
    }

    return {
      results: data.results,
      next_page: data.next_page || null,
    };
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
    let fullUrl = `${this.hrpConfig.dataBaseUrl || 'https://api.hiddenroad.com'}${endpoint}`;

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

  /**
   * List all available accounts
   */
  async listAccounts(): Promise<HRPAccount[]> {
    const startTime = Date.now();

    const { data, error } = await this.client.GET('/v0/accountactivity/accounts');

    await this.logApiCall('GET', '/v0/accountactivity/accounts', null, { data, error }, Date.now() - startTime);

    if (error) {
      throw new Error(`Failed to list accounts: ${JSON.stringify(error)}`);
    }

    if (!data?.results) {
      throw new Error('Invalid response format: missing results');
    }

    return data.results;
  }

  /**
   * Fetch a single page of trades
   */
  async fetchTradesPage(
    options: {
      venue?: string;
      account?: string;
      startRecordTimestampInclusive?: string;
      endRecordTimestampExclusive?: string;
      pageSize?: number;
      startRecordEventId?: string;
      startRecordCorrectionVersion?: number;
      startEventTimestampInclusive?: string;
      endEventTimestampExclusive?: string;
    } = {}
  ): Promise<PaginatedResponse<HRPTradeEvent>> {
    const startTime = Date.now();

    const queryParams = {
      venue: options.venue,
      account: options.account,
      start_record_timestamp_inclusive: options.startRecordTimestampInclusive,
      end_record_timestamp_exclusive: options.endRecordTimestampExclusive,
      page_size: options.pageSize,
      start_record_event_id: options.startRecordEventId,
      start_record_correction_version: options.startRecordCorrectionVersion,
      start_event_timestamp_inclusive: options.startEventTimestampInclusive,
      end_event_timestamp_exclusive: options.endEventTimestampExclusive,
    };

    // Remove undefined values
    const cleanQueryParams = Object.fromEntries(
      Object.entries(queryParams).filter(([_, value]) => value !== undefined)
    );

    const { data, error } = await this.client.GET('/v0/accountactivity/trades', {
      params: {
        query: cleanQueryParams,
      },
    });

    await this.logApiCall(
      'GET',
      '/v0/accountactivity/trades',
      null,
      { data, error },
      Date.now() - startTime,
      cleanQueryParams
    );

    if (error) {
      throw new Error(`Failed to fetch trades: ${JSON.stringify(error)}`);
    }

    if (!data?.results) {
      throw new Error('Invalid response format: missing results');
    }

    return {
      results: data.results,
      next_page: data.next_page,
    };
  }

  /**
   * Fetch all trades using pagination
   */
  async fetchAllTrades(
    options: {
      venue?: string;
      account?: string;
      startRecordTimestampInclusive?: string;
      endRecordTimestampExclusive?: string;
      pageSize?: number;
      startEventTimestampInclusive?: string;
      endEventTimestampExclusive?: string;
      maxPages?: number; // Safety limit
    } = {}
  ): Promise<HRPTradeEvent[]> {
    return this.fetchAllPaginated(
      () => this.fetchTradesPage(options),
      nextPagePath => this.fetchTradesPageByUrl(nextPagePath),
      options.maxPages || 1000,
      'trades'
    );
  }

  /**
   * Fetch a single page of deposits
   */
  async fetchDepositsPage(
    options: {
      venue?: string;
      account?: string;
      startRecordTimestampInclusive?: string;
      endRecordTimestampExclusive?: string;
      pageSize?: number;
      startRecordEventId?: string;
      startRecordCorrectionVersion?: number;
      startEventTimestampInclusive?: string;
      endEventTimestampExclusive?: string;
    } = {}
  ): Promise<PaginatedResponse<HRPTransferEvent>> {
    const startTime = Date.now();

    const queryParams = {
      venue: options.venue,
      account: options.account,
      start_record_timestamp_inclusive: options.startRecordTimestampInclusive,
      end_record_timestamp_exclusive: options.endRecordTimestampExclusive,
      page_size: options.pageSize,
      start_record_event_id: options.startRecordEventId,
      start_record_correction_version: options.startRecordCorrectionVersion,
      start_event_timestamp_inclusive: options.startEventTimestampInclusive,
      end_event_timestamp_exclusive: options.endEventTimestampExclusive,
    };

    // Remove undefined values
    const cleanQueryParams = Object.fromEntries(
      Object.entries(queryParams).filter(([_, value]) => value !== undefined)
    );

    const { data, error } = await this.client.GET('/v0/accountactivity/transfers/deposits', {
      params: {
        query: cleanQueryParams,
      },
    });

    await this.logApiCall(
      'GET',
      '/v0/accountactivity/transfers/deposits',
      null,
      { data, error },
      Date.now() - startTime,
      cleanQueryParams
    );

    if (error) {
      throw new Error(`Failed to fetch deposits: ${JSON.stringify(error)}`);
    }

    if (!data?.results) {
      throw new Error('Invalid response format: missing results');
    }

    return {
      results: data.results,
      next_page: data.next_page,
    };
  }

  /**
   * Fetch all deposits using pagination
   */
  async fetchAllDeposits(
    options: {
      venue?: string;
      account?: string;
      startRecordTimestampInclusive?: string;
      endRecordTimestampExclusive?: string;
      pageSize?: number;
      startEventTimestampInclusive?: string;
      endEventTimestampExclusive?: string;
      maxPages?: number; // Safety limit
    } = {}
  ): Promise<HRPTransferEvent[]> {
    return this.fetchAllPaginated(
      () => this.fetchDepositsPage(options),
      nextPagePath => this.fetchDepositsPageByUrl(nextPagePath),
      options.maxPages || 1000,
      'deposits'
    );
  }

  /**
   * Fetch a single page of withdrawals
   */
  async fetchWithdrawalsPage(
    options: {
      venue?: string;
      account?: string;
      startRecordTimestampInclusive?: string;
      endRecordTimestampExclusive?: string;
      pageSize?: number;
      startRecordEventId?: string;
      startRecordCorrectionVersion?: number;
      startEventTimestampInclusive?: string;
      endEventTimestampExclusive?: string;
    } = {}
  ): Promise<PaginatedResponse<HRPTransferEvent>> {
    const startTime = Date.now();

    const queryParams = {
      venue: options.venue,
      account: options.account,
      start_record_timestamp_inclusive: options.startRecordTimestampInclusive,
      end_record_timestamp_exclusive: options.endRecordTimestampExclusive,
      page_size: options.pageSize,
      start_record_event_id: options.startRecordEventId,
      start_record_correction_version: options.startRecordCorrectionVersion,
      start_event_timestamp_inclusive: options.startEventTimestampInclusive,
      end_event_timestamp_exclusive: options.endEventTimestampExclusive,
    };

    // Remove undefined values
    const cleanQueryParams = Object.fromEntries(
      Object.entries(queryParams).filter(([_, value]) => value !== undefined)
    );

    const { data, error } = await this.client.GET('/v0/accountactivity/transfers/withdrawals', {
      params: {
        query: cleanQueryParams,
      },
    });

    await this.logApiCall(
      'GET',
      '/v0/accountactivity/transfers/withdrawals',
      null,
      { data, error },
      Date.now() - startTime,
      cleanQueryParams
    );

    if (error) {
      throw new Error(`Failed to fetch withdrawals: ${JSON.stringify(error)}`);
    }

    if (!data?.results) {
      throw new Error('Invalid response format: missing results');
    }

    return {
      results: data.results,
      next_page: data.next_page,
    };
  }

  /**
   * Fetch all withdrawals using pagination
   */
  async fetchAllWithdrawals(
    options: {
      venue?: string;
      account?: string;
      startRecordTimestampInclusive?: string;
      endRecordTimestampExclusive?: string;
      pageSize?: number;
      startEventTimestampInclusive?: string;
      endEventTimestampExclusive?: string;
      maxPages?: number; // Safety limit
    } = {}
  ): Promise<HRPTransferEvent[]> {
    return this.fetchAllPaginated(
      () => this.fetchWithdrawalsPage(options),
      nextPagePath => this.fetchWithdrawalsPageByUrl(nextPagePath),
      options.maxPages || 1000,
      'withdrawals'
    );
  }

  /**
   * Fetch a single page of CIP calculations
   */
  async fetchCIPCalculationsPage(
    options: {
      venue?: string;
      account?: string;
      startRecordTimestampInclusive?: string;
      endRecordTimestampExclusive?: string;
      pageSize?: number;
      startRecordEventId?: string;
      startRecordCorrectionVersion?: number;
      startEventTimestampInclusive?: string;
      endEventTimestampExclusive?: string;
    } = {}
  ): Promise<PaginatedResponse<HRPCIPCalculation>> {
    const startTime = Date.now();

    const queryParams = {
      venue: options.venue,
      account: options.account,
      start_record_timestamp_inclusive: options.startRecordTimestampInclusive,
      end_record_timestamp_exclusive: options.endRecordTimestampExclusive,
      page_size: options.pageSize,
      start_record_event_id: options.startRecordEventId,
      start_record_correction_version: options.startRecordCorrectionVersion,
      start_event_timestamp_inclusive: options.startEventTimestampInclusive,
      end_event_timestamp_exclusive: options.endEventTimestampExclusive,
    };

    // Remove undefined values
    const cleanQueryParams = Object.fromEntries(
      Object.entries(queryParams).filter(([_, value]) => value !== undefined)
    );

    const { data, error } = await this.client.GET('/v0/accountactivity/calculations/v0/cip', {
      params: {
        query: cleanQueryParams,
      },
    });

    await this.logApiCall(
      'GET',
      '/v0/accountactivity/calculations/v0/cip',
      null,
      { data, error },
      Date.now() - startTime,
      cleanQueryParams
    );

    if (error) {
      throw new Error(`Failed to fetch CIP calculations: ${JSON.stringify(error)}`);
    }

    if (!data?.results) {
      throw new Error('Invalid response format: missing results');
    }

    return {
      results: data.results,
      next_page: data.next_page,
    };
  }

  /**
   * Fetch all CIP calculations using pagination
   */
  async fetchAllCIPCalculations(
    options: {
      venue?: string;
      account?: string;
      startRecordTimestampInclusive?: string;
      endRecordTimestampExclusive?: string;
      pageSize?: number;
      startEventTimestampInclusive?: string;
      endEventTimestampExclusive?: string;
      maxPages?: number; // Safety limit
    } = {}
  ): Promise<HRPCIPCalculation[]> {
    return this.fetchAllPaginated(
      () => this.fetchCIPCalculationsPage(options),
      nextPagePath => this.fetchCIPCalculationsPageByUrl(nextPagePath),
      options.maxPages || 1000,
      'CIP calculations'
    );
  }

  /**
   * Fetch CIP calculations page by full URL (for pagination)
   */
  private async fetchCIPCalculationsPageByUrl(nextPagePath: string): Promise<PaginatedResponse<HRPCIPCalculation>> {
    const fullUrl = `${this.hrpConfig.dataBaseUrl || 'https://api.hiddenroad.com'}${nextPagePath}`;
    const startTime = Date.now();

    // Use custom fetch function (handles proxy if configured)
    const request = new Request(fullUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${await this.authClient.getAccessToken()}`,
        'Content-Type': 'application/json',
      },
    });
    const response = await this.customFetch(request);

    const data = (await response.json()) as any;
    const duration = Date.now() - startTime;

    await this.logApiCall('GET', nextPagePath, null, { data }, duration);

    if (!response.ok) {
      throw new Error(`Failed to fetch CIP calculations from URL: ${response.status} ${response.statusText}`);
    }

    if (!data?.results) {
      throw new Error('Invalid response format: missing results');
    }

    return {
      results: data.results,
      next_page: data.next_page || null,
    };
  }

  /**
   * Fetch a single page of ERS calculations
   */
  async fetchERSCalculationsPage(
    options: {
      venue?: string;
      account?: string;
      startRecordTimestampInclusive?: string;
      endRecordTimestampExclusive?: string;
      pageSize?: number;
      startRecordEventId?: string;
      startRecordCorrectionVersion?: number;
      startEventTimestampInclusive?: string;
      endEventTimestampExclusive?: string;
    } = {}
  ): Promise<PaginatedResponse<HRPERSCalculation>> {
    const startTime = Date.now();

    const queryParams = {
      venue: options.venue,
      account: options.account,
      start_record_timestamp_inclusive: options.startRecordTimestampInclusive,
      end_record_timestamp_exclusive: options.endRecordTimestampExclusive,
      page_size: options.pageSize,
      start_record_event_id: options.startRecordEventId,
      start_record_correction_version: options.startRecordCorrectionVersion,
      start_event_timestamp_inclusive: options.startEventTimestampInclusive,
      end_event_timestamp_exclusive: options.endEventTimestampExclusive,
    };

    const cleanQueryParams = Object.fromEntries(
      Object.entries(queryParams).filter(([_, value]) => value !== undefined)
    );

    const { data, error } = await this.client.GET('/v0/accountactivity/calculations/v0/ers', {
      params: {
        query: cleanQueryParams,
      },
    });

    await this.logApiCall(
      'GET',
      '/v0/accountactivity/calculations/v0/ers',
      null,
      { data, error },
      Date.now() - startTime,
      cleanQueryParams
    );

    if (error) {
      throw new Error(`Failed to fetch ERS calculations: ${JSON.stringify(error)}`);
    }

    if (!data?.results) {
      throw new Error('Invalid response format: missing results');
    }

    return {
      results: data.results,
      next_page: data.next_page,
    };
  }

  /**
   * Fetch all ERS calculations using pagination
   */
  async fetchAllERSCalculations(
    options: {
      venue?: string;
      account?: string;
      startRecordTimestampInclusive?: string;
      endRecordTimestampExclusive?: string;
      pageSize?: number;
      startEventTimestampInclusive?: string;
      endEventTimestampExclusive?: string;
      maxPages?: number;
    } = {}
  ): Promise<HRPERSCalculation[]> {
    return this.fetchAllPaginated(
      () => this.fetchERSCalculationsPage(options),
      nextPagePath => this.fetchERSCalculationsPageByUrl(nextPagePath),
      options.maxPages || 1000,
      'ERS calculations'
    );
  }

  /**
   * Fetch ERS calculations page by full URL (for pagination)
   */
  private async fetchERSCalculationsPageByUrl(nextPagePath: string): Promise<PaginatedResponse<HRPERSCalculation>> {
    const fullUrl = `${this.hrpConfig.dataBaseUrl || 'https://api.hiddenroad.com'}${nextPagePath}`;
    const startTime = Date.now();

    // Use custom fetch function (handles proxy if configured)
    const request = new Request(fullUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${await this.authClient.getAccessToken()}`,
        'Content-Type': 'application/json',
      },
    });
    const response = await this.customFetch(request);

    const data = (await response.json()) as any;
    const duration = Date.now() - startTime;

    await this.logApiCall('GET', nextPagePath, null, { data }, duration);

    if (!response.ok) {
      throw new Error(`Failed to fetch ERS calculations from URL: ${response.status} ${response.statusText}`);
    }

    if (!data?.results) {
      throw new Error('Invalid response format: missing results');
    }

    return {
      results: data.results,
      next_page: data.next_page || null,
    };
  }

  /**
   * Fetch a single page of financing calculations
   */
  async fetchFinancingCalculationsPage(
    options: {
      venue?: string;
      account?: string;
      startRecordTimestampInclusive?: string;
      endRecordTimestampExclusive?: string;
      pageSize?: number;
      startRecordEventId?: string;
      startRecordCorrectionVersion?: number;
      startEventTimestampInclusive?: string;
      endEventTimestampExclusive?: string;
    } = {}
  ): Promise<PaginatedResponse<HRPFinancingCalculation>> {
    const startTime = Date.now();

    const queryParams = {
      venue: options.venue,
      account: options.account,
      start_record_timestamp_inclusive: options.startRecordTimestampInclusive,
      end_record_timestamp_exclusive: options.endRecordTimestampExclusive,
      page_size: options.pageSize,
      start_record_event_id: options.startRecordEventId,
      start_record_correction_version: options.startRecordCorrectionVersion,
      start_event_timestamp_inclusive: options.startEventTimestampInclusive,
      end_event_timestamp_exclusive: options.endEventTimestampExclusive,
    };

    const cleanQueryParams = Object.fromEntries(
      Object.entries(queryParams).filter(([_, value]) => value !== undefined)
    );

    const { data, error } = await this.client.GET('/v0/accountactivity/calculations/v0/financing', {
      params: {
        query: cleanQueryParams,
      },
    });

    await this.logApiCall(
      'GET',
      '/v0/accountactivity/calculations/v0/financing',
      null,
      { data, error },
      Date.now() - startTime,
      cleanQueryParams
    );

    if (error) {
      throw new Error(`Failed to fetch financing calculations: ${JSON.stringify(error)}`);
    }

    if (!data?.results) {
      throw new Error('Invalid response format: missing results');
    }

    return {
      results: data.results,
      next_page: data.next_page,
    };
  }

  /**
   * Fetch all financing calculations using pagination
   */
  async fetchAllFinancingCalculations(
    options: {
      venue?: string;
      account?: string;
      startRecordTimestampInclusive?: string;
      endRecordTimestampExclusive?: string;
      pageSize?: number;
      startEventTimestampInclusive?: string;
      endEventTimestampExclusive?: string;
      maxPages?: number;
    } = {}
  ): Promise<HRPFinancingCalculation[]> {
    return this.fetchAllPaginated(
      () => this.fetchFinancingCalculationsPage(options),
      nextPagePath => this.fetchFinancingCalculationsPageByUrl(nextPagePath),
      options.maxPages || 1000,
      'financing calculations'
    );
  }

  /**
   * Fetch financing calculations page by full URL (for pagination)
   */
  private async fetchFinancingCalculationsPageByUrl(
    nextPagePath: string
  ): Promise<PaginatedResponse<HRPFinancingCalculation>> {
    const fullUrl = `${this.hrpConfig.dataBaseUrl || 'https://api.hiddenroad.com'}${nextPagePath}`;
    const startTime = Date.now();

    // Use custom fetch function (handles proxy if configured)
    const request = new Request(fullUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${await this.authClient.getAccessToken()}`,
        'Content-Type': 'application/json',
      },
    });
    const response = await this.customFetch(request);

    const data = (await response.json()) as any;
    const duration = Date.now() - startTime;

    await this.logApiCall('GET', nextPagePath, null, { data }, duration);

    if (!response.ok) {
      throw new Error(`Failed to fetch financing calculations from URL: ${response.status} ${response.statusText}`);
    }

    if (!data?.results) {
      throw new Error('Invalid response format: missing results');
    }

    return {
      results: data.results,
      next_page: data.next_page || null,
    };
  }

  /**
   * Fetch a single page of execution premium calculations
   */
  async fetchExecutionPremiumCalculationsPage(
    options: {
      venue?: string;
      account?: string;
      startRecordTimestampInclusive?: string;
      endRecordTimestampExclusive?: string;
      pageSize?: number;
      startRecordEventId?: string;
      startRecordCorrectionVersion?: number;
      startEventTimestampInclusive?: string;
      endEventTimestampExclusive?: string;
    } = {}
  ): Promise<PaginatedResponse<HRPExecutionPremiumCalculation>> {
    const startTime = Date.now();

    const queryParams = {
      venue: options.venue,
      account: options.account,
      start_record_timestamp_inclusive: options.startRecordTimestampInclusive,
      end_record_timestamp_exclusive: options.endRecordTimestampExclusive,
      page_size: options.pageSize,
      start_record_event_id: options.startRecordEventId,
      start_record_correction_version: options.startRecordCorrectionVersion,
      start_event_timestamp_inclusive: options.startEventTimestampInclusive,
      end_event_timestamp_exclusive: options.endEventTimestampExclusive,
    };

    const cleanQueryParams = Object.fromEntries(
      Object.entries(queryParams).filter(([_, value]) => value !== undefined)
    );

    const { data, error } = await this.client.GET('/v0/accountactivity/calculations/v0/execution-premium', {
      params: {
        query: cleanQueryParams,
      },
    });

    await this.logApiCall(
      'GET',
      '/v0/accountactivity/calculations/v0/execution-premium',
      null,
      { data, error },
      Date.now() - startTime,
      cleanQueryParams
    );

    if (error) {
      throw new Error(`Failed to fetch execution premium calculations: ${JSON.stringify(error)}`);
    }

    if (!data?.results) {
      throw new Error('Invalid response format: missing results');
    }

    return {
      results: data.results,
      next_page: data.next_page,
    };
  }

  /**
   * Fetch all execution premium calculations using pagination
   */
  async fetchAllExecutionPremiumCalculations(
    options: {
      venue?: string;
      account?: string;
      startRecordTimestampInclusive?: string;
      endRecordTimestampExclusive?: string;
      pageSize?: number;
      startEventTimestampInclusive?: string;
      endEventTimestampExclusive?: string;
      maxPages?: number;
    } = {}
  ): Promise<HRPExecutionPremiumCalculation[]> {
    return this.fetchAllPaginated(
      () => this.fetchExecutionPremiumCalculationsPage(options),
      nextPagePath => this.fetchExecutionPremiumCalculationsPageByUrl(nextPagePath),
      options.maxPages || 1000,
      'execution premium calculations'
    );
  }

  /**
   * Fetch execution premium calculations page by full URL (for pagination)
   */
  private async fetchExecutionPremiumCalculationsPageByUrl(
    nextPagePath: string
  ): Promise<PaginatedResponse<HRPExecutionPremiumCalculation>> {
    const fullUrl = `${this.hrpConfig.dataBaseUrl || 'https://api.hiddenroad.com'}${nextPagePath}`;
    const startTime = Date.now();

    // Use custom fetch function (handles proxy if configured)
    const request = new Request(fullUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${await this.authClient.getAccessToken()}`,
        'Content-Type': 'application/json',
      },
    });
    const response = await this.customFetch(request);

    const data = (await response.json()) as any;
    const duration = Date.now() - startTime;

    await this.logApiCall('GET', nextPagePath, null, { data }, duration);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch execution premium calculations from URL: ${response.status} ${response.statusText}`
      );
    }

    if (!data?.results) {
      throw new Error('Invalid response format: missing results');
    }

    return {
      results: data.results,
      next_page: data.next_page || null,
    };
  }
}
