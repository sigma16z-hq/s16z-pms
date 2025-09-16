# System Services Domain Migration

## Overview
Migrate system-level services: `CronjobService` and `DashboardAPIService`.

**Estimated Time**: 2-3 days
**Complexity**: Medium
**Dependencies**: All other domains (these are top-level services)

## Actual Services to Migrate

### 1. CronjobService
**Source**: `/packages/backend/src/services/cronjob/` directory
**Target**: `libs/business-logic/src/scheduler/`

**What it actually does**:
- Background job management using custom cronjob system
- Job runners in `/cronjob/runners/` directory:
  - `portfolio-valuation.ts`
  - `hrp-data.ts`
  - `1token.ts`
  - `portfolio-calculation.ts`
  - `spot-quote.ts`

### 2. DashboardAPIService
**Source**: `/packages/backend/src/services/api/dashboard-api-service.ts`
**Target**: `apps/pms-service/src/controllers/` (multiple controller files)

**What it actually does**:
- API routes for frontend dashboard
- Route files in `/api/routes/`:
  - `manager.ts`
  - `portfolio.ts`
  - `shareclass.ts`
  - `hrp.ts`

## Migration Strategy

### CronjobService → NestJS Scheduler
1. **Replace custom cronjob system** with `@nestjs/schedule`
2. **Convert job runners** to NestJS scheduled methods
3. **Keep same scheduling logic** and timing
4. **Same job coordination** patterns

### DashboardAPIService → NestJS Controllers
1. **Convert API routes** to NestJS controllers
2. **Keep same endpoints** and request/response formats
3. **Same business logic** calls
4. **Add proper validation** with class-validator

## Module Structure

### Scheduler Module
```
libs/business-logic/src/scheduler/
├── services/
│   └── scheduler.service.ts      # Job coordination
├── runners/
│   ├── portfolio-valuation.runner.ts
│   ├── hrp-data.runner.ts
│   ├── onetoken.runner.ts
│   ├── portfolio-calculation.runner.ts
│   └── spot-quote.runner.ts
├── scheduler.module.ts
└── index.ts
```

### API Controllers
```
apps/pms-service/src/controllers/
├── manager.controller.ts
├── portfolio.controller.ts
├── shareclass.controller.ts
└── hrp.controller.ts
```

## Implementation Steps

### Day 1: Scheduler Migration
1. Examine existing cronjob runners
2. Convert to NestJS `@Cron()` decorators
3. Same scheduling intervals and logic

### Day 2: API Controllers
1. Examine existing API routes
2. Convert to NestJS controllers
3. Same endpoints and business logic calls

### Day 3: Integration and Testing
1. Test scheduled jobs run correctly
2. Test API endpoints return same data
3. Integration with all other domains

## Success Criteria
- [ ] All scheduled jobs run on same schedule
- [ ] All API endpoints return same data
- [ ] Same error handling
- [ ] Same performance characteristics
- [ ] Integration with all business services works