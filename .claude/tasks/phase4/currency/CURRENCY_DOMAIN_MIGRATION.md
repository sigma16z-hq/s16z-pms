# Currency Domain Migration

## Overview
Migrate the currency conversion service that provides multi-currency support using spot quotes from 1Token.

**Estimated Time**: 2 days
**Complexity**: Medium
**Dependencies**: 1Token Quotes Domain (spot quotes)

## Actual Services to Migrate

### CurrencyConversionService
**Source**: `/packages/backend/src/services/currency-conversion-service.ts`
**Target**: `libs/business-logic/src/currency/services/currency-conversion.service.ts`

**What it actually does**:
- Depends on `SpotQuoteService` from 1Token Quotes Domain
- Provides currency conversion using stored rates from `SpotQuote` table
- Simple conversion logic for the 7 supported cryptocurrencies

## Database Integration

### Existing Tables to Use
- `SpotQuote` table (managed by 1Token Quotes Domain)
- Uses existing `SpotQuoteRepository` for rate lookups

## Module Structure

```
libs/business-logic/src/currency/
├── services/
│   └── currency-conversion.service.ts # Rate-based conversion
├── currency.module.ts
└── index.ts
```

## Implementation Steps

### Day 1: CurrencyConversionService Migration
1. Copy existing conversion logic exactly from current service
2. Set up dependency on `SpotQuoteService` from 1Token Quotes Domain
3. Same database queries for rate lookups
4. Test conversion calculations match existing behavior

### Day 2: Integration and Testing
1. Test with real spot quote data from 1Token Quotes Domain
2. Verify calculations match exactly with existing system
3. Integration testing with portfolio and fee services
4. Performance validation for conversion operations

## What We Won't Build
- Complex cross-rate calculations (not in original)
- Multiple quote sources (only 1Token)
- Advanced caching beyond what exists
- Currency pair validation (keep it simple)
- Audit logging (not in original)

## Success Criteria
- [ ] Same 7 cryptocurrencies supported
- [ ] Same daily rate fetching schedule
- [ ] Same conversion calculations
- [ ] Same database schema usage
- [ ] Performance equals original