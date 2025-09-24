import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { DatabaseService } from '@app/database';
import { HrpTransferProcessorService } from './hrp-transfer-processor.service';
import { TRANSFERS_SCHEDULER_CONSTANTS, TransferType } from '../constants/scheduler.constants';
import { TransferIngestionParams, TransferJobStatus, ScheduleInfo } from '../types/hrp.types';

/**
 * Transfer sync summary interface
 */
export interface TransferSyncSummary {
  duration: string;
  shareClassesProcessed: number;
  totalTransfersProcessed: number;
  depositsProcessed: number;
  withdrawalsProcessed: number;
  dateRange: {
    startDate: string;
    endDate: string;
  };
  shareClassResults: Array<{
    shareClassName: string;
    transfersProcessed: number;
    success: boolean;
    error?: string;
  }>;
}

/**
 * Transfer sync result interface
 */
export interface TransferSyncResult {
  message: string;
  timestamp: string;
  summary: TransferSyncSummary;
}

/**
 * Transfers Scheduler Service
 *
 * Schedules HRP transfer synchronization with configurable frequency via environment variables
 * Uses a single cron job with configurable expression
 *
 * Follows the same pattern as CurrencySchedulerService
 */
@Injectable()
export class TransfersSchedulerService {
  private readonly logger = new Logger(TransfersSchedulerService.name);

  private readonly lookbackDaysDeposits: number;
  private readonly lookbackDaysWithdrawals: number;
  private readonly batchSize: number;
  private isRunning = false;
  private lastRunTime?: Date;
  private lastRunResult?: TransferSyncSummary;

