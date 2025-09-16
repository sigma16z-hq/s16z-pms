# Accounts Domain

## Overview
The Accounts domain handles HRP account processing, classification, and management. It automatically syncs account data from HRP API and classifies accounts into Trading, Basic, or Triparty types based on business rules.

## Features

✅ **Configurable Scheduling** - Environment-based cron configuration
✅ **Multi-ShareClass Support** - Processes accounts for all ShareClasses
✅ **Account Classification** - Automatic trading/basic/triparty classification
✅ **Manual Triggering** - REST API endpoints for manual operations
✅ **Comprehensive Logging** - Detailed processing and error logs
✅ **Error Resilience** - Continues processing if individual accounts fail

## Environment Configuration

### Required Environment Variables

```bash
# HRP API Credentials (from database seeding)
HRP_USDT_CLIENT_ID=your_usdt_client_id
HRP_USDT_CLIENT_SECRET=your_usdt_client_secret
HRP_BTC_CLIENT_ID=your_btc_client_id
HRP_BTC_CLIENT_SECRET=your_btc_client_secret
HRP_ETH_CLIENT_ID=your_eth_client_id
HRP_ETH_CLIENT_SECRET=your_eth_client_secret
```

### Optional Configuration

```bash
# Scheduling Configuration
HRP_ACCOUNTS_SCHEDULE="0 2 * * *"     # Custom cron expression (default: daily at 2 AM)
HRP_ACCOUNTS_ENABLED=true             # Enable/disable account processing (default: true)

# Examples of schedule configurations:
# HRP_ACCOUNTS_SCHEDULE="*/15 * * * *"    # Every 15 minutes
# HRP_ACCOUNTS_SCHEDULE="0 */6 * * *"     # Every 6 hours
# HRP_ACCOUNTS_SCHEDULE="0 8 * * 1-5"     # 8 AM weekdays only
# HRP_ACCOUNTS_SCHEDULE="0 0 */2 * *"     # Every 2 days at midnight
```

### Cron Expression Format
```
┌───────────── minute (0 - 59)
│ ┌───────────── hour (0 - 23)
│ │ ┌───────────── day of the month (1 - 31)
│ │ │ ┌───────────── month (1 - 12)
│ │ │ │ ┌───────────── day of the week (0 - 6) (Sunday to Saturday)
│ │ │ │ │
* * * * *
```

## Account Classification Rules

### Trading Accounts
- **Pattern**: Contains `hrp` followed by consecutive digits (e.g., `hrp1234567890`)
- **Stored in**: `hrpTradingAccount` table
- **Types**:
  - `FUNDING` - if account name contains "FUNDING" (case-insensitive)
  - `OTHER` - all other trading accounts
- **Venue**: Mapped to counterparty via venue name

### Basic Accounts
- **Pattern**: No HRP ID pattern and venue is not "zodia"
- **Stored in**: `hrpBasicAccount` table
- **Denomination**: Uses ShareClass denomination currency

### Triparty Accounts
- **Pattern**: Venue is "zodia" (case-insensitive)
- **Stored in**: `tripartyAccount` table
- **Venue**: Always mapped to ZODIA counterparty

## API Endpoints

### Manual Operations

```bash
# Trigger manual account sync (async)
POST /accounts/sync

# Get current schedule information
GET /accounts/schedule

# Get overall status
GET /accounts/status
```

### Example Responses

**GET /accounts/status**:
```json
{
  "service": "HRP Accounts Processor",
  "enabled": true,
  "schedule": "daily at 2 AM",
  "nextRun": "2024-01-02T02:00:00.000Z",
  "endpoints": {
    "manualSync": "POST /accounts/sync",
    "scheduleInfo": "GET /accounts/schedule"
  }
}
```

