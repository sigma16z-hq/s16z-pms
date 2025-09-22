# Refined Currency Domain Migration Plan

## Executive Summary

Based on POC analysis, this is a **simple, straightforward migration** of the proven `CurrencyConversionService` from annamite-pms. The current s16z-pms project already has the SpotQuote infrastructure in place, making this a clean port with minimal changes.

**Key Insight**: The POC implementation is well-designed, proven, and simple. We should migrate it exactly as-is without over-engineering.

## Current State Analysis

### ✅ Already Available in s16z-pms
- **SpotQuote database model** - Exact same schema as POC
- **SpotQuoteRepository** - Full CRUD operations ready
- **Database integration** - Prisma setup complete

### 📋 What Needs Migration
- **CurrencyConversionService** - Core conversion logic (274 lines)
- **NestJS module setup** - Simple service registration

## Simple Migration Plan

### Core Services

#### 1. CurrencyConversionService
**Location**: `apps/pms-service/src/currency/services/currency-conversion.service.ts`

**Direct Port from POC** with these minimal changes:
```typescript
// Change from POC BaseService pattern to NestJS Injectable
@Injectable()
export class CurrencyConversionService {
  private readonly logger = new Logger(CurrencyConversionService.name);

  constructor(
    private readonly spotQuoteRepository: SpotQuoteRepository  // Inject repository
  ) {}

  // All conversion logic stays exactly the same
  async convertCurrency(amount: number, from: string, to: string, date: Date): Promise<number | null> {
    // Exact same 4-case logic from POC
  }

  // All other methods stay identical
}
```

#### 2. SpotQuoteIngestionService
**Location**: `apps/pms-service/src/currency/services/spot-quote-ingestion.service.ts`

**Direct Port from POC SpotQuoteService** with these changes:
```typescript
@Injectable()
export class SpotQuoteIngestionService {
  private readonly logger = new Logger(SpotQuoteIngestionService.name);

  constructor(
    private readonly oneTokenService: OneTokenService,     // Use existing OneToken client
    private readonly spotQuoteRepository: SpotQuoteRepository
  ) {}

  // Port all methods from POC SpotQuoteService
  async fetchAndStoreDailyRates(date: Date, currencies: string[], exchange: 'index' | 'cmc'): Promise<SpotQuote[]> {
    // Direct port of POC logic using this.oneTokenService.getBaseClient()
  }
}
```

#### 3. CurrencySchedulerService
**Location**: `apps/pms-service/src/currency/services/currency-scheduler.service.ts`

**Following Accounts Domain Pattern** (like AccountsSchedulerService):
```typescript
@Injectable()
export class CurrencySchedulerService {
  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly spotQuoteIngestionService: SpotQuoteIngestionService
  ) {}

  @Cron('0 1 * * *') // Run daily at 1 AM UTC
  async handleSpotQuoteSync(): Promise<void> {
    // Fetch yesterday's end-of-day prices
  }
```

### Key Conversion Methods (Proven from POC)
1. **`convertCurrency()`** - Main conversion with 4 cases:
   - Same currency → rate = 1
   - USD → other → direct rate lookup
   - Other → USD → direct rate lookup
   - Other → other → via USD conversion

2. **`convertToUSD()`** / **`convertFromUSD()`** - Helper methods
3. **`getExchangeRate()`** - Rate lookup without conversion
4. **`convertMultiple()`** - Batch conversions

### Rate Lookup Logic (Keep Exactly as POC)
```typescript
private async getRate(symbol: string, timestamp: Date): Promise<number | null> {
  const queryDate = new Date(timestamp);
  queryDate.setHours(0, 0, 0, 0); // Start of day

  const spotQuote = await this.spotQuoteRepository.findFirst({
    where: {
      symbol: symbol.toLowerCase(),
      baseCurrency: 'usd',
      priceDate: { lte: queryDate }
    },
    orderBy: { priceDate: 'desc' }
  });

  return spotQuote ? Number(spotQuote.price) : null;
}
```

