import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { BaseCachedClient } from '@s16z/api-client-base';
import { HRPConfig } from '../types';
import { HRPAuthService } from './hrp-auth.service';
import { HRPBaseClient } from '../base/hrp-base-client';

@Injectable()
export class HRPService extends BaseCachedClient {
  private hrpBaseClient: HRPBaseClient;

  constructor(
    @Inject(CACHE_MANAGER) cacheManager: Cache,
    @Inject('HRP_CONFIG') private readonly config: HRPConfig,
    private readonly authService: HRPAuthService
  ) {
    super(cacheManager, 'HRPService');

    // Create the base client instance
    this.hrpBaseClient = new HRPBaseClient(
      this.config,
      this.cacheManager,
      'HRPService'
    );
  }

  /**
   * List all HRP accounts
   */
  async listAccounts() {
    return this.hrpBaseClient.listAccounts();
  }

  /**
   * Get the underlying base client for direct access
   */
  getBaseClient(): HRPBaseClient {
    return this.hrpBaseClient;
  }

  /**
   * Get the auth service
   */
  getAuthService(): HRPAuthService {
    return this.authService;
  }
}