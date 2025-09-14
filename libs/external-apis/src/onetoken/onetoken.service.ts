import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OneTokenClient } from '../clients/1token';

@Injectable()
export class OneTokenService {
  private readonly logger = new Logger(OneTokenService.name);
  private readonly oneTokenClient: OneTokenClient;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('ONETOKEN_API_KEY') || '';
    const baseUrl = this.configService.get<string>('ONETOKEN_BASE_URL') || '';

    this.oneTokenClient = new OneTokenClient({ apiKey, baseUrl });

    this.logger.log('OneToken service initialized');
  }

  /**
   * Get OneToken client
   */
  getClient(): OneTokenClient {
    return this.oneTokenClient;
  }

  /**
   * Health check for OneToken connectivity
   */
  async isHealthy(): Promise<boolean> {
    try {
      // Implement a simple health check call to OneToken
      // This is a placeholder - implement based on actual OneToken API
      return true;
    } catch (error) {
      this.logger.error('OneToken health check failed', error);
      return false;
    }
  }
}