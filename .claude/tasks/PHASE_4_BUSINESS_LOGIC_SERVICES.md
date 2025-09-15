# Phase 4: Business Logic Services Migration Plan

## Overview
Migrate the core business logic services from annamite-pms to the new NestJS s16z-pms architecture. This includes portfolio calculations, fee management, currency conversion, transfer processing, and external API integrations.

## Pre-Migration Analysis Summary

### Core Business Services Identified
1. **Portfolio Management**: `PortfolioCalcService`, `PortfolioFeeService`
2. **Fee Calculation**: `CIPFeeService`, `TradingAccountFeeService`
3. **Transfer Processing**: `TradingAccountTransferService`, `TransferConversionService`, `HRPTransferService`
4. **Currency & Quotes**: `CurrencyConversionService`, `SpotQuoteService`
5. **HRP Integration**: `HRPAccountProcessorService`, `HRPFeeIngestionService`
6. **Data Ingestion**: `PortfolioValuationRunner`, various cron job runners
7. **API Layer**: `DashboardAPIService`

### External API Dependencies (Already Migrated in Phase 3)
- **Currency Services** → 1Token Client (`@s16z/onetoken-client`)
- **Portfolio Valuation** → 1Token Client
- **Fee Ingestion Services** → HRP Client (`@s16z/hrp-client`)
- **Transfer Ingestion Services** → HRP Client

## Migration Strategy

### Approach: Bottom-Up Service Migration
Start with foundational services (no dependencies) and work up to complex orchestrators.

### Service Dependency Graph
```
PortfolioCalcService (TOP LEVEL)
├── PortfolioFeeService
│   ├── CIPFeeService
│   │   └── FeeIngestionService (→ HRP API)
│   ├── ERSFeeService
│   │   └── FeeIngestionService (→ HRP API)
│   ├── FinancingFeeService
│   │   └── FeeIngestionService (→ HRP API)
│   └── CurrencyConversionService
│       └── SpotQuoteService (→ 1Token API)
└── TransferConversionService
    ├── CurrencyConversionService (shared)
    └── TransferProcessingService
        └── TransferIngestionService (→ HRP API)
```

## Phase 4 Implementation Plan

### Stage 1: Foundation Services (Weeks 1-2)
**Goal**: Migrate core utility services with minimal dependencies

#### 4.1.1 Create Currency Domain Services
- **Priority**: High (foundation for all other services)
- **Complexity**: Medium (external API integration)

**Tasks**:
1. Create `libs/business-logic` package structure
2. Migrate `SpotQuoteService` → `spot-quote.service.ts`
   - Convert to NestJS service with dependency injection
   - Update to use `@s16z/onetoken-client`
   - Implement caching with NestJS cache manager
   - Add proper error handling and logging
3. Migrate `CurrencyConversionService` → `currency-conversion.service.ts`
   - Depends on SpotQuoteService
   - Implement batch conversion capabilities
   - Add fallback mechanisms for rate lookup

**Output**:
- `@app/business-logic/currency` module
- Market rate management and multi-currency conversion
- Database models integrated via `@app/database`

#### 4.1.2 Create Accounts Domain Services
- **Priority**: High (account management foundation)
- **Complexity**: Medium (business rules, classification logic)

**Tasks**:
1. Migrate `HRPAccountProcessorService` → `account-processor.service.ts`
   - Account classification logic (Trading, Basic, Triparty)
   - Account type determination (FUNDING vs OTHER)
   - Database integration
2. Create `TradingAccountService` → `trading-account.service.ts`
   - Trading account operations and management
   - Account data synchronization
3. Create `AccountClassificationService` → `account-classification.service.ts`
   - Business rules for account classification
   - Account type mapping logic

**Output**:
- `@app/business-logic/accounts` module
- Account processing, classification, and management services

### Stage 2: Transfers Domain Services (Weeks 3-4)
**Goal**: Migrate transfer processing and conversion logic

