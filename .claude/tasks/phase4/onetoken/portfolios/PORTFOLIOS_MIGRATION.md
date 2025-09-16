# 1Token Portfolios Migration

## Overview
Migrate portfolio/fund data initialization and valuation sync services that fetch portfolio data from 1Token API.

**Estimated Time**: 3 days
**Complexity**: High (complex data synchronization)
**Dependencies**: 1Token Quotes (for currency conversion)

## Actual Services to Migrate

### 1. OneTokenDataInitRunner
**Source**: `/packages/backend/src/services/cronjob/runners/1token.ts`
**Target**: `libs/business-logic/src/onetoken/services/portfolio-data-init.service.ts`

**What it actually does**:
- Sets up necessary data like `TradingAccount`, `Portfolio` (called "Fund" in 1Token)
- Fetches data from 1Token API and syncs with local database
- Processes:
  - Exchange accounts and sub-accounts
  - 1Token funds (saved as portfolios)
  - Account asset positions across different instrument types

### 2. PortfolioValuationRunner
**Source**: `/packages/backend/src/services/cronjob/runners/portfolio-valuation.ts`
**Target**: `libs/business-logic/src/onetoken/services/portfolio-valuation.service.ts`

**What it actually does**:
- Syncs valuation data from 1Token API to database for all active portfolios
- Processes:
  - Portfolio NAV (Net Asset Value) data from 1Token
  - Portfolio performance returns
  - Real-time valuation updates

## Database Integration

### Portfolio Table
**Key Fields for 1Token**:
- `dataSource`: Set to `"1token"` to identify 1Token portfolios
- `externalId`: Stores 1Token fund identifier (e.g., `"fund/h47z03"`)

**Relationships**:
- Links to `ShareClass` via `shareClassId`
- Links to `PortfolioManager` via `managerId`
- Contains `PortfolioValuation[]` records for historical NAV data
- Associated with `TradingAccount[]` for position tracking

### PortfolioValuation Table
**Key Fields for 1Token**:
- `dataSource`: Set to `"1token"` for NAV data from 1Token API
- `snapshotId`: Unique identifier for valuation snapshots
- `netAssets`, `netNav`, `grossReturn`, `netReturn`: Core valuation metrics
- `metadata`: Stores raw 1Token API response for debugging

**Purpose**:
- Stores portfolio valuation snapshots fetched from 1Token
- Tracks NAV progression and returns calculation
- Links to `Portfolio` via `portfolioId`

### TradingAccount Table
**Key Fields for 1Token**:
- `name`: 1Token account unified name (e.g., `"1token/tradeacc/bitmexprop/vsgm1h"`)
- `alias`: 1Token account alias (e.g., `"AC_TG_07_BTC"`)
- `accountUid`: 1Token account UID for API calls
- `balanceUsd`: USD balance from 1Token (stored as string)

**Purpose**:
- Stores trading accounts synchronized from 1Token API
- Links accounts to portfolios for position tracking
- Maps to venues/exchanges for trading operations

### Department Table
**Key Fields for 1Token**:
- `oneTokenDepartmentId`: Maps to 1Token department identifier for API filtering

**Purpose**:
- Enables department-based filtering in 1Token API calls
- Supports multi-tenant portfolio management

## 1Token API Integration

### Portfolio/Fund API Calls
```typescript
// List all portfolios/funds
const portfolioResponse = await this.oneTokenClient.listPortfolios();
const portfolios = portfolioResponse.result.fund_info_list;

// Get historical NAV data for a portfolio
const navResponse = await this.oneTokenClient.getPortfolioHistoricalNav(
  portfolioId,
  startDate,
  endDate
);
```

### Account API Calls
```typescript
// Get trading accounts
const accounts = await this.oneTokenClient.getAccounts();

// Get account positions
const positions = await this.oneTokenClient.getAccountPositions(accountUid);
```

## Module Structure

```
libs/business-logic/src/onetoken/
├── services/
│   ├── portfolio-data-init.service.ts    # Portfolio/account data sync
│   └── portfolio-valuation.service.ts    # NAV data sync
├── types/
│   ├── portfolio.types.ts               # Portfolio-specific types
│   └── valuation.types.ts               # Valuation-specific types
├── onetoken.module.ts                   # NestJS module
└── index.ts                             # Export barrel
```

## Business Logic to Preserve

### Portfolio Data Initialization Rules
1. **Fund Mapping**: 1Token "funds" become `Portfolio` records with `dataSource: "1token"`
2. **External ID**: Store 1Token fund identifier in `externalId` field
3. **Account Sync**: Trading accounts linked to portfolios for position tracking
4. **Department Filtering**: Use `oneTokenDepartmentId` for multi-tenant support

### Portfolio Valuation Rules
1. **NAV Sync**: Fetch and store daily NAV data from 1Token
2. **Snapshot IDs**: Unique identifiers for each valuation snapshot
3. **Metadata Storage**: Preserve raw 1Token response for debugging
4. **Performance Metrics**: Calculate and store gross/net returns

### Data Integrity Rules
1. **Incremental Sync**: Only fetch new data since last sync
2. **Duplicate Prevention**: Check existing records before creating
3. **Currency Conversion**: Use spot quotes for multi-currency portfolios
4. **Error Handling**: Robust handling of 1Token API failures

## Implementation Steps

### Day 1: Portfolio Data Initialization Service
1. Copy `OneTokenDataInitRunner` logic exactly
2. Replace old 1Token client with new `@app/external-apis` client
3. Preserve portfolio/fund mapping to database schema
4. Same trading account synchronization logic
5. Test portfolio data sync with existing database

### Day 2: Portfolio Valuation Service
1. Copy `PortfolioValuationRunner` logic exactly
2. Preserve NAV data fetching and storage
3. Same valuation calculation logic
4. Integration with spot quotes for currency conversion
5. Test NAV sync with real 1Token data

### Day 3: Integration and Testing
1. End-to-end testing of both services
2. Verify data consistency with existing portfolio records
3. Test department-based filtering functionality
4. Performance testing with multiple portfolios
5. Integration testing with portfolio calculation services

## Integration Points

### Dependencies on Other Services
- **1Token Quotes**: Uses spot quotes for currency conversion in valuations
- **Currency Conversion**: May need currency conversion for multi-currency portfolios

### Dependencies for Other Services
- **Portfolio Calculation**: Needs portfolio valuation data for P&L calculations
- **Portfolio Fee Services**: Uses portfolio data for fee calculations

## Success Criteria
- [ ] All 1Token portfolios/funds properly synchronized
- [ ] Same NAV data fetching and storage logic
- [ ] Same trading account mapping to portfolios
- [ ] Same department-based filtering functionality
- [ ] Performance matches original for data sync operations
- [ ] Integration works with portfolio calculations
- [ ] No data loss during migration
- [ ] Robust error handling for 1Token API failures