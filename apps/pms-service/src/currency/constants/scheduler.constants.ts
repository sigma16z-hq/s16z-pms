/**
 * Scheduler constants for currency domain
 */
export const CURRENCY_SCHEDULER_CONSTANTS = {
  CRON_JOBS: {
    CURRENCY_SYNC: 'currency-rate-sync'
  },
  DEFAULT_SCHEDULE: {
    CRON_EXPRESSION: '0 1 * * *', // Daily at 1 AM UTC
    TIMEZONE: 'UTC'
  },
  CONFIG_KEYS: {
    SCHEDULE: 'CURRENCY_SYNC_SCHEDULE',
    ENABLED: 'CURRENCY_SYNC_ENABLED',
    EXCHANGE: 'CURRENCY_EXCHANGE',
    BACKFILL_DAYS: 'CURRENCY_BACKFILL_DAYS'
  },
  DEFAULT_CONFIG: {
    ENABLED: true,
    CURRENCIES: ['BTC', 'ETH'],
    EXCHANGE: 'cmc', // Prefer 'cmc' (hour-level)
    BACKFILL_DAYS: 300, // Keep recent historical data
  }
} as const;

export type CurrencyExchange = 'index' | 'cmc';
export type SupportedCurrency = typeof CURRENCY_SCHEDULER_CONSTANTS.DEFAULT_CONFIG.CURRENCIES[number];