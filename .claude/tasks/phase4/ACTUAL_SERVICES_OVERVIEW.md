# Phase 4: Actual Services Migration - Realistic Overview

## Services Actually Used in Current Codebase

Based on `/root/workspace/annamite-pms/packages/backend/src/index.ts`, these are the **actual services** that need migration:

### Core Business Services
1. **PortfolioCalcService** - Core portfolio calculations
2. **PortfolioFeeService** - Portfolio fee aggregation
3. **CIPFeeService** - CIP fee calculations and queries

### Data Processing Services
4. **SpotQuoteService** - Currency rate management from 1Token
5. **CurrencyConversionService** - Multi-currency conversion
6. **TransferConversionService** - Transfer currency handling

### HRP Integration Services
7. **HRPAccountProcessorService** - Account processing from HRP
8. **HRPFeeIngestionService** - **All 3 fee types**: CIP, ERS, Financing fee ingestion from HRP
9. **HRPFeeSchedulerService** - HRP fee scheduling
10. **HRPTransferService** - Transfer processing from HRP

### System Services
11. **CronjobService** - Background job management
12. **DashboardAPIService** - API endpoints

## Realistic Migration Domains

### Domain 1: 1Token Integration (3-4 days)
**Sub-domains**:
- `onetoken/quotes/` - `SpotQuoteService` (2 days)
- `onetoken/portfolios/` - Portfolio data & NAV sync (3 days)
**Services**: Spot quotes, Portfolio/Fund data, NAV synchronization
- Only 7 cryptocurrencies used in system
- Portfolio valuation and trading account sync
- Department-based multi-tenant support

### Domain 2: Accounts Processing (2 days)
**Location**: `accounts/`
**Services**: `HRPAccountProcessorService`
- HRP account processing and classification
- Account type determination and management

### Domain 3: Transfers Processing (2-3 days)
**Location**: `transfers/`
**Services**: `HRPTransferService`, `TransferConversionService`
- HRP transfer processing and ingestion
- Transfer currency conversion

### Domain 4: Currency Conversion (2 days)
**Location**: `currency/`
**Services**: `CurrencyConversionService`
- Multi-currency conversion using 1Token spot quotes
- Depends on 1Token Quotes sub-domain

### Domain 5: Fee Calculations (4-5 days)
**Location**: `fees/`
**Services**: `HRPFeeIngestionService`, `CIPFeeService`, `PortfolioFeeService`
- **All 3 fee types**: CIP, ERS, Financing fees from HRP
- Portfolio fee aggregation from all fee types
- Fee currency conversion

### Domain 6: Portfolio Engine (3-4 days)
**Location**: `portfolio/`
**Services**: `PortfolioCalcService`
- Core portfolio calculation logic
- Integration with fees, transfers, and currency conversion

### Domain 7: System Services (2-3 days)
**Location**: `system/`
**Services**: `CronjobService`, `HRPFeeSchedulerService`, `DashboardAPIService`
- Background job scheduling
- API endpoints for frontend

## Revised Timeline (12-15 days total)

### Week 1
- **Day 1-3**: Currency & Quotes Domain
- **Day 4-5**: Start HRP Data Processing

### Week 2
- **Day 6-8**: Complete HRP Data Processing
- **Day 9-10**: Fee Calculations Domain

### Week 3
- **Day 11-14**: Portfolio Engine Domain
- **Day 15**: System Services Domain

## Key Simplifications

### What We WON'T Build
- ❌ Complex multi-source quote aggregation (only 1Token)
- ❌ Advanced currency management beyond what's used
- ❌ Complex validation services beyond what exists
- ❌ Account classification beyond what HRP provides
- ❌ Over-engineered abstractions

### What We WILL Build
- ✅ Exact replica of existing services in NestJS
- ✅ Same business logic, same data flow
- ✅ Only the currency pairs actually used
- ✅ Only the HRP account types actually processed
- ✅ All 3 fee types (CIP, ERS, Financing) as implemented
- ✅ Same cronjob patterns with NestJS scheduler

This realistic approach focuses on **migrating what exists** rather than building what we imagine might be needed.