## Module Structure (Following Accounts Pattern)

```
apps/pms-service/src/currency/
├── services/
│   ├── currency-conversion.service.ts      # Direct POC port
│   ├── spot-quote-ingestion.service.ts     # OneToken API integration
│   └── currency-scheduler.service.ts       # Daily scheduled job
├── controllers/
│   └── currency-job.controller.ts          # Manual trigger endpoints
├── constants/
│   └── scheduler.constants.ts              # Default currencies and config
├── currency.module.ts                      # NestJS module
└── index.ts                                # Export barrel
```

### Module Configuration
```typescript
@Module({
  imports: [
    DatabaseModule,
    OneTokenModule.forFeature(), // OneToken client integration
    ScheduleModule.forRoot(),    // For @Cron decorator
  ],
  providers: [
    CurrencyConversionService,
    SpotQuoteIngestionService,
    CurrencySchedulerService,
  ],
  controllers: [CurrencyJobController],
  exports: [
    CurrencyConversionService,
    SpotQuoteIngestionService,
  ],
})
export class CurrencyModule {}
```

## Supported Currencies (From POC)
- **7 cryptocurrencies**: BTC, ETH, USDT, USDC, SOL, AVAX, MATIC
- **Base currency**: USD (all rates stored as symbol/USD)
- **Rate source**: 1Token API (already handled by SpotQuote ingestion)

## Business Rules (Proven in POC)
1. **USD-centric design** - All rates stored as `symbol/USD`
2. **Graceful degradation** - Return `null` on conversion failure
3. **Case normalization** - All currencies lowercase internally
4. **Date handling** - Use start-of-day for rate lookups
5. **Latest rate fallback** - Use most recent rate ≤ requested date

## Scheduler Configuration (From POC)

### Default Configuration
```typescript
// constants/scheduler.constants.ts
export const CURRENCY_SCHEDULER_CONFIG = {
  enabled: true,
  cronExpression: '0 1 * * *', // Daily at 1 AM UTC (like POC's 00:05 AM but simplified)
  currencies: ['btc', 'eth', 'usdt', 'usdc', 'sol', 'avax', 'matic'],
  exchange: 'index' as const, // Prefer 'index' for more frequent updates (minute-level)
  backfillDays: 30, // Keep recent historical data
};
```

### Environment Configuration
```env
# Currency Scheduler Configuration (add to .env.local)
CURRENCY_SYNC_ENABLED=true
CURRENCY_SYNC_SCHEDULE="0 1 * * *"  # Daily at 1 AM UTC
CURRENCY_EXCHANGE=index              # 'index' or 'cmc'
CURRENCY_BACKFILL_DAYS=30           # Historical data to maintain
```

### Controller Endpoints (Following Accounts Pattern)
```typescript
@Controller('currency-jobs')
export class CurrencyJobController {
  @Post('sync')
  async triggerSync(): Promise<{ message: string; timestamp: string }> {
    // Manual trigger for spot quote synchronization
  }

  @Get('status')
  async getStatus(): Promise<CurrencyJobStatus> {
    // Latest sync status and currency rates
  }

  @Get('schedule')
  async getScheduleInfo(): Promise<ScheduleInfo> {
    // Schedule configuration and next run time
  }
}
```

## Implementation Steps

### Day 1: Core Services Migration (6 hours)
1. **Create service structure**
   ```bash
   mkdir -p apps/pms-service/src/currency/{services,controllers,constants}
   ```

2. **Port CurrencyConversionService** (2 hours)
   - Copy POC logic exactly (274 lines)
   - Replace `BaseService` with `@Injectable()`
   - Replace `SpotQuoteService` dependency with `SpotQuoteRepository`
   - Update rate lookup method to use repository

3. **Port SpotQuoteIngestionService** (3 hours)
   - Copy POC SpotQuoteService logic
   - Replace POC OneTokenClient with existing OneTokenService
   - Update database operations to use SpotQuoteRepository
   - Port all historical backfill and date gap detection logic

