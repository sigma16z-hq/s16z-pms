# Refined HRP Transfers Domain Implementation Plan

## Executive Summary

Based on analysis of the annamite-pms POC implementation, this plan refines the transfers domain migration to incorporate proven patterns and address real-world implementation challenges discovered in the POC.

**Key Insights from POC Analysis:**
- ✅ **Currency conversion** is critical and complex
- ✅ **Batch processing** with skipDuplicates is essential
- ✅ **Account type mapping** follows clear business rules
- ✅ **Portfolio filtering** ensures data relevance
- ✅ **Share class integration** provides proper scoping

## Revised Architecture

### Core Services (Following Accounts Domain Pattern)

#### 1. HrpTransferProcessorService
**Purpose**: Main service for processing HRP transfer events into database records
**Location**: `apps/pms-service/src/transfers/services/hrp-transfer-processor.service.ts`

**Key Features from POC:**
- HRP API integration with multi-shareclass support
- Currency conversion with exchange rate lookup
- Account type mapping (BASIC ↔ TRADING)
- Transfer direction handling (Deposit/Withdraw)
- Batch processing with duplicate prevention
- Portfolio-filtered account processing
- Robust error handling with graceful degradation

#### 2. TransfersSchedulerService
**Purpose**: Automated transfer synchronization (following AccountsSchedulerService pattern)
**Location**: `apps/pms-service/src/transfers/services/transfers-scheduler.service.ts`

**Features:**
- Configurable cron scheduling
- Environment-driven enablement
- Integration with HrpTransferProcessorService
- Progress tracking and monitoring

## Database Integration

### Transfer Model (Proven from POC)
```typescript
interface TransferEntity {
  // Amounts in two currencies
  denomAmount: Decimal    // Original transaction amount
  denomCcy: string       // Original transaction currency
  baseAmount: Decimal?   // Converted amount (nullable on conversion failure)
  baseCcy: string       // Target shareclass currency

  // Account relationships with type indicators
  fromAccountType: AccountType
  fromAccountId: bigint
  toAccountType: AccountType
  toAccountId: bigint

  // Timestamps
  valuationTime: DateTime
  transferTime: DateTime
}
```

### Business Key Uniqueness (From POC Schema)
```typescript
// Prevents duplicates across all transfer dimensions
@@unique([
  denomAmount,
  denomCcy,
  transferTime,
  fromAccountType,
  fromAccountId,
  toAccountType,
  toAccountId
], name: "unique_transfer_business_key")
```

## Implementation Patterns from POC

### 1. Currency Conversion Pattern
```typescript
// From hrp-transfer-service.ts
private async createTransferEntity(transfer: HRPTransferEvent): Promise<TransferInput | null> {
  const denomCcy = transfer.asset;
  const denomAmount = Number(transfer.quantity);
  const baseCcy = await this.getBaseCurrencyForAccount(account);

  let baseAmount = denomAmount;
  let exchangeRate = 1;

  if (denomCcy.toLowerCase() !== baseCcy.toLowerCase()) {
    const conversion = await this.convertCurrency(denomAmount, denomCcy, baseCcy, transferDate);
    if (!conversion) {
      baseAmount = null; // Graceful degradation
      this.logger.warn(`Setting baseAmount to null due to conversion failure`);
    } else {
      baseAmount = conversion.baseAmount;
      exchangeRate = conversion.exchangeRate;
    }
  }

  return { denomAmount, baseAmount, denomCcy, baseCcy, /* ... */ };
}
```

### 2. Batch Processing Pattern
```typescript
// From hrp-transfer-service.ts
const result = await this.prisma.transfer.createMany({
  data: entities,
  skipDuplicates: true, // Critical for handling race conditions
});
console.log(`Created ${result.count} transfers`);
```

### 3. Portfolio Filtering Pattern
```typescript
// From trading-account-transfer-service.ts
private async filterTargetTradingAccounts(accounts: AccountInfo[]): Promise<AccountInfo[]> {
  const accountsWithPortfolio = [];

  for (const account of tradingAccounts) {
    const dbAccount = await this.prisma.hrpTradingAccount.findUnique({
      where: { id: account.id },
      select: { portfolioId: true, name: true }
    });

    if (dbAccount?.portfolioId) {
      accountsWithPortfolio.push(account);
    }
  }

  return accountsWithPortfolio;
}
```

### 4. Multi-ShareClass Processing Pattern
```typescript
// From trading-account-transfer-service.ts
const shareClassPromises = Array.from(this.hrpClients.entries()).map(async ([shareClassName, hrpClient]) => {
  const shareClass = await this.prisma.shareClass.findUniqueOrThrow({
    where: { name: shareClassName },
  });

  const savedAccounts = await this.fetchAccounts(shareClass, hrpClient);
  const targetAccounts = this.filterTargetTradingAccounts(savedAccounts);

  await this.fetchTransfersForAccounts(shareClass, targetAccounts, hrpClient);
});

await Promise.allSettled(shareClassPromises);
```

## Revised Module Structure (Following Accounts Domain Pattern)

```
apps/pms-service/src/transfers/
├── services/
│   ├── hrp-transfer-processor.service.ts  # Main HRP transfer processing service
│   └── transfers-scheduler.service.ts     # Automated scheduling service
├── controllers/
│   └── hrp-transfer-job.controller.ts     # Manual trigger endpoints & status
├── constants/
│   └── scheduler.constants.ts             # Scheduler configuration constants
├── types/
│   └── hrp.types.ts                       # Transfer domain types
├── transfers.module.ts                    # NestJS module configuration
└── index.ts                               # Export barrel
```

## Key Business Rules (Validated from POC)

