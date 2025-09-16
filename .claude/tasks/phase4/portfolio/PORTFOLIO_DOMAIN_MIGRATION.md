# Portfolio Domain Migration

## Overview
Migrate the core portfolio calculation service: `PortfolioCalcService`.

**Estimated Time**: 3-4 days
**Complexity**: High (core business logic)
**Dependencies**: Currency Domain, Fees Domain, Transfers Domain

## Actual Services to Migrate

### 1. PortfolioCalcService
**Source**: `/packages/backend/src/services/portfolio-calc.ts`
**Target**: `libs/business-logic/src/portfolio/services/portfolio-calc.service.ts`

**What it actually does**:
- Depends on: `PortfolioFeeService`
- Calculate portfolio metrics for specific valuation using cumulative approach
- Core portfolio calculation logic with chain integrity
- Works with `PortfolioCalculation`, `PortfolioValuation` tables
- Uses transfer conversion from Transfers Domain

## Database Integration
- Uses existing `PortfolioCalculation`, `PortfolioValuation` tables
- Same database operations and queries
- Preserves all calculation logic

## Module Structure

```
libs/business-logic/src/portfolio/
├── services/
│   └── portfolio-calc.service.ts      # Core portfolio calculations
├── portfolio.module.ts
└── index.ts
```

## Critical Business Logic to Preserve

### From PortfolioCalcService
1. **Cumulative calculation approach**
2. **Chain integrity validation**
3. **Incremental calculation logic**
4. **Integration with portfolio fees**

### Key Methods to Migrate
- `calculateForValuation(valuationId: bigint)`
- `calculateForPeriodIncremental(portfolioId, from, to, ...)`
- All validation and integrity checks

## Implementation Steps

### Day 1: PortfolioCalcService Setup
1. Copy exact calculation logic
2. Set up dependency on PortfolioFeeService
3. Same database operations

### Day 2: Core Calculation Logic
1. Implement incremental calculation methods
2. Chain integrity validation
3. Error handling exactly as original

### Day 3: Integration and Testing
1. Test with real portfolio data
2. Verify calculations match exactly
3. Performance validation

## Success Criteria
- [ ] Same portfolio calculation methodology
- [ ] Same cumulative/incremental approach
- [ ] Same chain integrity validation
- [ ] Same fee integration
- [ ] Same database operations
- [ ] Calculations match existing system exactly

*Note: This is the most critical migration as it contains core business value calculation logic.*