4. **Create CurrencySchedulerService** (1 hour)
   - Simple NestJS scheduler following accounts pattern
   - Daily cron job to fetch yesterday's prices
   - Integration with SpotQuoteIngestionService

### Day 2: Scheduler & Controller (4 hours)
1. **Complete scheduler integration** (2 hours)
   - Environment configuration support
   - Manual trigger controller endpoints
   - Status monitoring and reporting

2. **Module setup and testing** (2 hours)
   - NestJS module configuration with all dependencies
   - Basic unit tests for conversion logic
   - Integration tests with OneToken API

### Day 3: Validation & Integration (2 hours)
1. **Validation against POC** (1 hour)
   - Run same test cases as POC
   - Verify exact numeric results match
   - Performance testing

2. **Integration preparation** (1 hour)
   - Export services for transfers domain
   - Documentation for other domains
   - Environment configuration guide

**Total Time**: **3 days (12 hours)**

## Success Criteria
- [ ] **Exact functionality** - Same conversion results as POC
- [ ] **All 7 currencies** - BTC, ETH, USDT, USDC, SOL, AVAX, MATIC supported
- [ ] **Rate lookup** - Uses existing SpotQuote data correctly
- [ ] **Error handling** - Graceful degradation on missing rates
- [ ] **Performance** - <10ms for single conversions
- [ ] **Daily scheduler** - Automatically fetches rates at 1 AM UTC
- [ ] **Historical backfill** - Fills gaps in existing data
- [ ] **Manual triggers** - Controller endpoints work correctly

## Integration Examples

### Usage in Transfers Domain
```typescript
// In HrpTransferProcessorService
constructor(
  private readonly currencyService: CurrencyConversionService
) {}

async createTransferEntity(transfer: HRPTransferEvent): Promise<TransferInput | null> {
  const baseAmount = await this.currencyService.convertCurrency(
    Number(transfer.quantity),
    transfer.asset,
    shareClassBaseCurrency,
    new Date(transfer.event_timestamp)
  );

  return { denomAmount: Number(transfer.quantity), baseAmount, /* ... */ };
}
```

### Usage in Portfolio Domain (Future)
```typescript
async calculatePortfolioValue(positions: Position[], targetCurrency: string): Promise<number> {
  let totalValue = 0;

  for (const position of positions) {
    const convertedValue = await this.currencyService.convertCurrency(
      position.quantity * position.price,
      position.currency,
      targetCurrency,
      new Date()
    );

    totalValue += convertedValue || 0;
  }

  return totalValue;
}
```

## Key Features from POC Scheduler

### Intelligent Backfill (Port from SpotQuoteRunner)
- **Gap detection** - Finds missing dates in existing data
- **Batch processing** - Handles large date ranges efficiently
- **Concurrent fetching** - Process multiple dates in parallel (batches of 10)
- **Error resilience** - Continue processing other dates if one fails

### OneToken API Integration
- **Endpoint**: `/quote/last-price-before-timestamp`
- **Exchange preference**: 'index' (minute-level updates) vs 'cmc' (hourly)
- **Timestamp format**: Nanoseconds for precise historical lookups
- **Rate limiting**: Built-in delays between API calls

## What We Won't Do (Keep It Simple)
- ❌ **Complex caching** - Use existing database queries
- ❌ **Multiple data sources** - Only 1Token (existing behavior)
- ❌ **Real-time rates** - Daily rates only (existing behavior)
- ❌ **Currency validation** - Trust input currencies (existing behavior)
- ❌ **Advanced audit logging** - Simple logging only

## Dependencies
- **SpotQuoteRepository** - Already available in DatabaseModule
- **SpotQuote data** - Assumes 1Token ingestion is working
- **No external APIs** - Pure database-driven conversions

## Testing Strategy
- **Unit tests** - All conversion methods with mocked repository
- **Integration tests** - With real SpotQuote data
- **Comparison tests** - Results match POC exactly
- **Performance tests** - Conversion speed benchmarks

This migration is intentionally simple and proven. The POC implementation works well, and we should port it directly without adding complexity.