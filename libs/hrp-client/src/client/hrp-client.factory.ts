import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { HRPService } from './hrp.service';
import { HRPAuthService } from './hrp-auth.service';
import { HRPConfig, ShareClassHRPCredentials } from '../types';

/**
 * Factory service for creating HRP clients with different credentials per ShareClass
 */
@Injectable()
export class HRPClientFactory {
  private readonly clientCache = new Map<string, HRPService>();

  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    @Inject('HRP_CONFIG') private readonly baseConfig: HRPConfig,
  ) {}

  /**
   * Get or create an HRP client for a specific ShareClass
   */
  async getClient(credentials: ShareClassHRPCredentials): Promise<HRPService> {
    const cacheKey = this.getCacheKey(credentials);

    // Return cached client if available
    if (this.clientCache.has(cacheKey)) {
      return this.clientCache.get(cacheKey)!;
    }

    // Create new client with ShareClass-specific credentials
    const client = await this.createClient(credentials);

    // Cache the client
    this.clientCache.set(cacheKey, client);

    return client;
  }

  /**
   * Create a new HRP client with specific credentials
   */
  private async createClient(credentials: ShareClassHRPCredentials): Promise<HRPService> {
    // Create ShareClass-specific config
    const shareClassConfig: HRPConfig = {
      ...this.baseConfig,
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      audience: credentials.audience || this.baseConfig.audience,
    };

    // Create auth service for this ShareClass
    const authService = new HRPAuthService(shareClassConfig);

    // Create HRP service for this ShareClass
    const hrpService = new HRPService(this.cacheManager, shareClassConfig, authService);

    return hrpService;
  }

  /**
   * Clear cached client for a ShareClass (useful when credentials change)
   */
  clearClient(credentials: ShareClassHRPCredentials): void {
    const cacheKey = this.getCacheKey(credentials);
    this.clientCache.delete(cacheKey);
  }

  /**
   * Clear all cached clients
   */
  clearAllClients(): void {
    this.clientCache.clear();
  }

  /**
   * Get cache key for a ShareClass
   */
  private getCacheKey(credentials: ShareClassHRPCredentials): string {
    return `${credentials.shareClassName}:${credentials.clientId}`;
  }

  /**
   * Get all active ShareClass names that have cached clients
   */
  getActiveShareClasses(): string[] {
    return Array.from(this.clientCache.keys()).map(key => key.split(':')[0]);
  }
}