# Fees Domain Migration

## Overview
Migrate all fee services: CIP, ERS, Financing fees + Portfolio fee aggregation. **All 3 fee types exist** and are fetched from HRP.

**Estimated Time**: 4-5 days
**Complexity**: High (3 different fee types with complex processing)
**Dependencies**: Currency Domain, HRP Domain

## Actual Services to Migrate

### 1. HRPFeeIngestionService (Core Fee Processing)
**Source**: `/packages/backend/src/services/hrp/hrp-fee-ingestion.ts`
**Target**: `libs/business-logic/src/fees/services/hrp-fee-ingestion.service.ts`

**What it actually does**:
- **CIP Fees**: `processCipFeesForShareClass()` - Processes CIP fees for trading accounts
- **ERS Fees**: `processErsFeesForShareClass()` - Processes ERS fees for basic accounts
- **Financing Fees**: `processFinancingFeesForShareClass()` - Processes Financing fees for basic accounts
- Uses HRP API calls:
  - `hrpClient.fetchAllCIPCalculations()`
  - `hrpClient.fetchAllERSCalculations()`
  - `hrpClient.fetchAllFinancingCalculations()`
- Creates records in: `feeLedger`, `cipFee`, `ersFee`, `financingFee` tables

### 2. CIPFeeService
**Source**: `/packages/backend/src/services/cip-fee-service.ts`
**Target**: `libs/business-logic/src/fees/services/cip-fee.service.ts`

**What it actually does**:
- `getCipFeesForPeriod(portfolioId, from, to)` - Gets CIP fees in USD for time range
- Queries `hrpTradingAccount` and aggregates CIP fee data

### 3. PortfolioFeeService
**Source**: `/packages/backend/src/services/portfolio-fee-service.ts`
**Target**: `libs/business-logic/src/fees/services/portfolio-fee.service.ts`

**What it actually does**:
- Depends on: `CIPFeeService`, `CurrencyConversionService`
- Aggregates fees from CIP service (will need to extend for ERS/Financing)
- Currency conversion for multi-currency fees

## Database Tables Used

### Fee Tables
- `feeLedger` - Main fee records table
- `cipFee` - CIP-specific fee details
- `ersFee` - ERS-specific fee details
- `financingFee` - Financing-specific fee details

### Account Tables
- `hrpTradingAccount` - For CIP fees
- `hrpBasicAccount` - For ERS and Financing fees

## Module Structure

```
libs/business-logic/src/fees/
├── services/
│   ├── hrp-fee-ingestion.service.ts  # Core HRP fee processing
│   ├── cip-fee.service.ts            # CIP fee calculations
│   ├── ers-fee.service.ts            # ERS fee calculations
│   ├── financing-fee.service.ts      # Financing fee calculations
│   └── portfolio-fee.service.ts      # All fee aggregation
├── fees.module.ts
└── index.ts
```

## Implementation Steps

### Day 1: HRPFeeIngestionService Migration
1. Copy `processCipFeesForShareClass()` method exactly
2. Copy `processErsFeesForShareClass()` method exactly
3. Copy `processFinancingFeesForShareClass()` method exactly
4. Replace HRPClient with new `@app/external-apis` client
5. Keep all database transaction logic

### Day 2: Individual Fee Services
1. Copy CIPFeeService logic exactly
2. **Create ERSFeeService** (similar to CIP but for basic accounts)
3. **Create FinancingFeeService** (similar to CIP but for basic accounts)
4. Same database queries and calculations

### Day 3: Portfolio Fee Aggregation
1. Copy PortfolioFeeService logic
2. **Extend to include ERS and Financing fees** in aggregation
3. Currency conversion integration
4. Unified fee interface

### Day 4: Integration Testing
1. Test all 3 fee types with real HRP data
2. Verify calculations match exactly
3. Test fee aggregation includes all types

### Day 5: Performance and Validation
1. Test batch processing performance
2. Validate atomic transactions work
3. End-to-end testing with portfolio calculations

## HRP API Integration

### Fee Type Specific API Calls
```typescript
// CIP Fees (Trading Accounts)
await hrpClient.fetchAllCIPCalculations({
  startEventTimestampInclusive: timeRange.start.toISOString(),
  endEventTimestampExclusive: timeRange.end.toISOString(),
  pageSize: 100,
  venue: venueName,
  account: accountName
});

// ERS Fees (Basic Accounts)
await hrpClient.fetchAllERSCalculations({
  startEventTimestampInclusive: timeRange.start.toISOString(),
  endEventTimestampExclusive: timeRange.end.toISOString(),
  pageSize: 100,
  venue: "hrpmaster",
  account: accountName
});

// Financing Fees (Basic Accounts)
await hrpClient.fetchAllFinancingCalculations({
  startEventTimestampInclusive: timeRange.start.toISOString(),
  endEventTimestampExclusive: timeRange.end.toISOString(),
  pageSize: 100,
  venue: "hrpmaster",
  account: accountName
});
```

## Business Logic to Preserve

### Fee Processing Rules
1. **CIP Fees**: Trading accounts with venue-specific processing
2. **ERS Fees**: Basic accounts using "hrpmaster" venue
3. **Financing Fees**: Basic accounts using "hrpmaster" venue
4. **Atomic transactions** per account to prevent partial failures
5. **Duplicate prevention** using external ID generation
6. **Incremental fetching** from latest fee timestamp

### Calculation Rules
- **CIP Annualized Rate**: `(cip_cost / trade_notional) * 365 * 24`
- **ERS/Financing Rate**: Use `annual_rate` field directly from API

## Success Criteria
- [ ] All 3 fee types (CIP, ERS, Financing) processed correctly
- [ ] Same HRP API integration for all types
- [ ] Same database transaction patterns
- [ ] Same duplicate prevention logic
- [ ] Same incremental fetching logic
- [ ] Portfolio fee aggregation includes all types
- [ ] Performance matches original system