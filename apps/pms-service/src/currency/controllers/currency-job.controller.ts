import { Controller, Post, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { CurrencySchedulerService, CurrencySyncResult, CurrencySchedulerStatus } from '../services/currency-scheduler.service';

/**
 * Currency schedule information interface
 */
export interface CurrencyScheduleInfo {
  enabled: boolean;
  schedule?: string;
  timeZone: string;
  nextRun?: string;
  lastRun: string;
  description: string;
  configuration: {
    currencies: string[];
    exchange: string;
    backfillDays: number;
  };
}

/**
 * CurrencyJobController - Manual trigger endpoints for currency operations
 *
 * Follows the same pattern as HrpAccountJobController
 */
@Controller('currency-jobs')
export class CurrencyJobController {

  constructor(private readonly currencySchedulerService: CurrencySchedulerService) {}

  /**
   * Manual trigger for currency rate synchronization
   */
  @Post('sync')
  @HttpCode(HttpStatus.OK)
  async triggerSync(): Promise<CurrencySyncResult> {
    return await this.currencySchedulerService.triggerManualSync();
  }

  /**
   * Get current currency job status and configuration
   */
  @Get('status')
  async getStatus(): Promise<CurrencySchedulerStatus> {
    return this.currencySchedulerService.getStatus();
  }

  /**
   * Get schedule information and configuration
   */
  @Get('schedule')
  async getScheduleInfo(): Promise<CurrencyScheduleInfo> {
    const scheduleInfo = this.currencySchedulerService.getScheduleInfo();
    const status = this.currencySchedulerService.getStatus();

    return {
      enabled: scheduleInfo.isEnabled,
      schedule: scheduleInfo.schedule,
      timeZone: 'UTC',
      nextRun: scheduleInfo.nextRun?.toISOString(),
      lastRun: status.lastRun,
      description: 'Daily currency rate synchronization from 1Token API',
      configuration: {
        currencies: status.currencies,
        exchange: status.exchange,
        backfillDays: status.backfillDays,
      },
    };
  }
}