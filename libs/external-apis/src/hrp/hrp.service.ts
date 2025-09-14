import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HrpClient, HrpAuthClient } from '../clients/hrp';

@Injectable()
export class HrpService {
  private readonly logger = new Logger(HrpService.name);
  private readonly hrpClient: HrpClient;
  private readonly hrpAuthClient: HrpAuthClient;

  constructor(private configService: ConfigService) {
    const hrpBaseUrl = this.configService.get<string>('HRP_BASE_URL') || '';
    const hrpAuthUrl = this.configService.get<string>('HRP_AUTH_URL') || '';

    this.hrpClient = new HrpClient(hrpBaseUrl);
    this.hrpAuthClient = new HrpAuthClient(hrpAuthUrl);

    this.logger.log('HRP service initialized');
  }

  /**
   * Get HRP data client
   */
  getDataClient(): HrpClient {
    return this.hrpClient;
  }

  /**
   * Get HRP auth client
   */
  getAuthClient(): HrpAuthClient {
    return this.hrpAuthClient;
  }

  /**
   * Health check for HRP connectivity
   */
  async isHealthy(): Promise<boolean> {
    try {
      // Implement a simple health check call to HRP
      // This is a placeholder - implement based on actual HRP API
      return true;
    } catch (error) {
      this.logger.error('HRP health check failed', error);
      return false;
    }
  }
}