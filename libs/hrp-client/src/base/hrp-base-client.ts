import { Logger } from '@nestjs/common';
import { Cache } from 'cache-manager';
import createClient from 'openapi-fetch';
import type { paths as HRPDataPaths } from '../schemas/data/schema';
import {
  HRPConfig,
  HRPTimestampParams,
  HRPPaginationParams,
  HRPSnapshotParams,
  HRPAccount,
  HRPCIPCalculation,
  HRPTradeEvent,
  HRPTransferEvent,
  HRPAdjustmentEvent,
  HRPERSCalculation,
  HRPFinancingCalculation,
  HRPExecutionPremiumCalculation,
  HRPPositionsSnapshot,
  HRPBalancesSnapshot
} from '../types';
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

    // Note: HRP authentication is handled via helper method
    // due to openapi-fetch version compatibility issues
  }

  /**
   * Get authorization headers for HRP API requests
   */
  private async getAuthHeaders(): Promise<{ Authorization: string }> {
    try {
      const accessToken = await this.authClient.getAccessToken();
      return {
        Authorization: `Bearer ${accessToken}`
      };
    } catch (error) {
      this.logger.error('Failed to get HRP access token', {
        error: error.message
      });
      throw error;
    }
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
  async listAccounts(): Promise<HRPAccount[]> {
    const startTime = Date.now();
    const headers = await this.getAuthHeaders();

    const { data, error } = await this.client.GET('/v0/accountactivity/accounts', {
      headers: headers,
      params: {}
    });

    await this.logApiCall('GET', '/v0/accountactivity/accounts', null, { data, error }, Date.now() - startTime);

    if (error) {
      this.logger.error('Failed to list HRP accounts', { error });
      throw new Error(`Failed to list accounts: ${JSON.stringify(error)}`);
    }

    if (!data?.results) {
      this.logger.error('Invalid HRP accounts response format', { data });
      throw new Error('Invalid response format: missing results');
    }

    this.logger.debug(`Successfully retrieved ${data.results.length} HRP accounts`);

    return data.results;
  }

  // CIP Calculations
  async fetchCIPCalculations(params: HRPTimestampParams): Promise<HRPCIPCalculation[]> {
    const startTime = Date.now();
    const headers = await this.getAuthHeaders();

    const { data, error } = await this.client.GET('/v0/accountactivity/calculations/v0/cip', {
      headers: headers,
      params: {
        query: {
          venue: params.venue,
          account: params.account,
          start_event_timestamp_inclusive: params.startEventTimestampInclusive,
          end_event_timestamp_exclusive: params.endEventTimestampExclusive,
          page_size: params.pageSize,
          start_record_event_id: params.startRecordEventId,
          start_record_correction_version: params.startRecordCorrectionVersion,
        },
      },
    });

    await this.logApiCall('GET', '/v0/accountactivity/calculations/v0/cip', params, { data, error }, Date.now() - startTime);

    if (error) {
      this.logger.error('Failed to fetch HRP CIP calculations', { error, params });
      throw new Error(`Failed to fetch CIP calculations: ${JSON.stringify(error)}`);
    }

    if (!data?.results) {
      this.logger.error('Invalid HRP CIP response format', { data, params });
      throw new Error('Invalid response format: missing results');
    }

    this.logger.debug(`Successfully retrieved ${data.results.length} CIP calculations`);

    return data.results;
  }

  async fetchAllCIPCalculations(params: HRPPaginationParams): Promise<HRPCIPCalculation[]> {
    const allResults: any[] = [];
    let nextPage: string | undefined;
    let pageCount = 0;
    const maxPages = params.maxPages || 100;

    do {
      const result = await this.fetchCIPCalculations({
        ...params,
        startRecordEventId: nextPage,
      });

      allResults.push(...result);

      // Note: The API doesn't seem to return next_page in the schema, so we'll break after one page
      // This would need to be updated based on the actual API response structure
      break;

      pageCount++;
    } while (nextPage && pageCount < maxPages);

    return allResults;
  }

  // Trades
  async fetchTrades(params: {
    venue?: string;
    account?: string;
    startEventTimestampInclusive?: string;
    endEventTimestampExclusive?: string;
    pageSize?: number;
    startRecordEventId?: string;
    startRecordCorrectionVersion?: number;
  }) {
    const startTime = Date.now();
    const headers = await this.getAuthHeaders();

    const { data, error } = await this.client.GET('/v0/accountactivity/trades', {
      headers: headers,
      params: {
        query: {
          venue: params.venue,
          account: params.account,
          start_event_timestamp_inclusive: params.startEventTimestampInclusive,
          end_event_timestamp_exclusive: params.endEventTimestampExclusive,
          page_size: params.pageSize,
          start_record_event_id: params.startRecordEventId,
          start_record_correction_version: params.startRecordCorrectionVersion,
        },
      },
    });

    await this.logApiCall('GET', '/v0/accountactivity/trades', params, { data, error }, Date.now() - startTime);

    if (error) {
      throw new Error(`Failed to fetch trades: ${JSON.stringify(error)}`);
    }

    if (!data?.results) {
      throw new Error('Invalid response format: missing results');
    }

    return data.results;
  }

  async fetchAllTrades(params: {
    venue?: string;
    account?: string;
    startEventTimestampInclusive?: string;
    endEventTimestampExclusive?: string;
    pageSize?: number;
    maxPages?: number;
  }) {
    const allResults: any[] = [];
    let nextPage: string | undefined;
    let pageCount = 0;
    const maxPages = params.maxPages || 100;

    do {
      const result = await this.fetchTrades({
        ...params,
        startRecordEventId: nextPage,
      });

      allResults.push(...result);

      // Note: The API doesn't seem to return next_page in the schema, so we'll break after one page
      // This would need to be updated based on the actual API response structure
      break;

      pageCount++;
    } while (nextPage && pageCount < maxPages);

    return allResults;
  }

  // Deposits
  async fetchDeposits(params: {
    venue?: string;
    account?: string;
    startEventTimestampInclusive?: string;
    endEventTimestampExclusive?: string;
    pageSize?: number;
    startRecordEventId?: string;
    startRecordCorrectionVersion?: number;
  }) {
    const startTime = Date.now();

    const { data, error } = await this.client.GET('/v0/accountactivity/transfers/deposits', {
      params: {
        query: {
          venue: params.venue,
          account: params.account,
          start_event_timestamp_inclusive: params.startEventTimestampInclusive,
          end_event_timestamp_exclusive: params.endEventTimestampExclusive,
          page_size: params.pageSize,
          start_record_event_id: params.startRecordEventId,
          start_record_correction_version: params.startRecordCorrectionVersion,
        },
      },
    });

    await this.logApiCall('GET', '/v0/accountactivity/transfers/deposits', params, { data, error }, Date.now() - startTime);

    if (error) {
      throw new Error(`Failed to fetch deposits: ${JSON.stringify(error)}`);
    }

    if (!data?.results) {
      throw new Error('Invalid response format: missing results');
    }

    return data.results;
  }

  // Withdrawals
  async fetchWithdrawals(params: {
    venue?: string;
    account?: string;
    startEventTimestampInclusive?: string;
    endEventTimestampExclusive?: string;
    pageSize?: number;
    startRecordEventId?: string;
    startRecordCorrectionVersion?: number;
  }) {
    const startTime = Date.now();

    const { data, error } = await this.client.GET('/v0/accountactivity/transfers/withdrawals', {
      params: {
        query: {
          venue: params.venue,
          account: params.account,
          start_event_timestamp_inclusive: params.startEventTimestampInclusive,
          end_event_timestamp_exclusive: params.endEventTimestampExclusive,
          page_size: params.pageSize,
          start_record_event_id: params.startRecordEventId,
          start_record_correction_version: params.startRecordCorrectionVersion,
        },
      },
    });

    await this.logApiCall('GET', '/v0/accountactivity/transfers/withdrawals', params, { data, error }, Date.now() - startTime);

    if (error) {
      throw new Error(`Failed to fetch withdrawals: ${JSON.stringify(error)}`);
    }

    if (!data?.results) {
      throw new Error('Invalid response format: missing results');
    }

    return data.results;
  }

  // ERS Calculations
  async fetchERSCalculations(params: {
    venue?: string;
    account?: string;
    startEventTimestampInclusive?: string;
    endEventTimestampExclusive?: string;
    pageSize?: number;
    startRecordEventId?: string;
    startRecordCorrectionVersion?: number;
  }) {
    const startTime = Date.now();
    const headers = await this.getAuthHeaders();

    const { data, error } = await this.client.GET('/v0/accountactivity/calculations/v0/ers', {
      headers: headers,
      params: {
        query: {
          venue: params.venue,
          account: params.account,
          start_event_timestamp_inclusive: params.startEventTimestampInclusive,
          end_event_timestamp_exclusive: params.endEventTimestampExclusive,
          page_size: params.pageSize,
          start_record_event_id: params.startRecordEventId,
          start_record_correction_version: params.startRecordCorrectionVersion,
        },
      },
    });

    await this.logApiCall('GET', '/v0/accountactivity/calculations/v0/ers', params, { data, error }, Date.now() - startTime);

    if (error) {
      throw new Error(`Failed to fetch ERS calculations: ${JSON.stringify(error)}`);
    }

    if (!data?.results) {
      throw new Error('Invalid response format: missing results');
    }

    return data.results;
  }

  // Financing Calculations
  async fetchFinancingCalculations(params: {
    venue?: string;
    account?: string;
    startEventTimestampInclusive?: string;
    endEventTimestampExclusive?: string;
    pageSize?: number;
    startRecordEventId?: string;
    startRecordCorrectionVersion?: number;
  }) {
    const startTime = Date.now();
    const headers = await this.getAuthHeaders();

    const { data, error } = await this.client.GET('/v0/accountactivity/calculations/v0/financing', {
      headers: headers,
      params: {
        query: {
          venue: params.venue,
          account: params.account,
          start_event_timestamp_inclusive: params.startEventTimestampInclusive,
          end_event_timestamp_exclusive: params.endEventTimestampExclusive,
          page_size: params.pageSize,
          start_record_event_id: params.startRecordEventId,
          start_record_correction_version: params.startRecordCorrectionVersion,
        },
      },
    });

    await this.logApiCall('GET', '/v0/accountactivity/calculations/v0/financing', params, { data, error }, Date.now() - startTime);

    if (error) {
      throw new Error(`Failed to fetch financing calculations: ${JSON.stringify(error)}`);
    }

    if (!data?.results) {
      throw new Error('Invalid response format: missing results');
    }

    return data.results;
  }

  // Execution Premium Calculations
  async fetchExecutionPremiumCalculations(params: {
    venue?: string;
    account?: string;
    startEventTimestampInclusive?: string;
    endEventTimestampExclusive?: string;
    pageSize?: number;
    startRecordEventId?: string;
    startRecordCorrectionVersion?: number;
  }) {
    const startTime = Date.now();

    const { data, error } = await this.client.GET('/v0/accountactivity/calculations/v0/execution-premium', {
      params: {
        query: {
          venue: params.venue,
          account: params.account,
          start_event_timestamp_inclusive: params.startEventTimestampInclusive,
          end_event_timestamp_exclusive: params.endEventTimestampExclusive,
          page_size: params.pageSize,
          start_record_event_id: params.startRecordEventId,
          start_record_correction_version: params.startRecordCorrectionVersion,
        },
      },
    });

    await this.logApiCall('GET', '/v0/accountactivity/calculations/v0/execution-premium', params, { data, error }, Date.now() - startTime);

    if (error) {
      throw new Error(`Failed to fetch execution premium calculations: ${JSON.stringify(error)}`);
    }

    if (!data?.results) {
      throw new Error('Invalid response format: missing results');
    }

    return data.results;
  }

  // Positions Snapshots
  async fetchPositionsSnapshots(params: {
    venue?: string;
    account?: string;
    pageSize?: number;
    accountOffset?: string;
    endEventTimestampExclusive?: string;
  }) {
    const startTime = Date.now();

    const { data, error } = await this.client.GET('/v0/accountactivity/positions-snapshots', {
      params: {
        query: {
          venue: params.venue,
          account: params.account,
          page_size: params.pageSize,
          account_offset: params.accountOffset,
          end_event_timestamp_exclusive: params.endEventTimestampExclusive,
        },
      },
    });

    await this.logApiCall('GET', '/v0/accountactivity/positions-snapshots', params, { data, error }, Date.now() - startTime);

    if (error) {
      throw new Error(`Failed to fetch positions snapshots: ${JSON.stringify(error)}`);
    }

    if (!data?.results) {
      throw new Error('Invalid response format: missing results');
    }

    return data.results;
  }

  // Balances Snapshots
  async fetchBalancesSnapshots(params: {
    venue?: string;
    account?: string;
    pageSize?: number;
    accountOffset?: string;
    endEventTimestampExclusive?: string;
  }) {
    const startTime = Date.now();

    const { data, error } = await this.client.GET('/v0/accountactivity/balances-snapshots', {
      params: {
        query: {
          venue: params.venue,
          account: params.account,
          page_size: params.pageSize,
          account_offset: params.accountOffset,
          end_event_timestamp_exclusive: params.endEventTimestampExclusive,
        },
      },
    });

    await this.logApiCall('GET', '/v0/accountactivity/balances-snapshots', params, { data, error }, Date.now() - startTime);

    if (error) {
      throw new Error(`Failed to fetch balances snapshots: ${JSON.stringify(error)}`);
    }

    if (!data?.results) {
      throw new Error('Invalid response format: missing results');
    }

    return data.results;
  }

  // Credits
  async fetchCredits(params: {
    venue?: string;
    account?: string;
    startEventTimestampInclusive?: string;
    endEventTimestampExclusive?: string;
    pageSize?: number;
    startRecordEventId?: string;
    startRecordCorrectionVersion?: number;
  }) {
    const startTime = Date.now();

    const { data, error } = await this.client.GET('/v0/accountactivity/adjustments/credits', {
      params: {
        query: {
          venue: params.venue,
          account: params.account,
          start_event_timestamp_inclusive: params.startEventTimestampInclusive,
          end_event_timestamp_exclusive: params.endEventTimestampExclusive,
          page_size: params.pageSize,
          start_record_event_id: params.startRecordEventId,
          start_record_correction_version: params.startRecordCorrectionVersion,
        },
      },
    });

    await this.logApiCall('GET', '/v0/accountactivity/adjustments/credits', params, { data, error }, Date.now() - startTime);

    if (error) {
      throw new Error(`Failed to fetch credits: ${JSON.stringify(error)}`);
    }

    if (!data?.results) {
      throw new Error('Invalid response format: missing results');
    }

    return data.results;
  }

  // Debits
  async fetchDebits(params: {
    venue?: string;
    account?: string;
    startEventTimestampInclusive?: string;
    endEventTimestampExclusive?: string;
    pageSize?: number;
    startRecordEventId?: string;
    startRecordCorrectionVersion?: number;
  }) {
    const startTime = Date.now();

    const { data, error } = await this.client.GET('/v0/accountactivity/adjustments/debits', {
      params: {
        query: {
          venue: params.venue,
          account: params.account,
          start_event_timestamp_inclusive: params.startEventTimestampInclusive,
          end_event_timestamp_exclusive: params.endEventTimestampExclusive,
          page_size: params.pageSize,
          start_record_event_id: params.startRecordEventId,
          start_record_correction_version: params.startRecordCorrectionVersion,
        },
      },
    });

    await this.logApiCall('GET', '/v0/accountactivity/adjustments/debits', params, { data, error }, Date.now() - startTime);

    if (error) {
      throw new Error(`Failed to fetch debits: ${JSON.stringify(error)}`);
    }

    if (!data?.results) {
      throw new Error('Invalid response format: missing results');
    }

    return data.results;
  }

  // Ping endpoint for testing connectivity
  async ping() {
    const startTime = Date.now();
    const headers = await this.getAuthHeaders();

    const { data, error } = await this.client.GET('/v0/accountactivity/ping', {
      headers: headers,
      params: {}
    });

    await this.logApiCall('GET', '/v0/accountactivity/ping', null, { data, error }, Date.now() - startTime);

    if (error) {
      this.logger.error('Failed to ping HRP API', { error });
      throw new Error(`Failed to ping HRP API: ${JSON.stringify(error)}`);
    }

    this.logger.debug('HRP API ping successful', { data });

    return data;
  }

  /**
   * Get the underlying API client for direct access
   */
  getClient(): ReturnType<typeof createClient<HRPDataPaths>> {
    return this.client;
  }

  /**
   * Get the auth client for token management
   */
  getAuthClient(): HRPAuthClient {
    return this.authClient;
  }
}