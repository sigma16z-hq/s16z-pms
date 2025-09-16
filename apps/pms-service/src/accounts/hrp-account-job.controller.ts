import { Controller, Get, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { AccountsSchedulerService } from './services/accounts-scheduler.service';

/**
 * HRP Account Job Controller
 *
 * Provides REST endpoints for HRP account job management operations
 */
@Controller('hrp-account-jobs')
export class HrpAccountJobController {
  constructor(private readonly accountsScheduler: AccountsSchedulerService) {}

  /**
   * Get current scheduling information
   */
  @Get('schedule')
  getScheduleInfo() {
    return this.accountsScheduler.getScheduleInfo();
  }

  /**
   * Manually trigger HRP accounts synchronization
   */
  @Post('sync')
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerManualSync() {
    // Don't await - return immediately and let it run in background
    this.accountsScheduler.triggerManualSync().catch(error => {
      console.error('Manual HRP accounts sync failed:', error);
    });

    return {
      message: 'HRP accounts synchronization started',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get accounts sync status (basic info)
   */
  @Get('status')
  getAccountsStatus() {
    const scheduleInfo = this.accountsScheduler.getScheduleInfo();

    return {
      service: 'HRP Accounts Processor',
      enabled: scheduleInfo.isEnabled,
      schedule: scheduleInfo.schedule,
      nextRun: scheduleInfo.nextRun,
      endpoints: {
        manualSync: 'POST /hrp-account-jobs/sync',
        scheduleInfo: 'GET /hrp-account-jobs/schedule',
      },
    };
  }
}