### Transfer Direction Mapping
```typescript
// Deposits: BASIC → TRADING
if (savedAccount.type === AccountType.TRADING && type === 'Deposit') {
  fromAccountType = AccountType.BASIC;
  fromAccountId = shareClassAccountId;
  toAccountType = AccountType.TRADING;
  toAccountId = savedAccount.id;
}

// Withdrawals: TRADING → BASIC
if (savedAccount.type === AccountType.TRADING && type === 'Withdraw') {
  fromAccountType = AccountType.TRADING;
  fromAccountId = savedAccount.id;
  toAccountType = AccountType.BASIC;
  toAccountId = shareClassAccountId;
}
```

### Currency Conversion Rules
1. **Same currency**: Rate = 1, no conversion needed
2. **USD equivalents**: USDT/USDC treated as USD (rate = 1)
3. **To USD**: Use direct rate from SpotQuote
4. **From USD**: Use inverse rate (1/price)
5. **Cross-rate**: Calculate via USD (fromRate/toRate)
6. **Conversion failure**: Set baseAmount = null, continue processing

### Date Range Strategy (From POC)
- **Deposits**: 300 days lookback
- **Withdrawals**: 600 days lookback
- **Page size**: 100 items per API call
- **Batch processing**: Process all pages for date range

## API Integration Patterns

### HRP Client Usage
```typescript
// Deposits
const deposits = await hrpClient.fetchAllDeposits({
  startEventTimestampInclusive: startTime.toISOString(),
  endEventTimestampExclusive: endTime.toISOString(),
  pageSize: 100,
  venue: account.hrpAccount.venue,
  account: account.hrpAccount.account.split(':')[0], // Remove venue prefix
});

// Withdrawals
const withdrawals = await hrpClient.fetchAllWithdrawals({
  startEventTimestampInclusive: startTime.toISOString(),
  endEventTimestampExclusive: endTime.toISOString(),
  pageSize: 100,
  venue: account.hrpAccount.venue,
  account: account.hrpAccount.account.split(':')[0],
});
```

## Controller Endpoints (Following Accounts Pattern)

```typescript
@Controller('hrp-transfer-jobs')
export class HrpTransferJobController {
  @Post('sync')
  async triggerSync(): Promise<{ message: string; timestamp: string }> {
    // Manual trigger for transfer synchronization
  }

  @Get('status')
  async getStatus(): Promise<TransferJobStatus> {
    // Current transfer job status and statistics
  }

  @Get('schedule')
  async getScheduleInfo(): Promise<ScheduleInfo> {
    // Schedule configuration and next run time
  }
}
```

## Environment Configuration

```env
# Transfer Scheduler Configuration
TRANSFER_SYNC_ENABLED=true
TRANSFER_SYNC_SCHEDULE="0 2 * * *"  # Daily at 2 AM
TRANSFER_LOOKBACK_DAYS_DEPOSITS=300
TRANSFER_LOOKBACK_DAYS_WITHDRAWALS=600
TRANSFER_BATCH_SIZE=100
```

## Implementation Phases

### Phase 1: Core Processing (Day 1-2)
1. Create module structure following accounts domain pattern
2. Implement `HrpTransferProcessorService` with currency conversion
3. Set up database integration with Prisma
4. Create unit tests for business logic

### Phase 2: HRP Integration (Day 2-3)
1. Implement `HrpTransferProcessorService` with HRP client integration
2. Add multi-shareclass credential management
3. Implement portfolio filtering logic
4. Add batch processing with duplicate prevention

### Phase 3: Scheduling & Automation (Day 3-4)
1. Create `TransfersSchedulerService` with cron jobs
2. Implement `HrpTransferJobController` for manual triggers
3. Add environment configuration support
4. Create monitoring and status reporting

### Phase 4: Testing & Validation (Day 4-5)
1. Comprehensive unit test suite
2. Integration testing with real HRP data
3. Performance testing with large datasets
4. End-to-end validation with accounts domain

## Success Metrics

- [ ] **Data Integrity**: All transfers processed without data loss
- [ ] **Currency Conversion**: >95% successful conversion rate
- [ ] **Performance**: Process 10,000+ transfers in <5 minutes
- [ ] **Reliability**: Handle API failures gracefully
- [ ] **Accuracy**: Exact match with POC transfer data for test accounts

## Risk Mitigation

### Currency Conversion Failures
- Set baseAmount = null for failed conversions
- Continue processing other transfers
- Log conversion failures for monitoring
- Implement retry logic for transient failures

### API Rate Limiting
- Implement exponential backoff
- Respect HRP API rate limits
- Process shareclass clients in parallel
- Use configurable batch sizes

### Large Dataset Processing
- Stream processing for memory efficiency
- Batch database operations
- Implement cursor-based pagination
- Use connection pooling

## Dependencies

### Required Services
- **Accounts Domain**: Account classification and validation
- **HRP Client**: API integration (`libs/hrp-client`)
- **Database**: Prisma repositories (`libs/database`)

### External Dependencies
- **SpotQuote table**: Currency exchange rates
- **ShareClass records**: API credentials and base currencies
- **Portfolio assignments**: Account filtering

## Handoff Documentation

### Service Capabilities
- `HrpTransferProcessorService`: Automated HRP transfer synchronization and processing
- `TransfersSchedulerService`: Scheduled and manual transfer operations

### Integration Points
- **Currency Domain**: Enhanced exchange rate management
- **Portfolio Domain**: Transfer data for P&L calculations
- **Fees Domain**: Transfer data for fee calculations

This refined plan incorporates battle-tested patterns from the POC implementation while maintaining the domain-driven architecture suitable for the NestJS migration.