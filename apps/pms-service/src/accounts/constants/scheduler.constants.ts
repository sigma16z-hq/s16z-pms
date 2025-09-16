/**
 * Scheduler constants for HRP accounts domain
 */
export const SCHEDULER_CONSTANTS = {
  CRON_JOBS: {
    HRP_ACCOUNTS: 'hrp-accounts-processor'
  },
  DEFAULT_SCHEDULE: {
    CRON_EXPRESSION: '0 2 * * *', // Daily at 2 AM
    TIMEZONE: 'UTC'
  },
  CONFIG_KEYS: {
    SCHEDULE: 'HRP_ACCOUNTS_SCHEDULE',
    ENABLED: 'HRP_ACCOUNTS_ENABLED'
  }
} as const;