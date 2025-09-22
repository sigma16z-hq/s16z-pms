import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { SpotQuoteIngestionService } from './spot-quote-ingestion.service';
import { CURRENCY_SCHEDULER_CONSTANTS } from '../constants/scheduler.constants';

/**
 * Currency sync summary interface
 */
export interface CurrencySyncSummary {
  duration: string;
  backfillNeeded?: boolean;
  backfillSummary?: BackfillSummary | null;
  dailyRatesSummary?: DailyRatesSummary;
  currencies?: string[];
  exchange?: string;
  error?: string;
}

/**
 * Backfill summary interface
 */
export interface BackfillSummary {
  dateRange: string;
  totalDays: number;
  processedDays: number;
  skippedDays: number;
  totalRatesStored: number;
}

/**
 * Daily rates summary interface
 */
export interface DailyRatesSummary {
  date: string;
  ratesStored: number;
  currencies: Array<{ symbol: string; price: number }>;
}

/**
 * Currency sync result interface
 */
export interface CurrencySyncResult {
  message: string;
  timestamp: string;
  summary: CurrencySyncSummary;
}

/**
 * Schedule information interface
 */
export interface ScheduleInfo {
  isEnabled: boolean;
  schedule?: string;
  nextRun?: Date;
}

/**
 * Currency scheduler status interface
 */
export interface CurrencySchedulerStatus {
  enabled: boolean;
  currencies: string[];
  exchange: string;
  backfillDays: number;
  schedule?: string;
  nextRun?: string;
  lastRun: string;
}

/**
 * Currency Scheduler Service
 *
 * Schedules currency rate synchronization with configurable frequency via environment variables
 * Uses a single cron job with configurable expression
 *
 * Follows the same pattern as AccountsSchedulerService
 */
@Injectable()
export class CurrencySchedulerService {
  private readonly logger = new Logger(CurrencySchedulerService.name);

  private readonly currencies: string[];
  private readonly exchange: 'index' | 'cmc';
  private readonly backfillDays: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly spotQuoteIngestionService: SpotQuoteIngestionService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {
    // Load configuration from environment or defaults
    this.currencies = [...CURRENCY_SCHEDULER_CONSTANTS.DEFAULT_CONFIG.CURRENCIES];
    this.exchange = this.configService.get<'index' | 'cmc'>(
      CURRENCY_SCHEDULER_CONSTANTS.CONFIG_KEYS.EXCHANGE,
      CURRENCY_SCHEDULER_CONSTANTS.DEFAULT_CONFIG.EXCHANGE
    );
    this.backfillDays = this.configService.get<number>(
      CURRENCY_SCHEDULER_CONSTANTS.CONFIG_KEYS.BACKFILL_DAYS,
      CURRENCY_SCHEDULER_CONSTANTS.DEFAULT_CONFIG.BACKFILL_DAYS
    );

    this.logger.log(
      `🔧 Currency Scheduler initialized - currencies: ${this.currencies.join(', ')}, ` +
      `exchange: ${this.exchange}, backfill: ${this.backfillDays} days`
    );

    this.setupSchedule();
  }

  /**
   * Set up cron schedule based on environment configuration
   */
  private setupSchedule(): void {
    const cronExpression = this.configService.get<string>(
      CURRENCY_SCHEDULER_CONSTANTS.CONFIG_KEYS.SCHEDULE,
      CURRENCY_SCHEDULER_CONSTANTS.DEFAULT_SCHEDULE.CRON_EXPRESSION
    );
    const isEnabled = this.configService.get<string>(
      CURRENCY_SCHEDULER_CONSTANTS.CONFIG_KEYS.ENABLED,
      'true'
    ) === 'true';

    if (!isEnabled) {
      this.logger.log('Currency rate scheduling is disabled via CURRENCY_SYNC_ENABLED=false');
      return;
    }

    this.logger.log(`Setting up currency rate schedule: ${cronExpression}`);

    try {
      const job = new CronJob(cronExpression, () => {
        this.syncCurrencyRates().catch(error => {
          this.logger.error('Scheduled currency rate sync failed:', error);
        });
      });

      this.schedulerRegistry.addCronJob(CURRENCY_SCHEDULER_CONSTANTS.CRON_JOBS.CURRENCY_SYNC, job);
      job.start();

      this.logger.log('Currency rate schedule started successfully');
    } catch (error) {
      this.logger.error(`Failed to set up schedule with expression: ${cronExpression}`, error);
      throw error;
    }
  }

