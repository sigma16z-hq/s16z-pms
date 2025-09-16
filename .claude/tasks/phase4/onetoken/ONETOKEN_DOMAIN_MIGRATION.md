# 1Token Domain Migration Overview

## Overview
The 1Token domain has been split into focused sub-domains for parallel development:

### Sub-Domains

#### 1. Portfolios Sub-Domain
**Location**: `onetoken/portfolios/PORTFOLIOS_MIGRATION.md`
**Services**: Portfolio data initialization, Portfolio valuation sync
**Focus**: Portfolio/Fund data from 1Token API, Trading accounts, NAV data

#### 2. Quotes Sub-Domain
**Location**: `onetoken/quotes/QUOTES_MIGRATION.md`
**Services**: `SpotQuoteService`
**Focus**: Currency exchange rates, spot quotes for conversion

## Database Tables Related to 1Token

### 1. Portfolio Table (`schema.prisma:260-301`)
**Key Fields**:
- `dataSource` (line 263): Stores `"1token"` to identify portfolios sourced from 1Token API
- `externalId` (line 264): Stores 1Token fund identifier (e.g., `"fund/h47z03"`)

**Relationships**:
- Links to `ShareClass` via `shareClassId`
- Links to `PortfolioManager` via `managerId`
- Contains `PortfolioValuation[]` records for historical data
- Associated with `TradingAccount[]` for position tracking

### 2. PortfolioValuation Table (`schema.prisma:304-367`)
**Key Fields**:
- `dataSource` (line 343): Set to `"1token"` for data from 1Token API
- `snapshotId` (line 306): Unique identifier for valuation snapshots
- `netAssets`, `netNav`, `grossReturn`, `netReturn`: Core valuation metrics
- `metadata` (line 345): Stores raw 1Token API response for debugging

**Purpose**:
- Stores portfolio valuation snapshots fetched from 1Token
- Tracks NAV progression and returns calculation
- Links to `Portfolio` via `portfolioId`

### 3. SpotQuote Table (`schema.prisma:945-979`)
**Key Fields**:
- `dataSource` (line 956): Always `"1token"` for currency exchange rates
- `symbol` (line 949): Currency symbol (e.g., "btc", "eth", "usdt")
- `price` (line 953): USD price for currency conversion
- `exchange` (line 957): Data source within 1Token ("index" or "cmc")
- `contract` (line 958): 1Token contract format (e.g., "index/btc.usd")

**Purpose**:
- Stores daily currency exchange rates from 1Token API
- Used for portfolio valuation currency conversion
- Fetched daily at 00:00 AM via scheduled tasks

### 4. TradingAccount Table (`schema.prisma:571-598`)
**Key Fields**:
- `name` (line 573): 1Token account unified name (e.g., "1token/tradeacc/bitmexprop/vsgm1h")
- `alias` (line 574): 1Token account alias (e.g., "AC_TG_07_BTC")
- `accountUid` (line 579): 1Token account UID for API calls
- `balanceUsd` (line 581): USD balance from 1Token (stored as string)

**Purpose**:
- Stores trading accounts synchronized from 1Token API
- Links accounts to portfolios for position tracking
- Maps to venues/exchanges for trading operations

### 5. Department Table (`schema.prisma:43-53`)
**Key Fields**:
- `oneTokenDepartmentId` (line 47): Maps to 1Token department identifier for API filtering

**Purpose**:
- Enables department-based filtering in 1Token API calls
- Supports multi-tenant portfolio management

## Dependencies Between Sub-Domains

```
1Token Quotes (Foundation)
├── 1Token Portfolios (depends on currency conversion)
└── Currency Domain (uses quotes for conversion)
```

## Implementation Strategy

### Parallel Development
- **Developer A**: 1Token Quotes sub-domain (2 days)
- **Developer B**: 1Token Portfolios sub-domain (3 days, can start after quotes foundation)

### Integration Points
- Portfolio valuation uses spot quotes for currency conversion
- Currency domain consumes quote data
- Portfolio calculations depend on NAV data from portfolios

## Total Timeline
- **1Token Quotes**: 2 days
- **1Token Portfolios**: 3 days (depends on quotes)
- **Total 1Token Domain**: 3-4 days with sequential development