**POST /accounts/sync**:
```json
{
  "message": "HRP accounts synchronization started",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

## Service Architecture

### HRPAccountProcessorService
- **Purpose**: Core business logic for account processing and classification
- **Methods**:
  - `processAccountsForShareClass()` - Process accounts for single ShareClass
  - `processMultipleShareClasses()` - Process accounts for multiple ShareClasses
- **Features**: Account classification, database upserts, validation

### AccountsSchedulerService
- **Purpose**: Manages scheduled and manual account synchronization
- **Methods**:
  - `processAllShareClassAccounts()` - Process accounts for all ShareClasses
  - `triggerManualSync()` - Manual sync trigger
  - `updateSchedule()` - Runtime schedule updates
- **Features**: Configurable cron scheduling, dynamic schedule updates

## Integration Points

### Dependencies
- **@app/database** - Database operations and repositories
- **@app/external-apis** - HRP client for API communication
- **@nestjs/schedule** - Cron job scheduling
- **@nestjs/config** - Environment configuration

### Database Tables Used
- `shareClass` - Source of ShareClass configurations
- `counterparty` - Venue to counterparty mapping
- `hrpTradingAccount` - Trading account storage
- `hrpBasicAccount` - Basic account storage
- `tripartyAccount` - Triparty account storage

## Usage Examples

### Development Setup

```bash
# 1. Set environment variables in .env
HRP_ACCOUNTS_SCHEDULE="*/30 * * * *"  # Every 30 minutes for testing
HRP_ACCOUNTS_ENABLED=true

# 2. Start the service
pnpm start:dev

# 3. Check logs for automatic scheduling
# [AccountsSchedulerService] Setting up dynamic HRP accounts schedule: */30 * * * *
# [AccountsSchedulerService] Dynamic HRP accounts schedule started successfully
```

### Manual Testing

```bash
# Trigger manual sync
curl -X POST http://localhost:3000/accounts/sync

# Check status
curl http://localhost:3000/accounts/status

# Check schedule info
curl http://localhost:3000/accounts/schedule
```

### Production Configuration

```bash
# Run once daily at 2 AM
HRP_ACCOUNTS_SCHEDULE="0 2 * * *"
HRP_ACCOUNTS_ENABLED=true

# Or disable scheduling entirely for manual-only operation
HRP_ACCOUNTS_ENABLED=false
```

## Logging and Monitoring

### Log Examples

**Successful Processing**:
```
[AccountsSchedulerService] 🚀 Starting HRP accounts processing for all ShareClasses
[AccountsSchedulerService] Found 3 ShareClasses to process: USDT, BTC, ETH
[HRPAccountProcessorService] Processing HRP accounts for shareClass: USDT
[HRPAccountProcessorService] Fetched 25 accounts from HRP for shareClass: USDT
[HRPAccountProcessorService] HRP Trading account saved: hrp1234567890 (type: FUNDING, venue: BINANCE, shareClass: USDT)
[AccountsSchedulerService] ✅ ShareClass USDT: 25 accounts processed
[AccountsSchedulerService] 🎉 HRP accounts processing completed successfully! Total: 75 accounts processed in 2847ms
```

**Error Handling**:
```
[HRPAccountProcessorService] Invalid account format: invalid:format
[HRPAccountProcessorService] Failed to save trading account: hrp123456789
[AccountsSchedulerService] ❌ HRP accounts processing failed after 1234ms: Error details
```

### Monitoring Metrics
- **Processing Duration**: Logged for each complete run
- **Success/Failure Counts**: Per ShareClass and total
- **Account Classification**: Counts by type (Trading/Basic/Triparty)
- **API Response Times**: HRP API call performance

## Troubleshooting

### No Accounts Processed
- Check HRP API credentials in ShareClass records
- Verify HRP API connectivity and authentication
- Check if accounts are returned from HRP API

### Schedule Not Running
- Verify `HRP_ACCOUNTS_ENABLED=true`
- Check cron expression syntax with online validator
- Look for schedule setup errors in application startup logs

### Classification Issues
- Review account naming patterns in logs
- Verify counterparty data exists (from database seeding)
- Check venue name matching (case-insensitive)

### Database Errors
- Ensure all required tables exist (run migrations)
- Check for foreign key constraint violations
- Verify ShareClass and Counterparty seed data exists