#### 4.2.1 Transfer Processing Services
- **Priority**: High (core business logic)
- **Complexity**: Medium (business rules, duplicate prevention)

**Tasks**:
1. Migrate `HRPTransferService` → `transfer-processing.service.ts`
   - Convert external transfer events to Transfer records
   - Implement account type mapping logic
   - Core transfer processing business rules
2. Migrate `TradingAccountTransferService` → `transfer-ingestion.service.ts`
   - Update to use `@s16z/hrp-client`
   - Implement filtering and deduplication
   - Fetch transfers from external sources
3. Migrate `TransferConversionService` → `transfer-conversion.service.ts`
   - Integrate with Currency domain services
   - Handle multi-currency transfers
   - Transfer denomination conversion

**Output**:
- `@app/business-logic/transfers` module
- Transfer processing, ingestion, and conversion services

### Stage 3: Fees Domain Services (Weeks 5-6)
**Goal**: Migrate fee-related business logic (3 types of fees)

#### 4.3.1 Core Fee Services
- **Priority**: High (revenue calculations)
- **Complexity**: Medium (business rules, external APIs)

**Tasks**:
1. Create `FeeCalculationService` → `fee-calculation.service.ts`
   - Core fee calculation engine
   - Common fee processing logic
2. Create `FeeIngestionService` → `fee-ingestion.service.ts`
   - Update to use `@s16z/hrp-client`
   - Fetch fees from external sources
   - Implement duplicate prevention logic
3. Migrate `CIPFeeService` → `cip-fee.service.ts`
   - CIP-specific fee calculation logic
   - Database integration for CIP fees
   - Time range-based fee retrieval
4. Create `ERSFeeService` → `ers-fee.service.ts`
   - ERS-specific fee calculation logic
5. Create `FinancingFeeService` → `financing-fee.service.ts`
   - Financing-specific fee calculation logic
6. Migrate `PortfolioFeeService` → `portfolio-fee.service.ts`
   - Aggregate fees from various sources
   - Currency conversion integration
   - Unified fee interface

**Output**:
- `@app/business-logic/fees` module
- Complete fee domain with all 3 fee types (CIP, ERS, Financing)
- Fee calculation, ingestion, and aggregation services

### Stage 3: Portfolio Calculation Engine (Weeks 5-6)
**Goal**: Migrate the core portfolio calculation logic (most complex)

#### 4.3.1 Portfolio Calculation Service
- **Priority**: Critical (core business value)
- **Complexity**: High (complex business rules, chain integrity)

**Tasks**:
1. Migrate `PortfolioCalcService`
   - Implement strict cumulative accounting methodology
   - Add chain integrity validation and gap detection
   - Integrate with PortfolioFeeService and TransferConversionService
   - Implement incremental calculation logic
2. Create calculation validation and testing framework
3. Add comprehensive logging and monitoring

**Output**:
- `@app/business-logic/portfolio` module
- PortfolioCalcService with full business logic
- Calculation validation framework

### Stage 4: Account Processing Services (Week 7)
**Goal**: Complete account management business logic

#### 4.4.1 Account Processing Services
- **Priority**: Medium (account management)
- **Complexity**: Medium (business rules, classification)

**Tasks**:
1. Complete account processing services from Stage 1
   - Add any remaining account classification logic
   - Enhance account type determination (FUNDING vs OTHER)
   - Add account data synchronization features
2. Create background account processing jobs
   - Account data sync runners
   - Account classification maintenance

**Output**:
- Enhanced `@app/business-logic/accounts` module
- Complete account processing and synchronization services

### Stage 5: Scheduling & Background Jobs (Week 8)
**Goal**: Migrate background job processing

#### 4.5.1 Scheduling Services
- **Priority**: High (data synchronization)
- **Complexity**: Medium (scheduling, gap filling)