  constructor(
    private readonly configService: ConfigService,
    private readonly hrpTransferProcessorService: HrpTransferProcessorService,
    private readonly databaseService: DatabaseService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {
    // Load configuration from environment or defaults
    this.lookbackDaysDeposits = this.configService.get<number>(
      TRANSFERS_SCHEDULER_CONSTANTS.CONFIG_KEYS.LOOKBACK_DAYS_DEPOSITS,
      TRANSFERS_SCHEDULER_CONSTANTS.DEFAULT_CONFIG.LOOKBACK_DAYS_DEPOSITS
    );
    this.lookbackDaysWithdrawals = this.configService.get<number>(
      TRANSFERS_SCHEDULER_CONSTANTS.CONFIG_KEYS.LOOKBACK_DAYS_WITHDRAWALS,
      TRANSFERS_SCHEDULER_CONSTANTS.DEFAULT_CONFIG.LOOKBACK_DAYS_WITHDRAWALS
    );
    this.batchSize = this.configService.get<number>(
      TRANSFERS_SCHEDULER_CONSTANTS.CONFIG_KEYS.BATCH_SIZE,
      TRANSFERS_SCHEDULER_CONSTANTS.DEFAULT_CONFIG.BATCH_SIZE
    );

    this.logger.log(
      `🔧 Transfer Scheduler initialized - deposits lookback: ${this.lookbackDaysDeposits} days, ` +
      `withdrawals lookback: ${this.lookbackDaysWithdrawals} days, batch size: ${this.batchSize}`
    );

    this.setupSchedule();
  }

  /**
   * Set up cron schedule based on environment configuration
   */
  private setupSchedule(): void {
    const cronExpression = this.configService.get<string>(
      TRANSFERS_SCHEDULER_CONSTANTS.CONFIG_KEYS.SCHEDULE,
      TRANSFERS_SCHEDULER_CONSTANTS.DEFAULT_SCHEDULE.CRON_EXPRESSION
    );
    const isEnabled = this.configService.get<string>(
      TRANSFERS_SCHEDULER_CONSTANTS.CONFIG_KEYS.ENABLED,
      'true'
    ) === 'true';

    if (!isEnabled) {
      this.logger.log('Transfer scheduling is disabled via TRANSFER_SYNC_ENABLED=false');
      return;
    }

    this.logger.log(`Setting up transfer sync schedule: ${cronExpression}`);

    try {
      const job = new CronJob(cronExpression, () => {
        this.syncTransfers().catch(error => {
          this.logger.error('Scheduled transfer sync failed:', error);
        });
      });

      this.schedulerRegistry.addCronJob(TRANSFERS_SCHEDULER_CONSTANTS.CRON_JOBS.TRANSFER_SYNC, job);
      job.start();

      this.logger.log('Transfer sync schedule started successfully');
    } catch (error) {
      this.logger.error(`Failed to set up schedule with expression: ${cronExpression}`, error);
      throw error;
    }
  }

  /**
   * Perform transfer synchronization
   */
  async syncTransfers(): Promise<TransferSyncResult> {
    if (this.isRunning) {
      const message = 'Transfer sync is already running';
      this.logger.warn(message);
      return {
        message,
        timestamp: new Date().toISOString(),
        summary: {
          duration: '0ms',
          shareClassesProcessed: 0,
          totalTransfersProcessed: 0,
          depositsProcessed: 0,
          withdrawalsProcessed: 0,
          dateRange: { startDate: '', endDate: '' },
          shareClassResults: [],
        },
      };
    }

    this.isRunning = true;
    this.lastRunTime = new Date();
    const startTime = Date.now();
    const timestamp = new Date().toISOString();

    this.logger.log('🚀 Starting transfer synchronization');

    try {
      // Get all active ShareClasses with API keys
      const shareClasses = await this.getActiveShareClasses();

      if (shareClasses.length === 0) {
        this.logger.warn('No active ShareClasses found with API keys');
        return this.createEmptyResult(timestamp, startTime);
      }

      this.logger.log(`Processing transfers for ${shareClasses.length} ShareClasses`);

      // Process deposits
      this.logger.log('📈 Processing deposits...');
      const depositParams = this.createTransferParams('deposit', this.lookbackDaysDeposits);
      const depositResults = await this.hrpTransferProcessorService.processMultipleShareClasses(
        shareClasses,
        depositParams
      );

      // Process withdrawals
      this.logger.log('📉 Processing withdrawals...');
      const withdrawalParams = this.createTransferParams('withdrawal', this.lookbackDaysWithdrawals);
      const withdrawalResults = await this.hrpTransferProcessorService.processMultipleShareClasses(
        shareClasses,
        withdrawalParams
      );

      // Combine results
      const shareClassResults = this.combineResults(shareClasses, depositResults, withdrawalResults);
      const totalTransfersProcessed = shareClassResults.reduce((sum, result) => sum + result.transfersProcessed, 0);
      const depositsProcessed = Array.from(depositResults.values()).reduce((sum, count) => sum + count, 0);
      const withdrawalsProcessed = Array.from(withdrawalResults.values()).reduce((sum, count) => sum + count, 0);

      const duration = Date.now() - startTime;
      const summary = {
        duration: `${duration}ms`,
        shareClassesProcessed: shareClasses.length,
        totalTransfersProcessed,
        depositsProcessed,
        withdrawalsProcessed,
        dateRange: {
          startDate: depositParams.startDate.toISOString().split('T')[0],
          endDate: depositParams.endDate.toISOString().split('T')[0],
        },
        shareClassResults,
      };

      this.lastRunResult = summary;
      this.logger.log(`🎉 Transfer synchronization completed successfully in ${duration}ms`);
      this.logger.log(`📊 Processed ${totalTransfersProcessed} transfers (${depositsProcessed} deposits, ${withdrawalsProcessed} withdrawals)`);

      return {
        message: 'Transfer synchronization completed successfully',
        timestamp,
        summary,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`❌ Transfer synchronization failed after ${duration}ms:`, error);

      const summary = {
        duration: `${duration}ms`,
        shareClassesProcessed: 0,
        totalTransfersProcessed: 0,
        depositsProcessed: 0,
        withdrawalsProcessed: 0,
        dateRange: { startDate: '', endDate: '' },
        shareClassResults: [{
          shareClassName: 'ALL',
          transfersProcessed: 0,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        }],
      };

      this.lastRunResult = summary;

      return {
        message: 'Transfer synchronization failed',
        timestamp,
        summary,
      };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Manually trigger transfer sync (for testing or manual runs)
   */
  async triggerManualSync(): Promise<TransferSyncResult> {
    this.logger.log('Manual transfer sync triggered');
    return await this.syncTransfers();
  }

  /**
   * Update the schedule at runtime
   */
  updateSchedule(newCronExpression: string): void {
    try {
      // Remove existing job if it exists
      try {
        this.schedulerRegistry.deleteCronJob(TRANSFERS_SCHEDULER_CONSTANTS.CRON_JOBS.TRANSFER_SYNC);
      } catch (error) {
        // Job doesn't exist, that's okay
      }

      // Create new job
      const job = new CronJob(newCronExpression, () => {
        this.syncTransfers().catch(error => {
          this.logger.error('Updated scheduled transfer sync failed:', error);
        });
      });

      this.schedulerRegistry.addCronJob(TRANSFERS_SCHEDULER_CONSTANTS.CRON_JOBS.TRANSFER_SYNC, job);
      job.start();

      this.logger.log(`Transfer sync schedule updated to: ${newCronExpression}`);
    } catch (error) {
      this.logger.error(`Failed to update transfer sync schedule to: ${newCronExpression}`, error);
      throw error;
    }
  }

  /**
   * Get current schedule information
   */
  getScheduleInfo(): ScheduleInfo {
    const isEnabled = this.configService.get<string>(
      TRANSFERS_SCHEDULER_CONSTANTS.CONFIG_KEYS.ENABLED,
      'true'
    ) === 'true';

    if (!isEnabled) {
      return { enabled: false, cronExpression: '', timezone: '', nextRunTime: undefined, lastRunTime: this.lastRunTime };
    }

    try {
      const job = this.schedulerRegistry.getCronJob(TRANSFERS_SCHEDULER_CONSTANTS.CRON_JOBS.TRANSFER_SYNC);
      if (job && job.isActive) {
        const currentSchedule = this.configService.get<string>(
          TRANSFERS_SCHEDULER_CONSTANTS.CONFIG_KEYS.SCHEDULE,
          TRANSFERS_SCHEDULER_CONSTANTS.DEFAULT_SCHEDULE.CRON_EXPRESSION
        );

        return {
          enabled: true,
          cronExpression: currentSchedule,
          timezone: TRANSFERS_SCHEDULER_CONSTANTS.DEFAULT_SCHEDULE.TIMEZONE,
          nextRunTime: job.nextDate()?.toJSDate(),
          lastRunTime: this.lastRunTime,
        };
      }
    } catch (error) {
      this.logger.warn('Failed to get schedule info:', error);
    }

    return { enabled: false, cronExpression: '', timezone: '', nextRunTime: undefined, lastRunTime: this.lastRunTime };
  }

  /**
   * Get current job status
   */
  getStatus(): TransferJobStatus {
    const scheduleInfo = this.getScheduleInfo();

    return {
      isRunning: this.isRunning,
      lastRunTime: this.lastRunTime,
      nextRunTime: scheduleInfo.nextRunTime,
      lastRunResult: this.lastRunResult ? {
        transfersProcessed: this.lastRunResult.totalTransfersProcessed,
        errors: this.lastRunResult.shareClassResults
          .filter(r => !r.success && r.error)
          .map(r => r.error!),
        duration: parseInt(this.lastRunResult.duration.replace('ms', ''), 10),
      } : undefined,
      schedule: scheduleInfo.enabled ? {
        enabled: true,
        cronExpression: scheduleInfo.cronExpression,
      } : undefined,
    };
  }

  /**
   * Get active ShareClasses with API credentials
   */
  private async getActiveShareClasses() {
    return await this.databaseService.shareClass.findMany({
      where: {
        apiKeys: { not: null },
      },
    });
  }

  /**
   * Create transfer ingestion parameters
   */
  private createTransferParams(transferType: TransferType, lookbackDays: number): TransferIngestionParams {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setUTCDate(startDate.getUTCDate() - lookbackDays);

    return {
      startDate,
      endDate,
      transferType,
      batchSize: this.batchSize,
    };
  }

  /**
   * Combine deposit and withdrawal results
   */
  private combineResults(
    shareClasses: any[],
    depositResults: Map<string, number>,
    withdrawalResults: Map<string, number>
  ) {
    return shareClasses.map(shareClass => {
      const deposits = depositResults.get(shareClass.name) || 0;
      const withdrawals = withdrawalResults.get(shareClass.name) || 0;
      const totalTransfers = deposits + withdrawals;

      return {
        shareClassName: shareClass.name,
        transfersProcessed: totalTransfers,
        success: true, // Individual errors are logged but don't fail the entire process
      };
    });
  }

  /**
   * Create empty result for early returns
   */
  private createEmptyResult(timestamp: string, startTime: number): TransferSyncResult {
    const duration = Date.now() - startTime;
    return {
      message: 'No ShareClasses found for processing',
      timestamp,
      summary: {
        duration: `${duration}ms`,
        shareClassesProcessed: 0,
        totalTransfersProcessed: 0,
        depositsProcessed: 0,
        withdrawalsProcessed: 0,
        dateRange: { startDate: '', endDate: '' },
        shareClassResults: [],
      },
    };
  }
}