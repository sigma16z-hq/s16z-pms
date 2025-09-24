import { Controller, Post, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { TransfersSchedulerService, TransferSyncResult } from '../services/transfers-scheduler.service';
import { TransferJobStatus, ScheduleInfo } from '../types/hrp.types';

/**
 * Transfer schedule information interface
 */
export interface TransferScheduleInfo {
  enabled: boolean;
  schedule?: string;
  timeZone: string;
  nextRun?: string;
  lastRun?: string;
  description: string;
  configuration: {
    lookbackDaysDeposits: number;
    lookbackDaysWithdrawals: number;
    batchSize: number;
  };
}

/**
 * HrpTransferJobController - Manual trigger endpoints for transfer operations
 *
 * Follows the same pattern as CurrencyJobController
 */
@Controller('hrp-transfer-jobs')
export class HrpTransferJobController {

  constructor(private readonly transfersSchedulerService: TransfersSchedulerService) {}

  /**
   * Manual trigger for HRP transfer synchronization
   */
  @Post('sync')
  @HttpCode(HttpStatus.OK)
  async triggerSync(): Promise<TransferSyncResult> {
    return await this.transfersSchedulerService.triggerManualSync();
  }

  /**
   * Get current transfer job status
   */
  @Get('status')
  async getStatus(): Promise<TransferJobStatus> {
    return this.transfersSchedulerService.getStatus();
  }

  /**
   * Get schedule information and configuration
   */
  @Get('schedule')
  async getScheduleInfo(): Promise<TransferScheduleInfo> {
    const scheduleInfo = this.transfersSchedulerService.getScheduleInfo();
    const status = this.transfersSchedulerService.getStatus();

    return {
      enabled: scheduleInfo.enabled,
      schedule: scheduleInfo.cronExpression,
      timeZone: scheduleInfo.timezone,
      nextRun: scheduleInfo.nextRunTime?.toISOString(),
      lastRun: scheduleInfo.lastRunTime?.toISOString(),
      description: 'Daily HRP transfer synchronization with multi-shareclass support',
      configuration: {
        lookbackDaysDeposits: 300, // From constants or could be made configurable
        lookbackDaysWithdrawals: 600,
        batchSize: 100,
      },
    };
  }
}