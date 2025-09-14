import createClient from 'openapi-fetch';
import type { paths as AuthPaths } from './auth/schema';
import { HRPConfig, HRPToken } from './types';
import { GlobalConfig, Logger } from '@acpms/common';
import { SocksProxyAgent } from 'socks-proxy-agent';
import fetch from 'node-fetch';

/**
 * Create custom fetch function with SOCKS5 proxy support for auth client
 */
const createFetchWithProxy = (
  config: HRPConfig,
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

  logger.info(`Configured SOCKS5 proxy for HRP auth: ${host}:${port}`);

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
 * HRP Authentication Client
 *
 * Handles OAuth2 client credentials flow for HRP API authentication
 */
export class HRPAuthClient {
  private client: ReturnType<typeof createClient<AuthPaths>>;
  private hrpConfig: HRPConfig;
  private logger: Logger;
  private currentToken: HRPToken | null = null;

  constructor(config: HRPConfig, logger: Logger) {
    this.hrpConfig = config;
    this.logger = logger;

    // Create custom fetch with proxy support if configured
    const customFetch = createFetchWithProxy(this.hrpConfig, this.logger);

    // Initialize openapi-fetch client for auth
    this.client = createClient<AuthPaths>({
      baseUrl: this.hrpConfig.authBaseUrl || 'https://auth.hiddenroad.com',
      headers: {
        'Content-Type': 'application/json',
      },
      // Use custom fetch if proxy is configured
      ...(customFetch && { fetch: customFetch }),
    });
  }

  /**
   * Get a valid access token, refreshing if necessary
   */
  async getAccessToken(): Promise<string> {
    // Check if we have a valid token
    if (this.currentToken && this.isTokenValid(this.currentToken)) {
      return this.currentToken.access_token;
    }

    // Fetch new token
    await this.fetchAccessToken();

    if (!this.currentToken) {
      throw new Error('Failed to obtain access token');
    }

    return this.currentToken.access_token;
  }

  /**
   * Check if token is still valid (with 5 minute buffer)
   */
  private isTokenValid(token: HRPToken): boolean {
    const now = Math.floor(Date.now() / 1000);
    const bufferTime = 5 * 60; // 5 minutes buffer
    return token.expires_at > now + bufferTime;
  }

  /**
   * Fetch new access token from HRP auth API
   */
  private async fetchAccessToken(): Promise<void> {
    const startTime = Date.now();

    const requestData = {
      client_id: this.hrpConfig.clientId,
      client_secret: this.hrpConfig.clientSecret,
      audience: this.hrpConfig.audience || 'https://api.hiddenroad.com/v0/',
      grant_type: 'client_credentials' as const,
    };

    this.logger.info('Fetching HRP access token');

    try {
      const { data, error } = await this.client.POST('/oauth/token', {
        body: requestData,
      });

      const duration = Date.now() - startTime;

      if (error) {
        this.logger.error('Failed to fetch HRP access token', { error, duration });
        throw new Error(`HRP authentication failed: ${error.error_description || error.error || 'Unknown error'}`);
      }

      if (!data) {
        throw new Error('No data received from HRP auth API');
      }

      // Calculate expiry timestamp
      const expiresAt = Math.floor(Date.now() / 1000) + data.expires_in;

      this.currentToken = {
        ...data,
        expires_at: expiresAt,
      };

      this.logger.info('Successfully obtained HRP access token', {
        expiresIn: data.expires_in,
        expiresAt,
        scope: data.scope,
        duration,
      });
    } catch (error) {
      this.logger.error('Error fetching HRP access token', { error });
      throw error;
    }
  }

  /**
   * Clear the current token (force refresh on next request)
   */
  clearToken(): void {
    this.currentToken = null;
  }

  /**
   * Get token info (for debugging/monitoring)
   */
  getTokenInfo(): Partial<HRPToken> | null {
    if (!this.currentToken) {
      return null;
    }

    return {
      token_type: this.currentToken.token_type,
      expires_in: this.currentToken.expires_in,
      expires_at: this.currentToken.expires_at,
      scope: this.currentToken.scope,
    };
  }
}
