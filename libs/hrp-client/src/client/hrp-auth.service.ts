import { Injectable, Inject, Logger } from '@nestjs/common';
import createClient from 'openapi-fetch';
import type { paths as HRPAuthPaths } from '../schemas/auth/schema';
import { HRPConfig } from '../types';
import { SocksProxyAgent } from 'socks-proxy-agent';
import fetch from 'node-fetch';

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
  expires_at: number;
}

@Injectable()
export class HRPAuthService {
  private readonly logger = new Logger(HRPAuthService.name);
  private readonly hrpConfig: HRPConfig;
  private readonly client: ReturnType<typeof createClient<HRPAuthPaths>>;
  private currentToken: TokenResponse | null = null;

  constructor(@Inject('HRP_CONFIG') config: HRPConfig) {
    this.hrpConfig = config;

    const customFetch = this.createFetchWithProxy();

    this.client = createClient<HRPAuthPaths>({
      baseUrl: this.hrpConfig.authBaseUrl || 'https://auth.hiddenroad.com',
      headers: {
        'Content-Type': 'application/json',
      },
      ...(customFetch && { fetch: customFetch }),
    });
  }

  private createFetchWithProxy() {
    if (!this.hrpConfig.proxy) {
      return undefined;
    }

    const { host, port, username, password } = this.hrpConfig.proxy;
    let proxyUrl = `socks5://`;

    if (username && password) {
      proxyUrl += `${username}:${password}@`;
    }
    proxyUrl += `${host}:${port}`;

    const agent = new SocksProxyAgent(proxyUrl);
    this.logger.log(`Configured SOCKS5 proxy for HRP auth: ${host}:${port}`);

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

  async getAccessToken(): Promise<string> {
    if (this.currentToken && this.isTokenValid(this.currentToken)) {
      return this.currentToken.access_token;
    }

    await this.fetchAccessToken();

    if (!this.currentToken) {
      throw new Error('Failed to obtain access token');
    }

    return this.currentToken.access_token;
  }

  private isTokenValid(token: TokenResponse): boolean {
    const now = Math.floor(Date.now() / 1000);
    const bufferTime = 5 * 60; // 5 minutes buffer
    return token.expires_at > now + bufferTime;
  }

  private async fetchAccessToken(): Promise<void> {
    const startTime = Date.now();
    const requestData = {
      client_id: this.hrpConfig.clientId,
      client_secret: this.hrpConfig.clientSecret,
      audience: this.hrpConfig.audience || 'https://api.hiddenroad.com/v0/',
      grant_type: 'client_credentials' as const,
    };

    this.logger.log('Fetching HRP access token');

    try {
      const { data, error } = await this.client.POST('/oauth/token', {
        params: {},
        body: requestData,
      });

      const duration = Date.now() - startTime;

      if (error) {
        this.logger.error('Failed to fetch HRP access token', { error, duration });
        throw new Error(
          `HRP authentication failed: ${(error as any).error_description || (error as any).error || 'Unknown error'}`
        );
      }

      if (!data) {
        throw new Error('No data received from HRP auth API');
      }

      const expiresAt = Math.floor(Date.now() / 1000) + data.expires_in;
      this.currentToken = {
        ...data,
        expires_at: expiresAt,
      };

      this.logger.log('Successfully obtained HRP access token', {
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

  clearToken(): void {
    this.currentToken = null;
  }

  getTokenInfo(): {
    token_type: string;
    expires_in: number;
    expires_at: number;
    scope?: string;
  } | null {
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