# 1Token Quotes Migration

## Overview
Migrate spot quote services that fetch currency exchange rates from 1Token API for portfolio valuation and currency conversion.

**Estimated Time**: 2 days
**Complexity**: Medium
**Dependencies**: None (foundation service)

## Actual Service to Migrate

### SpotQuoteService
**Source**: `/packages/backend/src/services/spot-quote.ts`
**Target**: `libs/business-logic/src/onetoken/services/spot-quote.service.ts`

**What it actually does**:
- Fetches daily currency rates from 1Token API at 00:00 AM
- Stores rates in `SpotQuote` table with `dataSource: "1token"`
- Tracks these currencies: `['btc', 'eth', 'usdt', 'usdc', 'sol', 'avax', 'matic']`
- Uses 1Token contracts like `"index/btc.usd"` for rate fetching
- Provides cached rate lookup for portfolio valuations

## Database Integration

### SpotQuote Table
**Key Fields**:
- `dataSource`: Always `"1token"` for currency exchange rates
- `symbol`: Currency symbol (e.g., "btc", "eth", "usdt")
- `price`: USD price for currency conversion
- `exchange`: Data source within 1Token ("index" or "cmc")
- `contract`: 1Token contract format (e.g., "index/btc.usd")

**Usage**:
- Daily currency rates stored for portfolio valuation
- Used by `CurrencyConversionService` for multi-currency support
- Historical rates preserved for accurate historical valuations

## 1Token API Integration

### API Calls Used
```typescript
// Fetch spot quote for specific currency pair
await this.oneTokenClient.getSpotQuote(baseCurrency, quoteCurrency);

// Example: Fetch BTC price in USD
await this.oneTokenClient.getSpotQuote('btc', 'usd');
```

### Currency Contracts
- **Format**: `"index/{symbol}.usd"` (e.g., "index/btc.usd")
- **Supported symbols**: btc, eth, usdt, usdc, sol, avax, matic
- **Exchange sources**: "index" or "cmc" within 1Token

## Module Structure

```
libs/business-logic/src/onetoken/
├── services/
│   └── spot-quote.service.ts         # 1Token rate fetching
├── types/
│   └── quote.types.ts               # Quote-specific types
├── onetoken.module.ts               # NestJS module
└── index.ts                         # Export barrel
```

## Business Logic to Preserve

### Quote Fetching Rules
1. **Daily Schedule**: Fetch rates daily at 00:00 AM
2. **Currency Support**: Only 7 specific cryptocurrencies
3. **USD Base**: All rates converted to USD as base currency
4. **Exchange Priority**: Use "index" source, fallback to "cmc"
5. **Data Source**: Always mark as `"1token"` in database

### Caching Strategy
1. **Database Storage**: Store all fetched rates for historical accuracy
2. **Rate Lookup**: Provide efficient lookup for portfolio calculations
3. **Latest Rates**: Quick access to most recent rates per currency

## Implementation Steps

### Day 1: Core Service Migration
1. Copy `SpotQuoteService` logic exactly from existing service
2. Replace old 1Token client with new `@app/external-apis` client
3. Preserve currency list: `['btc', 'eth', 'usdt', 'usdc', 'sol', 'avax', 'matic']`
4. Same database operations and `SpotQuote` table usage
5. Test rate fetching with existing database schema

### Day 2: Integration and Testing
1. Test with real 1Token API using existing credentials
2. Verify stored rates match existing data format
3. Test rate lookup performance for portfolio calculations
4. Validate daily scheduling works correctly
5. Integration testing with currency conversion dependencies

## Integration Points

### Dependencies for Other Services
- **Currency Conversion**: Will use spot quotes for conversion rates
- **Portfolio Valuation**: Needs currency rates for multi-currency portfolios
- **Portfolio Calculation**: Depends on accurate historical rates

### 1Token Client Integration
```typescript
// Use existing 1Token client from @app/external-apis
constructor(
  private readonly oneTokenService: OneTokenService,
  private readonly spotQuoteRepository: SpotQuoteRepository,
) {}

async fetchDailyCurrencyRates(): Promise<void> {
  for (const currency of this.defaultCurrencies) {
    const quote = await this.oneTokenService.getSpotQuote(currency, 'usd');

    await this.spotQuoteRepository.create({
      symbol: currency,
      price: quote.price,
      contract: `index/${currency}.usd`,
      exchange: quote.exchange || 'index',
      dataSource: '1token',
      fetchedAt: new Date(),
    });
  }
}
```

## Success Criteria
- [ ] Same 7 cryptocurrencies supported
- [ ] Same daily rate fetching at 00:00 AM
- [ ] Same `SpotQuote` table structure and data
- [ ] Same 1Token API contract format
- [ ] Performance equals original for rate lookups
- [ ] Integration works with currency conversion
- [ ] No data loss during migration