  /**
   * Perform currency rate synchronization
   */
  async syncCurrencyRates(): Promise<CurrencySyncResult> {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();

    this.logger.log('🚀 Starting currency rate synchronization');

    try {
      // Step 1: Check if backfill is needed
      this.logger.log('🔍 Checking if historical backfill is required...');
      const backfillNeeded = await this.spotQuoteIngestionService.checkBackfillRequired(
        this.currencies,
        this.backfillDays
      );

      let backfillSummary = null;
      if (backfillNeeded) {
        this.logger.log('⏳ Historical backfill required - processing missing data');
        backfillSummary = await this.performHistoricalBackfill();
      } else {
        this.logger.log('✅ No historical backfill required - data is up to date');
      }

      // Step 2: Fetch today's rates (yesterday's end-of-day prices)
      this.logger.log('📈 Fetching daily rates for yesterday...');
      const dailyRatesSummary = await this.fetchYesterdayRates();

      const duration = Date.now() - startTime;
      const summary = {
        duration: `${duration}ms`,
        backfillNeeded,
        backfillSummary,
        dailyRatesSummary,
        currencies: this.currencies,
        exchange: this.exchange,
      };

      this.logger.log(`🎉 Currency rate synchronization completed successfully in ${duration}ms`);

      return {
        message: 'Currency synchronization completed successfully',
        timestamp,
        summary,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`❌ Currency rate synchronization failed after ${duration}ms:`, error);

      return {
        message: 'Currency synchronization failed',
        timestamp,
        summary: {
          duration: `${duration}ms`,
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  /**
   * Manually trigger currency sync (for testing or manual runs)
   */
  async triggerManualSync(): Promise<CurrencySyncResult> {
    this.logger.log('Manual currency rate sync triggered');
    return await this.syncCurrencyRates();
  }

  /**
   * Update the schedule at runtime
   */
  updateSchedule(newCronExpression: string): void {
    try {
      // Remove existing job if it exists
      try {
        this.schedulerRegistry.deleteCronJob(CURRENCY_SCHEDULER_CONSTANTS.CRON_JOBS.CURRENCY_SYNC);
      } catch (error) {
        // Job doesn't exist, that's okay
      }

      // Create new job
      const job = new CronJob(newCronExpression, () => {
        this.syncCurrencyRates().catch(error => {
          this.logger.error('Updated scheduled currency rate sync failed:', error);
        });
      });

      this.schedulerRegistry.addCronJob(CURRENCY_SCHEDULER_CONSTANTS.CRON_JOBS.CURRENCY_SYNC, job);
      job.start();

      this.logger.log(`Currency rate schedule updated to: ${newCronExpression}`);
    } catch (error) {
      this.logger.error(`Failed to update currency rate schedule to: ${newCronExpression}`, error);
      throw error;
    }
  }

  /**
   * Get current schedule information
   */
  getScheduleInfo(): ScheduleInfo {
    const isEnabled = this.configService.get<string>(
      CURRENCY_SCHEDULER_CONSTANTS.CONFIG_KEYS.ENABLED,
      'true'
    ) === 'true';

    if (!isEnabled) {
      return { isEnabled: false };
    }

    try {
      const job = this.schedulerRegistry.getCronJob(CURRENCY_SCHEDULER_CONSTANTS.CRON_JOBS.CURRENCY_SYNC);
      if (job && job.isActive) {
        const currentSchedule = this.configService.get<string>(
          CURRENCY_SCHEDULER_CONSTANTS.CONFIG_KEYS.SCHEDULE,
          CURRENCY_SCHEDULER_CONSTANTS.DEFAULT_SCHEDULE.CRON_EXPRESSION
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

  /**
   * Get current service status
   */
  getStatus(): CurrencySchedulerStatus {
    const scheduleInfo = this.getScheduleInfo();

    return {
      enabled: scheduleInfo.isEnabled,
      currencies: this.currencies,
      exchange: this.exchange,
      backfillDays: this.backfillDays,
      schedule: scheduleInfo.schedule,
      nextRun: scheduleInfo.nextRun?.toISOString(),
      lastRun: 'Not tracked', // Could be enhanced to track last run time
    };
  }

  /**
   * Fetch yesterday's end-of-day rates
   */
  private async fetchYesterdayRates(): Promise<DailyRatesSummary> {
    // Get yesterday's date at 00:00 AM UTC
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    yesterday.setUTCHours(0, 0, 0, 0);

    this.logger.debug(`📊 Fetching rates for ${yesterday.toISOString().split('T')[0]}`);

    try {
      const results = await this.spotQuoteIngestionService.fetchAndStoreDailyRates(
        yesterday,
        this.currencies,
        this.exchange
      );

      const summary = {
        date: yesterday.toISOString().split('T')[0],
        ratesStored: results.length,
        currencies: results.map(r => ({ symbol: r.symbol, price: Number(r.price) })),
      };

      this.logger.log(`✅ Successfully fetched ${results.length} daily rates for yesterday`);
      return summary;

    } catch (error) {
      this.logger.error('❌ Failed to fetch yesterday rates:', error);
      throw error;
    }
  }

  /**
   * Perform historical backfill for missing data
   */
  private async performHistoricalBackfill(): Promise<BackfillSummary> {
    this.logger.log('📅 Starting historical backfill');

    try {
      // Calculate date range for backfill (last N days)
      const endDate = new Date();
      endDate.setUTCDate(endDate.getUTCDate() - 1); // Yesterday
      endDate.setUTCHours(0, 0, 0, 0);

      const startDate = new Date(endDate);
      startDate.setUTCDate(startDate.getUTCDate() - (this.backfillDays - 1));

      this.logger.debug(
        `📊 Backfill range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]} ` +
        `(${this.backfillDays} days)`
      );

      // Process dates sequentially to avoid overwhelming the API
      let totalRatesStored = 0;
      let processedDays = 0;
      let skippedDays = 0;

      const current = new Date(startDate);
      while (current <= endDate) {
        const dateStr = current.toISOString().split('T')[0];

        try {
          this.logger.debug(`📈 [${processedDays + 1}/${this.backfillDays}] Processing ${dateStr}...`);

          const results = await this.spotQuoteIngestionService.fetchAndStoreDailyRates(
            new Date(current),
            this.currencies,
            this.exchange
          );

          if (results.length > 0) {
            totalRatesStored += results.length;
            this.logger.debug(`✅ Stored ${results.length} rates for ${dateStr}`);
          } else {
            skippedDays++;
            this.logger.debug(`⚠️  No data available for ${dateStr}`);
          }

          processedDays++;

          // Add small delay between requests to be respectful to the API
          await this.delay(200);

        } catch (error) {
          skippedDays++;
          this.logger.warn(`❌ Failed to process ${dateStr}:`, error);
          // Continue with next date
        }

        current.setUTCDate(current.getUTCDate() + 1);
      }

      const summary = {
        dateRange: `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`,
        totalDays: this.backfillDays,
        processedDays,
        skippedDays,
        totalRatesStored,
      };

      this.logger.log(
        `✅ Historical backfill completed: processed ${processedDays} days, ` +
        `stored ${totalRatesStored} rates, skipped ${skippedDays} days`
      );

      return summary;

    } catch (error) {
      this.logger.error('❌ Historical backfill failed:', error);
      throw error;
    }
  }

  /**
   * Simple delay utility
   */
  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}