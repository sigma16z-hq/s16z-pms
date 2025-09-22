import { Injectable, Logger, Inject } from '@nestjs/common';
import { SpotQuoteRepository } from '@app/database';
import { OneTokenService } from '@s16z/onetoken-client';
import { SpotQuote, Prisma } from '@prisma/client';
import { CURRENCY_SCHEDULER_CONSTANTS, CurrencyExchange } from '../constants/scheduler.constants';

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

    // Create timestamp for 00:00:00 of the requested date
    const startOfDay = new Date(date);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const timestampNano = startOfDay.getTime() * 1000000; // Convert to nanoseconds

    this.logger.debug(`📊 Using timestamp: ${timestampNano} (${startOfDay.toISOString()})`);

    try {
      // Fetch rates from 1Token API
      this.logger.debug(`🔗 Calling 1Token API: /quote/last-price-before-timestamp`);

      // Get base client and use its internal client for API call
      const baseClient = this.oneTokenService.getBaseClient();

      const requestOptions: {
        params: {
          query: {
            currency: string;
            exchange: string;
            timestamp: string;
          };
        };
        headers?: Record<string, string>;
      } = {
        params: {
          query: {
            currency: currencies.join(','),
            exchange,
            timestamp: timestampNano.toString(),
          }
        }
      };

      // Add auth headers if not using middleware
      if (!(baseClient as any).useMiddleware) {
        requestOptions.headers = await (baseClient as any).getAuthHeaders();
      }

      const response = await (baseClient as any).client.GET('/quote/last-price-before-timestamp', requestOptions);

      if (!response.data || !Array.isArray(response.data) || response.data.length === 0) {
        this.logger.warn(`No price data returned for ${date.toISOString().split('T')[0]}`);
        return results;
      }

      // Process each price and store in database
      for (const priceData of response.data) {
        try {
          // Extract symbol from contract (e.g., "index/btc.usd" -> "btc")
          const symbol = this.extractSymbolFromContract(priceData.contract);
          if (!symbol) {
            this.logger.warn(`Could not extract symbol from contract: ${priceData.contract}`);
            continue;
          }

          // Check if record already exists
          const existingRecord = await this.spotQuoteRepository.findByDate(symbol.toLowerCase(), date);

          let rateRecord: SpotQuote;
          if (existingRecord) {
            // Update existing record
            rateRecord = await this.spotQuoteRepository.update(existingRecord.id, {
              price: new Prisma.Decimal(priceData.last),
              fetchedAt: new Date(),
              originalTm: priceData.tm ? BigInt(priceData.tm) : null,
              metadata: priceData as any,
            });
          } else {
            // Create new record
            rateRecord = await this.spotQuoteRepository.create({
              symbol: symbol.toLowerCase(),
              baseCurrency: 'usd',
              price: new Prisma.Decimal(priceData.last),
              dataSource: '1token',
              exchange,
              contract: priceData.contract,
              priceDate: date,
              fetchedAt: new Date(),
              originalTm: priceData.tm ? BigInt(priceData.tm) : null,
              metadata: priceData as any,
            });
          }

          results.push(rateRecord);
          this.logger.debug(`Stored rate: ${symbol} = $${priceData.last} (${priceData.contract})`);
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
      const endDate = new Date();
      endDate.setUTCHours(0, 0, 0, 0);
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - backfillDays);

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
   * Check if historical backfill is required by looking for missing data and gaps
   * @param currencies - Currencies to check (defaults to defaultCurrencies)
   * @param backfillDays - Number of days to check (defaults to config)
   * @returns Boolean indicating if backfill is needed
   */
  async checkBackfillRequired(
    currencies: string[] = this.defaultCurrencies,
    backfillDays: number = CURRENCY_SCHEDULER_CONSTANTS.DEFAULT_CONFIG.BACKFILL_DAYS
  ): Promise<boolean> {
    this.logger.debug(`🔍 Checking backfill for ${currencies.length} currencies: ${currencies.join(', ')}`);

    let needsBackfill = false;

    for (const currency of currencies) {
      try {
        this.logger.debug(`📋 Checking available dates for ${currency}...`);

        // Get available dates for this currency in the backfill period
        const availableDates = await this.getAvailableDates(currency, backfillDays);

        this.logger.debug(`💾 ${currency}: Found ${availableDates.length}/${backfillDays} days of recent historical data`);

        // Check 1: Missing recent data
        if (availableDates.length < backfillDays) {
          this.logger.log(`🔄 ${currency} needs recent backfill: ${availableDates.length}/${backfillDays} days available`);
          needsBackfill = true;
        }

        // Check 2: Look for gaps in existing data
        const gaps = await this.detectDataGaps(currency);
        if (gaps.length > 0) {
          const totalMissingDays = gaps.reduce((sum, gap) => sum + gap.missingDays, 0);
          this.logger.log(`🕳️  ${currency} has ${gaps.length} gaps totaling ${totalMissingDays} missing days`);
          needsBackfill = true;

          // Log the gaps for visibility
          gaps.forEach((gap, index) => {
            this.logger.debug(`   Gap ${index + 1}: ${gap.startDate} to ${gap.endDate} (${gap.missingDays} days missing)`);
          });
        } else {
          this.logger.debug(`✅ ${currency} has no gaps in existing data`);
        }
      } catch (error) {
        this.logger.warn(`⚠️ Error checking backfill for ${currency}:`, error);
        this.logger.debug(`🔄 Assuming backfill needed due to error`);
        needsBackfill = true;
      }
    }

    if (needsBackfill) {
      this.logger.log('🔄 Backfill required - found missing data or gaps');
    } else {
      this.logger.log('✅ All currencies have complete historical data');
    }

    return needsBackfill;
  }

  /**
   * Detect gaps in existing data for a specific currency
   */
  private async detectDataGaps(currency: string): Promise<Array<{startDate: string, endDate: string, missingDays: number}>> {
    try {
      // Get all existing dates for this currency (simplified approach)
      const existingRecords = await this.spotQuoteRepository.findBySymbol(currency.toLowerCase());

      // Filter by exchange and sort by date
      const existingDates = existingRecords
        .filter(record => record.exchange === CURRENCY_SCHEDULER_CONSTANTS.DEFAULT_CONFIG.EXCHANGE)
        .map(record => ({ priceDate: record.priceDate }))
        .sort((a, b) => a.priceDate.getTime() - b.priceDate.getTime());

      if (existingDates.length < 2) {
        return []; // Need at least 2 dates to detect gaps
      }

      const gaps: Array<{startDate: string, endDate: string, missingDays: number}> = [];

      for (let i = 1; i < existingDates.length; i++) {
        const prevDate = new Date(existingDates[i - 1].priceDate);
        const currDate = new Date(existingDates[i].priceDate);
        const daysDiff = Math.floor((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));

        if (daysDiff > 1) {
          const gapStart = new Date(prevDate);
          gapStart.setDate(gapStart.getDate() + 1);
          const gapEnd = new Date(currDate);
          gapEnd.setDate(gapEnd.getDate() - 1);

          gaps.push({
            startDate: gapStart.toISOString().split('T')[0],
            endDate: gapEnd.toISOString().split('T')[0],
            missingDays: daysDiff - 1,
          });
        }
      }

      return gaps;
    } catch (error) {
      this.logger.error(`Failed to detect gaps for ${currency}:`, error);
      return [];
    }
  }

  /**
   * Extract currency symbol from 1Token contract string
   * @param contract - Contract string (e.g., "index/btc.usd")
   * @returns Currency symbol or null if extraction fails
   */
  private extractSymbolFromContract(contract: string): string | null {
    try {
      // Handle contract formats like "index/btc.usd", "cmc/eth.usd"
      const parts = contract.split('/');
      if (parts.length >= 2) {
        const symbolPart = parts[1].split('.')[0]; // Get "btc" from "btc.usd"
        return symbolPart.toLowerCase();
      }

      // Fallback: try to extract directly
      const symbolMatch = contract.match(/([a-zA-Z]+)/);
      return symbolMatch ? symbolMatch[1].toLowerCase() : null;
    } catch (error) {
      this.logger.warn(`Failed to extract symbol from contract: ${contract}`, error);
      return null;
    }
  }
}