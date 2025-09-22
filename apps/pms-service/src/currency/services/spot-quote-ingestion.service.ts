import { Injectable, Logger, Inject } from '@nestjs/common';
import { SpotQuoteRepository, DateGap } from '@app/database';
import { OneTokenService, HistoricalPrice } from '@s16z/onetoken-client';
import { SpotQuote, Prisma } from '@prisma/client';
import { CURRENCY_SCHEDULER_CONSTANTS, CurrencyExchange } from '../constants/scheduler.constants';
import { startOfDay, subDays } from 'date-fns';

/**
 * Currency backfill analysis result
 */
export interface CurrencyBackfillAnalysis {
  currency: string;
  needsBackfill: boolean;
  availableDays: number;
  totalDays: number;
  gaps: DateGap[];
  missingRecentDays: number;
}

/**
 * Backfill requirement result with detailed analysis
 */
export interface BackfillRequirementResult {
  needsBackfill: boolean;
  currencyAnalyses: CurrencyBackfillAnalysis[];
}

/**
 * SpotQuoteIngestionService - Manages fetching and storing historical currency exchange rates
 *
 * This service is responsible for:
 * 1. Fetching daily currency rates from 1Token API at scheduled intervals
 * 2. Storing rates in the database for conversion calculations
 * 3. Providing cached rate lookup for portfolio valuations
 * 4. Handling historical backfill and gap detection
 *
 * Direct port from POC SpotQuoteService with NestJS integration.
 */
@Injectable()
export class SpotQuoteIngestionService {
  private readonly logger = new Logger(SpotQuoteIngestionService.name);

  // Default currencies to track (from constants)
  private defaultCurrencies = [...CURRENCY_SCHEDULER_CONSTANTS.DEFAULT_CONFIG.CURRENCIES];

  constructor(
    private readonly oneTokenService: OneTokenService,
    @Inject('SpotQuoteRepository') private readonly spotQuoteRepository: SpotQuoteRepository
  ) {}

  /**
   * Fetch and store historical rates for a specific date
   * @param date - Date to fetch rates for
   * @param currencies - Array of currency symbols to fetch (defaults to defaultCurrencies)
   * @param exchange - Data source: 'index' or 'cmc' (defaults to 'index')
   * @returns Array of stored rate records
   */
  async fetchAndStoreDailyRates(
    date: Date,
    currencies: string[] = this.defaultCurrencies,
    exchange: CurrencyExchange = 'index'
  ): Promise<SpotQuote[]> {

    this.logger.log(`🌐 Fetching historical rates for ${date.toISOString().split('T')[0]} - currencies: ${currencies.join(', ')}, exchange: ${exchange}`);

    const results: SpotQuote[] = [];

    try {
      // Fetch rates from 1Token API using clean service interface
      this.logger.debug(`🔗 Fetching historical prices from OneToken API`);

      const priceDataArray = await this.oneTokenService.getHistoricalPrices(currencies, exchange, date);

      if (!priceDataArray || priceDataArray.length === 0) {
        this.logger.warn(`No price data returned for ${date.toISOString().split('T')[0]}`);
        return results;
      }

      // Process each clean price and store in database
      for (const priceData of priceDataArray) {
        try {
          // Check if record already exists
          const existingRecord = await this.spotQuoteRepository.findByDate(priceData.symbol, date);

          let rateRecord: SpotQuote;
          if (existingRecord) {
            // Update existing record
            rateRecord = await this.spotQuoteRepository.update(existingRecord.id, {
              price: new Prisma.Decimal(priceData.price),
              fetchedAt: new Date(),
              originalTm: priceData.timestamp ? BigInt(priceData.timestamp) : null,
              metadata: priceData.metadata,
            });
          } else {
            // Create new record
            rateRecord = await this.spotQuoteRepository.create({
              symbol: priceData.symbol,
              baseCurrency: 'usd',
              price: new Prisma.Decimal(priceData.price),
              dataSource: '1token',
              exchange,
              contract: priceData.contract,
              priceDate: date,
              fetchedAt: new Date(),
              originalTm: priceData.timestamp ? BigInt(priceData.timestamp) : null,
              metadata: priceData.metadata,
            });
          }

          results.push(rateRecord);
          this.logger.debug(`Stored rate: ${priceData.symbol} = $${priceData.price} (${priceData.contract})`);
        } catch (error) {
          this.logger.error(`Failed to store rate for ${priceData.contract}:`, error);
        }
      }

      this.logger.log(`Successfully stored ${results.length} historical rates for ${date.toISOString().split('T')[0]}`);
      return results;

    } catch (error) {
      this.logger.error(`Failed to fetch historical rates for ${date.toISOString().split('T')[0]}:`, error);
      throw error;
    }
  }

