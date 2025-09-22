import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { BaseCachedClient } from '@s16z/api-client-base';
import { OneTokenConfig } from '../types';
import { OneTokenBaseClient } from '../base/onetoken-base-client';

/**
 * Historical price data interface
 */
export interface HistoricalPrice {
  symbol: string;
  price: number;
  contract: string;
  timestamp?: number;
  metadata?: any;
}

@Injectable()
export class OneTokenService extends BaseCachedClient {
  private oneTokenBaseClient: OneTokenBaseClient;

  constructor(
    @Inject(CACHE_MANAGER) cacheManager: Cache,
    @Inject('ONETOKEN_CONFIG') private readonly config: OneTokenConfig
  ) {
    super(cacheManager, 'OneTokenService');

    // Create the base client instance
    this.oneTokenBaseClient = new OneTokenBaseClient(
      this.config,
      this.cacheManager,
      'OneTokenService'
    );
  }

  /**
   * List portfolios
   */
  async listPortfolios(options?: { department?: string }) {
    return this.oneTokenBaseClient.listPortfolios(options);
  }

  /**
   * Get historical prices for currencies at a specific timestamp
   * @param currencies - Array of currency symbols (e.g., ['btc', 'eth'])
   * @param exchange - Exchange source ('index' or 'cmc')
   * @param timestamp - Date for price lookup
   * @returns Promise resolving to array of clean price data
   */
  async getHistoricalPrices(
    currencies: string[],
    exchange: string,
    timestamp: Date
  ): Promise<HistoricalPrice[]> {
    // Convert timestamp to nanoseconds (OneToken API requirement)
    const startOfDay = new Date(timestamp);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const timestampNano = startOfDay.getTime() * 1000000;

    const requestOptions: any = {
      params: {
        query: {
          currency: currencies.join(','),
          exchange,
          timestamp: timestampNano.toString(),
        }
      }
    };

    // Add auth headers if not using middleware
    if (!(this.oneTokenBaseClient as any).useMiddleware) {
      requestOptions.headers = await (this.oneTokenBaseClient as any).getAuthHeaders();
    }

    const response = await (this.oneTokenBaseClient as any).client.GET(
      '/quote/last-price-before-timestamp',
      requestOptions
    );

    if (!response.data || !Array.isArray(response.data)) {
      return [];
    }

    // Process raw API data into clean format
    const cleanPrices: HistoricalPrice[] = [];

    for (const rawPrice of response.data) {
      const symbol = this.extractSymbolFromContract(rawPrice.contract);
      if (symbol) {
        cleanPrices.push({
          symbol: symbol.toLowerCase(),
          price: parseFloat(rawPrice.last),
          contract: rawPrice.contract,
          timestamp: rawPrice.tm,
          metadata: rawPrice,
        });
      }
    }

    return cleanPrices;
  }

  /**
   * Extract currency symbol from OneToken contract string
   * @param contract - Contract string (e.g., "index/btc.usd")
   * @returns Currency symbol or null if extraction fails
   */
  private extractSymbolFromContract(contract: string): string | null {
    try {
      // Handle contract formats like "index/btc.usd", "cmc/eth.usd"
      const parts = contract.split('/');
      if (parts.length >= 2) {
        const symbolPart = parts[1].split('.')[0]; // Get "btc" from "btc.usd"
        return symbolPart.toLowerCase();
      }

      // Fallback: try to extract directly
      const symbolMatch = contract.match(/([a-zA-Z]+)/);
      return symbolMatch ? symbolMatch[1].toLowerCase() : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get the underlying base client for direct access
   */
  getBaseClient(): OneTokenBaseClient {
    return this.oneTokenBaseClient;
  }
}