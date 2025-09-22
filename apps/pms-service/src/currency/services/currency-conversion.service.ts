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
   * Database stores currency→USD rates, so we use simple dedicated methods
   * @param amount - Amount to convert
   * @param sourceCurrency - Source currency symbol (e.g., 'USD', 'BTC', 'ETH')
   * @param targetCurrency - Target currency symbol (e.g., 'USD', 'BTC', 'ETH')
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

      // Same currency - no conversion needed
      if (from === to) {
        return amount;
      }

      // USD to other currency
      if (from === 'usd') {
        return this.convertFromUSDInternal(amount, to, timestamp);
      }

      // Other currency to USD
      if (to === 'usd') {
        return this.convertToUSDInternal(amount, from, timestamp);
      }

      // Cross-currency conversion (e.g., ETH to BTC)
      return this.convertCrossCurrency(amount, from, to, timestamp);

    } catch (error) {
      this.logger.error(`Currency conversion error (${sourceCurrency} -> ${targetCurrency}):`, error);
      return null;
    }
  }

  /**
   * Convert from USD to another currency (private helper)
   * @param amount - Amount in USD
   * @param currency - Target currency symbol
   * @param timestamp - Date for rate lookup
   * @returns Promise resolving to converted amount, or null if rate not found
   */
  private async convertFromUSDInternal(amount: number, currency: string, timestamp: Date): Promise<number | null> {
    const rate = await this.getRate(currency, timestamp);
    if (rate === null) {
      this.logger.warn(`No rate found for ${currency} on ${timestamp.toISOString()}`);
      return null;
    }

    // USD to currency: divide by the currency/USD rate
    const result = amount / rate;
    this.logger.debug(`USD → ${currency.toUpperCase()}: ${amount} / ${rate} = ${result}`);
    return result;
  }

  /**
   * Convert from another currency to USD (private helper)
   * @param amount - Amount in source currency
   * @param currency - Source currency symbol
   * @param timestamp - Date for rate lookup
   * @returns Promise resolving to USD amount, or null if rate not found
   */
  private async convertToUSDInternal(amount: number, currency: string, timestamp: Date): Promise<number | null> {
    const rate = await this.getRate(currency, timestamp);
    if (rate === null) {
      this.logger.warn(`No rate found for ${currency} on ${timestamp.toISOString()}`);
      return null;
    }

    // Currency to USD: multiply by the currency/USD rate
    const result = amount * rate;
    this.logger.debug(`${currency.toUpperCase()} → USD: ${amount} * ${rate} = ${result}`);
    return result;
  }

  /**
   * Convert between two non-USD currencies (e.g., ETH to BTC)
   * Formula: ETH → BTC = (ETH/USD) / (BTC/USD) * amount
   * @param amount - Amount in source currency
   * @param fromCurrency - Source currency symbol
   * @param toCurrency - Target currency symbol
   * @param timestamp - Date for rate lookup
   * @returns Promise resolving to converted amount, or null if rates not found
   */
  private async convertCrossCurrency(
    amount: number,
    fromCurrency: string,
    toCurrency: string,
    timestamp: Date
  ): Promise<number | null> {
    // Get both rates from database
    const fromRate = await this.getRate(fromCurrency, timestamp);
    const toRate = await this.getRate(toCurrency, timestamp);

    if (fromRate === null) {
      this.logger.warn(`No rate found for ${fromCurrency} on ${timestamp.toISOString()}`);
      return null;
    }

    if (toRate === null) {
      this.logger.warn(`No rate found for ${toCurrency} on ${timestamp.toISOString()}`);
      return null;
    }

    // Cross rate: (fromCurrency/USD) / (toCurrency/USD) * amount
    const crossRate = fromRate / toRate;
    const result = amount * crossRate;

    this.logger.debug(
      `${fromCurrency.toUpperCase()} → ${toCurrency.toUpperCase()}: ` +
      `${amount} * (${fromRate}/${toRate}) = ${result}`
    );

    return result;
  }

  /**
   * Convert amount to USD using direct rate lookup
   * @param amount - Amount to convert
   * @param sourceCurrency - Source currency symbol
   * @param timestamp - Date for rate lookup
   * @returns Promise resolving to USD amount, or null if conversion fails
   */
  async convertToUSD(amount: number, sourceCurrency: string, timestamp: Date): Promise<number | null> {
    if (sourceCurrency.toLowerCase() === 'usd') {
      return amount; // Already in USD
    }

    return this.convertToUSDInternal(amount, sourceCurrency.toLowerCase(), timestamp);
  }

  /**
   * Convert amount from USD to target currency using SpotQuoteRepository
   * @param amount - Amount in USD to convert
   * @param targetCurrency - Target currency symbol
   * @param timestamp - Date for rate lookup
   * @returns Promise resolving to converted amount, or null if conversion fails
   */
  async convertFromUSD(amount: number, targetCurrency: string, timestamp: Date): Promise<number | null> {
    if (targetCurrency.toLowerCase() === 'usd') {
      return amount; // Already in USD
    }

    return this.convertFromUSDInternal(amount, targetCurrency.toLowerCase(), timestamp);
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
   * Check if conversion is supported between two currencies
   * @param sourceCurrency - Source currency symbol
   * @param targetCurrency - Target currency symbol
   * @returns Boolean indicating if conversion is theoretically supported
   */
  isConversionSupported(sourceCurrency: string, targetCurrency: string): boolean {
    const from = sourceCurrency.toLowerCase();
    const to = targetCurrency.toLowerCase();

    // Same currency is always supported
    if (from === to) {
      return true;
    }

    // USD conversions are always supported if we have the rate data
    if (from === 'usd' || to === 'usd') {
      return true;
    }

    // Non-USD to non-USD conversions are supported via USD intermediate
    return true;
  }

  /**
   * Convert multiple amounts with different source currencies to a common target currency
   * @param conversions - Array of conversion requests
   * @param timestamp - Date for rate lookup
   * @returns Promise resolving to array of conversion results
   */
  async convertMultiple(
    conversions: CurrencyConversionRequest[],
    timestamp: Date
  ): Promise<CurrencyConversionResult[]> {
    const results: CurrencyConversionResult[] = [];

    for (const conversion of conversions) {
      const convertedAmount = await this.convertCurrency(
        conversion.amount,
        conversion.sourceCurrency,
        conversion.targetCurrency,
        timestamp
      );

      results.push({
        originalAmount: conversion.amount,
        sourceCurrency: conversion.sourceCurrency,
        targetCurrency: conversion.targetCurrency,
        convertedAmount,
        success: convertedAmount !== null,
      });
    }

    return results;
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