import { Injectable, Logger, Inject } from '@nestjs/common';
import { SpotQuoteRepository } from '@app/database';

/**
 * Currency conversion request interface
 */
export interface CurrencyConversionRequest {
  amount: number;
  sourceCurrency: string;
  targetCurrency: string;
}

/**
 * Currency conversion result interface
 */
export interface CurrencyConversionResult {
  originalAmount: number;
  sourceCurrency: string;
  targetCurrency: string;
  convertedAmount: number | null;
  success: boolean;
}

/**
 * Exchange rate information interface
 */
export interface ExchangeRateInfo {
  sourceCurrency: string;
  targetCurrency: string;
  rate: number;
  timestamp: Date;
}


/**
 * CurrencyConversionService - Provides currency conversion functionality
 *
 * This service handles conversion between different currencies using real market rates
 * from the SpotQuote repository. It supports all currency pairs and provides intelligent
 * fallback mechanisms when exact rates are not available.
 *
 * Direct port from POC with NestJS integration.
 */
@Injectable()
export class CurrencyConversionService {
  private readonly logger = new Logger(CurrencyConversionService.name);

  constructor(@Inject('SpotQuoteRepository') private readonly spotQuoteRepository: SpotQuoteRepository) {}

  /**
   * Convert amount from one currency to another using real market rates
   * @param amount - Amount to convert
   * @param sourceCurrency - Source currency symbol
   * @param targetCurrency - Target currency symbol
   * @param timestamp - Date for rate lookup
   * @returns Promise resolving to converted amount, or null if conversion fails
   */
  async convertCurrency(
    amount: number,
    sourceCurrency: string,
    targetCurrency: string,
    timestamp: Date
  ): Promise<number | null> {
    try {
      const from = sourceCurrency.toLowerCase();
      const to = targetCurrency.toLowerCase();

      if (from === to) return amount;

      // USD to other currency
      if (from === 'usd') {
        const rate = await this.getRate(to, timestamp);
        return rate ? amount / rate : null;
      }

      // Other currency to USD
      if (to === 'usd') {
        const rate = await this.getRate(from, timestamp);
        return rate ? amount * rate : null;
      }

      // Cross-currency conversion (e.g., ETH to BTC)
      const fromRate = await this.getRate(from, timestamp);
      const toRate = await this.getRate(to, timestamp);

      if (!fromRate || !toRate) return null;

      return amount * (fromRate / toRate);

    } catch (error) {
      this.logger.error(`Currency conversion error (${sourceCurrency} -> ${targetCurrency}):`, error);
      return null;
    }
  }


  /**
   * Get exchange rate between two currencies
   * @param sourceCurrency - Source currency symbol
   * @param targetCurrency - Target currency symbol
   * @param timestamp - Date for rate lookup
   * @returns Promise resolving to exchange rate (1 unit of source = X units of target), or null if not available
   */
  async getExchangeRate(sourceCurrency: string, targetCurrency: string, timestamp: Date): Promise<number | null> {
    // Simply convert 1 unit to get the exchange rate
    return this.convertCurrency(1, sourceCurrency, targetCurrency, timestamp);
  }

  /**
   * Get rate from SpotQuote repository (internal method)
   * @param symbol - Currency symbol
   * @param timestamp - Date for rate lookup
   * @returns Promise resolving to rate, or null if not found
   */
  private async getRate(symbol: string, timestamp: Date): Promise<number | null> {
    try {
      const queryDate = new Date(timestamp);
      queryDate.setHours(0, 0, 0, 0); // Start of day

      // Try to find exact date first
      let spotQuote = await this.spotQuoteRepository.findByDate(symbol.toLowerCase(), queryDate);

      // If not found, try to find the latest available rate
      if (!spotQuote) {
        spotQuote = await this.spotQuoteRepository.findLatestBySymbol(symbol.toLowerCase());

        // Only use if it's not from the future
        if (spotQuote && spotQuote.priceDate > queryDate) {
          spotQuote = null;
        }
      }

      return spotQuote ? Number(spotQuote.price) : null;
    } catch (error) {
      this.logger.error(`Failed to get rate for ${symbol} on ${timestamp.toISOString()}:`, error);
      return null;
    }
  }
}