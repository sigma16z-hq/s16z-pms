import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { DatabaseService } from '@app/database';
import { HRPAccountProcessorService } from './hrp-account-processor.service';
import { SCHEDULER_CONSTANTS } from '../constants/scheduler.constants';

/**
 * Accounts Scheduler Service
 *
 * Schedules HRP account processing with configurable frequency via environment variables
 * Uses a single cron job with configurable expression
 */
@Injectable()
export class AccountsSchedulerService {
  private readonly logger = new Logger(AccountsSchedulerService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly databaseService: DatabaseService,
    private readonly accountProcessor: HRPAccountProcessorService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {
    this.setupSchedule();
  }

  /**
   * Set up cron schedule based on environment configuration
   */
  private setupSchedule(): void {
    const cronExpression = this.configService.get<string>(
      SCHEDULER_CONSTANTS.CONFIG_KEYS.SCHEDULE,
      SCHEDULER_CONSTANTS.DEFAULT_SCHEDULE.CRON_EXPRESSION
    );
    const isEnabled = this.configService.get<string>(
      SCHEDULER_CONSTANTS.CONFIG_KEYS.ENABLED,
      'true'
    ) === 'true';

    if (!isEnabled) {
      this.logger.log('HRP Accounts scheduling is disabled via HRP_ACCOUNTS_ENABLED=false');
      return;
    }

    this.logger.log(`Setting up HRP accounts schedule: ${cronExpression}`);

    try {
      const job = new CronJob(cronExpression, () => {
        this.processAllShareClassAccounts().catch(error => {
          this.logger.error('Scheduled HRP accounts sync failed:', error);
        });
      });

      this.schedulerRegistry.addCronJob(SCHEDULER_CONSTANTS.CRON_JOBS.HRP_ACCOUNTS, job);
      job.start();

      this.logger.log('HRP accounts schedule started successfully');
    } catch (error) {
      this.logger.error(`Failed to set up schedule with expression: ${cronExpression}`, error);
      throw error;
    }
  }

  /**
   * Process accounts for all ShareClasses
   */
  async processAllShareClassAccounts(): Promise<void> {
    const startTime = Date.now();
    this.logger.log('🚀 Starting HRP accounts processing for all ShareClasses');

    try {
      // Get all active ShareClasses
      const shareClasses = await this.databaseService.shareClass.findMany({
        where: {
          // Add any filtering criteria if needed
        },
      });

      if (shareClasses.length === 0) {
        this.logger.warn('No ShareClasses found in database');
        return;
      }

      this.logger.log(`Found ${shareClasses.length} ShareClasses to process: ${shareClasses.map(sc => sc.name).join(', ')}`);

      // Process each ShareClass
      const results = await this.accountProcessor.processMultipleShareClasses(shareClasses);

      // Log results summary
      let totalProcessed = 0;
      for (const [shareClassName, accounts] of results.entries()) {
        this.logger.log(`✅ ShareClass ${shareClassName}: ${accounts.length} accounts processed`);
        totalProcessed += accounts.length;
      }

      const duration = Date.now() - startTime;
      this.logger.log(`🎉 HRP accounts processing completed successfully! Total: ${totalProcessed} accounts processed in ${duration}ms`);

    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`❌ HRP accounts processing failed after ${duration}ms:`, error);
      throw error;
    }
  }

  /**
   * Manually trigger account processing (for testing or manual runs)
   */
  async triggerManualSync(): Promise<void> {
    this.logger.log('Manual HRP accounts sync triggered');
    await this.processAllShareClassAccounts();
  }

  /**
   * Update the schedule at runtime
   */
  updateSchedule(newCronExpression: string): void {
    try {
      // Remove existing job if it exists
      try {
        this.schedulerRegistry.deleteCronJob(SCHEDULER_CONSTANTS.CRON_JOBS.HRP_ACCOUNTS);
      } catch (error) {
        // Job doesn't exist, that's okay
      }

      // Create new job
      const job = new CronJob(newCronExpression, () => {
        this.processAllShareClassAccounts().catch(error => {
          this.logger.error('Updated scheduled HRP accounts sync failed:', error);
        });
      });

      this.schedulerRegistry.addCronJob(SCHEDULER_CONSTANTS.CRON_JOBS.HRP_ACCOUNTS, job);
      job.start();

      this.logger.log(`HRP accounts schedule updated to: ${newCronExpression}`);
    } catch (error) {
      this.logger.error(`Failed to update HRP accounts schedule to: ${newCronExpression}`, error);
      throw error;
    }
  }

  /**
   * Get current schedule information
   */
  getScheduleInfo(): { isEnabled: boolean; schedule?: string; nextRun?: Date } {
    const isEnabled = this.configService.get<string>(
      SCHEDULER_CONSTANTS.CONFIG_KEYS.ENABLED,
      'true'
    ) === 'true';

    if (!isEnabled) {
      return { isEnabled: false };
    }

    try {
      const job = this.schedulerRegistry.getCronJob(SCHEDULER_CONSTANTS.CRON_JOBS.HRP_ACCOUNTS);
      if (job && job.isActive) {
        const currentSchedule = this.configService.get<string>(
          SCHEDULER_CONSTANTS.CONFIG_KEYS.SCHEDULE,
          SCHEDULER_CONSTANTS.DEFAULT_SCHEDULE.CRON_EXPRESSION
        );

        return {
          isEnabled: true,
          schedule: currentSchedule,
          nextRun: job.nextDate()?.toJSDate(),
        };
      }
    } catch (error) {
      this.logger.warn('Failed to get schedule info:', error);
    }

    return { isEnabled: false };
  }
}