**Tasks**:
1. Migrate `PortfolioValuationRunner`
   - Update to use `@s16z/onetoken-client`
   - Implement NAV data gap filling logic
   - Add proper error handling and retry logic
2. Create comprehensive data sync runners
   - Account data synchronization
   - Transfer data ingestion
   - Fee data ingestion
3. Create NestJS scheduling module using `@nestjs/schedule`
4. Implement unified job coordination

**Output**:
- `@app/business-logic/scheduler` module
- All data synchronization runners with NestJS scheduling

### Stage 6: API Layer Migration (Week 9)
**Goal**: Create new NestJS API controllers

#### 4.6.1 Business Logic API Controllers
- **Priority**: High (frontend integration)
- **Complexity**: Low-Medium (standard REST API)

**Tasks**:
1. Create NestJS controllers replacing `DashboardAPIService`
   - Portfolio endpoints (portfolio calculations, valuations)
   - ShareClass endpoints (performance, NAV, returns)
   - Manager endpoints (portfolio management)
   - Account endpoints (account data, classifications)
   - Transfer endpoints (transfer processing, conversions)
   - Fee endpoints (all fee types and calculations)
2. Implement proper validation using class-validator
3. Add Swagger documentation
4. Implement proper error handling and response formatting

**Output**:
- `apps/pms-api/src/controllers/` modules
- Full REST API with OpenAPI documentation

### Stage 7: Integration & Testing (Week 10)
**Goal**: End-to-end integration and testing

#### 4.7.1 Integration Testing
**Tasks**:
1. Create comprehensive integration tests
2. Test service interdependencies
3. Validate calculation accuracy against existing system
4. Performance testing and optimization
5. Documentation and deployment preparation

**Output**:
- Complete business logic migration
- Full test suite
- Performance benchmarks

## Package Structure Plan (Domain-Driven Design)

```
libs/business-logic/
├── package.json
├── src/
│   ├── accounts/
│   │   ├── services/
│   │   │   ├── account-processor.service.ts      # Process & classify accounts
│   │   │   ├── trading-account.service.ts        # Trading account operations
│   │   │   └── account-classification.service.ts # Account type logic
│   │   ├── types/
│   │   │   └── account.types.ts                  # Account domain types
│   │   ├── accounts.module.ts
│   │   └── index.ts
│   ├── transfers/
│   │   ├── services/
│   │   │   ├── transfer-processing.service.ts    # Core transfer logic
│   │   │   ├── transfer-ingestion.service.ts     # Fetch from external sources
│   │   │   └── transfer-conversion.service.ts    # Currency conversion
│   │   ├── types/
│   │   │   └── transfer.types.ts                 # Transfer domain types
│   │   ├── transfers.module.ts
│   │   └── index.ts
│   ├── fees/
│   │   ├── services/
│   │   │   ├── fee-calculation.service.ts        # Core fee calculations
│   │   │   ├── fee-ingestion.service.ts          # Fetch fees from sources
│   │   │   ├── cip-fee.service.ts               # CIP-specific logic
│   │   │   ├── ers-fee.service.ts               # ERS-specific logic
│   │   │   ├── financing-fee.service.ts         # Financing-specific logic
│   │   │   └── portfolio-fee.service.ts         # Portfolio fee aggregation
│   │   ├── types/
│   │   │   └── fee.types.ts                     # Fee domain types
│   │   ├── fees.module.ts
│   │   └── index.ts
│   ├── currency/
│   │   ├── services/
│   │   │   ├── spot-quote.service.ts            # Market rate management
│   │   │   └── currency-conversion.service.ts   # Multi-currency conversion
│   │   ├── types/
│   │   │   └── currency.types.ts                # Currency domain types
│   │   ├── currency.module.ts
│   │   └── index.ts
│   ├── portfolio/
│   │   ├── services/
│   │   │   ├── portfolio-calculation.service.ts # Core P&L calculations
│   │   │   ├── portfolio-valuation.service.ts   # NAV management
│   │   │   └── portfolio-aggregation.service.ts # Data aggregation
│   │   ├── types/
│   │   │   └── portfolio.types.ts               # Portfolio domain types
│   │   ├── portfolio.module.ts
│   │   └── index.ts
│   ├── scheduler/
│   │   ├── runners/
│   │   │   ├── portfolio-valuation.runner.ts    # Portfolio NAV sync
│   │   │   ├── account-sync.runner.ts           # Account data sync
│   │   │   ├── fee-sync.runner.ts               # Fee data sync
│   │   │   └── transfer-sync.runner.ts          # Transfer data sync
│   │   ├── services/
│   │   │   └── scheduler.service.ts             # Job scheduling logic
│   │   ├── scheduler.module.ts
│   │   └── index.ts
│   ├── shared/
│   │   ├── services/
│   │   │   ├── validation.service.ts            # Cross-domain validation
│   │   │   └── audit.service.ts                 # Audit logging
│   │   ├── utils/
│   │   │   ├── calculation.utils.ts             # Common calculations
│   │   │   └── date.utils.ts                    # Date utilities
│   │   ├── types/
│   │   │   └── common.types.ts                  # Shared types
│   │   ├── shared.module.ts
│   │   └── index.ts
│   ├── business-logic.module.ts
│   └── index.ts
└── tsconfig.lib.json
```