  /**
   * Get available dates for a currency in recent backfill period
   * @param currency - Currency symbol
   * @param backfillDays - Number of recent days to check
   * @returns Array of available dates
   */
  async getAvailableDates(currency: string, backfillDays: number): Promise<Date[]> {
    try {
      // Use date-fns for clean date calculations
      const endDate = startOfDay(new Date());
      const startDate = subDays(endDate, backfillDays);

      const records = await this.spotQuoteRepository.findByDateRange(
        currency.toLowerCase(),
        startDate,
        endDate
      );

      return records.map(record => record.priceDate);
    } catch (error) {
      this.logger.error(`Failed to get available dates for ${currency}:`, error);
      return [];
    }
  }

  /**
   * Analyze backfill requirements with detailed gap information
   * @param currencies - Currencies to check (defaults to defaultCurrencies)
   * @param backfillDays - Number of days to check (defaults to config)
   * @returns Detailed backfill analysis including gaps for each currency
   */
  async analyzeBackfillRequirements(
    currencies: string[] = this.defaultCurrencies,
    backfillDays: number = CURRENCY_SCHEDULER_CONSTANTS.DEFAULT_CONFIG.BACKFILL_DAYS
  ): Promise<BackfillRequirementResult> {
    this.logger.debug(`🔍 Analyzing backfill for ${currencies.length} currencies: ${currencies.join(', ')}`);

    const currencyAnalyses: CurrencyBackfillAnalysis[] = [];
    let needsBackfill = false;

    for (const currency of currencies) {
      try {
        this.logger.debug(`📋 Analyzing ${currency}...`);

        // Get available dates for this currency in the backfill period
        const availableDates = await this.getAvailableDates(currency, backfillDays);
        const missingRecentDays = Math.max(0, backfillDays - availableDates.length);

        // Get gaps in existing data using SQL-based detection
        const gaps = await this.spotQuoteRepository.detectGaps(currency, CURRENCY_SCHEDULER_CONSTANTS.DEFAULT_CONFIG.EXCHANGE);

        const currencyNeedsBackfill = missingRecentDays > 0 || gaps.length > 0;
        if (currencyNeedsBackfill) {
          needsBackfill = true;
        }

        const analysis: CurrencyBackfillAnalysis = {
          currency,
          needsBackfill: currencyNeedsBackfill,
          availableDays: availableDates.length,
          totalDays: backfillDays,
          gaps,
          missingRecentDays
        };

        currencyAnalyses.push(analysis);

        // Log analysis results
        this.logger.debug(`💾 ${currency}: Found ${availableDates.length}/${backfillDays} days of recent historical data`);

        if (missingRecentDays > 0) {
          this.logger.log(`🔄 ${currency} needs recent backfill: missing ${missingRecentDays} recent days`);
        }

        if (gaps.length > 0) {
          const totalMissingDays = gaps.reduce((sum, gap) => sum + gap.missingDays, 0);
          this.logger.log(`🕳️  ${currency} has ${gaps.length} gaps totaling ${totalMissingDays} missing days`);

          // Log the gaps for visibility
          gaps.forEach((gap, index) => {
            this.logger.debug(`   Gap ${index + 1}: ${gap.startDate} to ${gap.endDate} (${gap.missingDays} days missing)`);
          });
        } else {
          this.logger.debug(`✅ ${currency} has no gaps in existing data`);
        }
      } catch (error) {
        this.logger.warn(`⚠️ Error analyzing backfill for ${currency}:`, error);

        // Create error analysis - assume backfill needed
        const errorAnalysis: CurrencyBackfillAnalysis = {
          currency,
          needsBackfill: true,
          availableDays: 0,
          totalDays: backfillDays,
          gaps: [],
          missingRecentDays: backfillDays
        };

        currencyAnalyses.push(errorAnalysis);
        needsBackfill = true;
      }
    }

    if (needsBackfill) {
      this.logger.log('🔄 Backfill required - found missing data or gaps');
    } else {
      this.logger.log('✅ All currencies have complete historical data');
    }

    return {
      needsBackfill,
      currencyAnalyses
    };
  }

  /**
   * Check if historical backfill is required (simple boolean version)
   * @param currencies - Currencies to check (defaults to defaultCurrencies)
   * @param backfillDays - Number of days to check (defaults to config)
   * @returns Boolean indicating if backfill is needed
   */
  async checkBackfillRequired(
    currencies: string[] = this.defaultCurrencies,
    backfillDays: number = CURRENCY_SCHEDULER_CONSTANTS.DEFAULT_CONFIG.BACKFILL_DAYS
  ): Promise<boolean> {
    const analysis = await this.analyzeBackfillRequirements(currencies, backfillDays);
    return analysis.needsBackfill;
  }

  /**
   * Detect gaps for a currency using SQL
   * @param currency - Currency to check
   * @returns Array of gaps
   */
  async detectGaps(currency: string): Promise<DateGap[]> {
    return this.spotQuoteRepository.detectGaps(currency, CURRENCY_SCHEDULER_CONSTANTS.DEFAULT_CONFIG.EXCHANGE);
  }


}