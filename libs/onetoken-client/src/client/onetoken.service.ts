import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { BaseCachedClient } from '@s16z/api-client-base';
import { OneTokenConfig } from '../types';
import { OneTokenBaseClient } from '../base/onetoken-base-client';

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
   * Get the underlying base client for direct access
   */
  getBaseClient(): OneTokenBaseClient {
    return this.oneTokenBaseClient;
  }
}