## Critical Success Factors

### 1. **Data Integrity**
- Maintain calculation chain integrity during migration
- Preserve all business rules and validation logic
- Implement comprehensive testing before production

### 2. **Multi-Tenant Support**
- Design services to support different share classes
- Enable flexible API client configuration per share class
- Maintain data isolation between share classes

### 3. **Performance**
- Optimize database queries and caching
- Implement efficient batch processing
- Monitor service performance during migration

### 4. **Error Handling**
- Robust error handling for external API failures
- Proper logging and monitoring
- Graceful degradation strategies

### 5. **Testing Strategy**
- Unit tests for each service
- Integration tests for service interactions
- End-to-end tests for complete workflows
- Calculation accuracy validation

## Risk Mitigation

### Technical Risks
- **Complex Business Logic**: Thorough analysis and testing of calculation logic
- **External API Dependencies**: Proper error handling and fallback mechanisms
- **Data Migration**: Validate data integrity and calculation accuracy

### Business Risks
- **Calculation Accuracy**: Parallel run with existing system for validation
- **Downtime**: Phased rollout with rollback capabilities
- **Performance**: Load testing and optimization

## Dependencies

### Phase 3 Outputs (Must be Complete)
- `@s16z/api-client-base` package
- `@s16z/hrp-client` package
- `@s16z/onetoken-client` package

### Phase 2 Outputs (Must be Complete)
- `@app/database` package with all repositories
- Database schema and migrations

### External Dependencies
- NestJS scheduling package (`@nestjs/schedule`)
- Validation packages (`class-validator`, `class-transformer`)
- Testing packages (Jest, Supertest)

## Success Metrics

1. **All business services migrated** with equivalent functionality
2. **Calculation accuracy** verified against existing system
3. **Performance benchmarks** meet or exceed current system
4. **Test coverage** >= 90% for business logic
5. **API documentation** complete with Swagger
6. **Zero data integrity issues** during migration

## Timeline: 10 Weeks Total

- **Weeks 1-2**: Foundation Services (Currency, Accounts)
- **Weeks 3-4**: Transfer Processing Services
- **Weeks 5-6**: Fee Calculation Services & Portfolio Engine
- **Week 7**: Account Processing Services
- **Week 8**: Scheduling & Background Jobs
- **Week 9**: API Layer Migration
- **Week 10**: Integration & Testing

This plan ensures a systematic, risk-mitigated approach to migrating the complex business logic while maintaining the multi-tenant architecture and leveraging the separated API client packages from Phase 3.