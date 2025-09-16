# HRP Accounts Domain Migration

## Overview
Migrate account processing, classification, and management services from HRP data integration.

**Estimated Time**: 3-4 days
**Complexity**: Medium
**Dependencies**: None (foundation service)

## Services to Migrate

### 1. Account Data Processing
**Source**: `/packages/backend/src/services/hrp/hrp-account-processor.ts`

#### Migration Tasks:
1. **Create `AccountProcessingService`**
   - File: `libs/business-logic/src/accounts/services/account-processing.service.ts`
   - Migrate account classification logic (Trading, Basic, Triparty)
   - Implement account type determination (FUNDING vs OTHER)
   - Preserve all business rules for account categorization

2. **Create `AccountSyncService`**
   - File: `libs/business-logic/src/accounts/services/account-sync.service.ts`
   - Account data synchronization from HRP API
   - Use existing `@app/external-apis` HRP client
   - Implement duplicate prevention and data integrity checks

### 2. Account Classification (Built into Account Processing)
**Note**: Account classification logic is built into the HRPAccountProcessorService, not a separate service.

## Database Integration

### Required Repositories
Use existing repositories from `@app/database`:
- `AccountRepository`
- `TradingAccountRepository`
- `ShareClassRepository` (for account-shareclass relationships)

### New Repository Methods Needed
Add to existing repositories if missing:
```typescript
// AccountRepository
findByHrpAccountId(hrpAccountId: string): Promise<Account | null>
findByClassification(classification: AccountClassification): Promise<Account[]>
updateClassification(accountId: string, classification: AccountClassification): Promise<Account>

// TradingAccountRepository
findByAccountType(accountType: AccountType): Promise<TradingAccount[]>
findActiveAccounts(): Promise<TradingAccount[]>
```

## Module Structure

### Directory Structure
```
libs/business-logic/src/accounts/
├── services/
│   └── hrp-account-processor.service.ts  # HRP account processing (exact migration)
├── types/
│   └── account.types.ts                  # Account domain types
├── accounts.module.ts                    # NestJS module
└── index.ts                              # Export barrel
```

### Module Configuration
```typescript
@Module({
  imports: [
    DatabaseModule,
    ExternalApisModule.forFeature(['hrp']),
  ],
  providers: [
    HRPAccountProcessorService,
  ],
  exports: [
    HRPAccountProcessorService,
  ],
})
export class AccountsModule {}
```

## Business Rules to Preserve

### Account Classification Rules
1. **Trading Account Types**:
   - Basic Trading Accounts
   - Triparty Trading Accounts
   - Funding Accounts

2. **Account Type Determination**:
   - FUNDING vs OTHER classification
   - Based on account purpose and structure
   - Historical classification consistency

3. **Data Integrity Rules**:
   - No duplicate accounts from same HRP source
   - Classification changes require audit trail
   - Account status transitions must be valid

## External API Integration

### HRP Client Usage
Use the existing HRP client from `@app/external-apis`:
```typescript
// In account-sync.service.ts
constructor(
  private readonly hrpService: HRPService,
  private readonly accountRepository: AccountRepository,
) {}

async syncAccountsFromHRP(): Promise<void> {
  const hrpAccounts = await this.hrpService.getAccounts({
    // pagination and filtering
  });

  for (const hrpAccount of hrpAccounts) {
    await this.processAccount(hrpAccount);
  }
}
```

## Testing Requirements

### Unit Tests
- **Account classification logic**: Test all business rules
- **Data synchronization**: Mock HRP API responses
- **Database operations**: Test repository interactions
- **Error handling**: Test API failures and data inconsistencies

### Test Files
```
libs/business-logic/src/accounts/services/__tests__/
├── account-processing.service.spec.ts
├── account-sync.service.spec.ts
├── trading-account.service.spec.ts
└── account-classification.service.spec.ts
```

### Test Coverage Goals
- **Service logic**: ≥95% coverage
- **Business rules**: 100% of classification rules tested
- **Error scenarios**: All failure modes covered

## Implementation Steps

### Day 1: Setup and Core Processing
1. Create accounts module structure
2. Implement `AccountProcessingService` with core classification logic
3. Set up database repository integration
4. Create comprehensive unit tests for classification rules

### Day 2: HRP Integration
1. Implement `AccountSyncService` with HRP client integration
2. Add data synchronization logic with duplicate prevention
3. Test HRP API integration with mock data
4. Implement error handling for API failures

### Day 3: Trading Account Management
1. Implement `TradingAccountService` with account operations
2. Create `AccountClassificationService` with business rules
3. Add database operations for account management
4. Test end-to-end account processing workflow

### Day 4: Testing and Validation
1. Complete comprehensive test suite
2. Validate against existing data in development environment
3. Performance testing with large account datasets
4. Documentation and code review preparation

## Validation Checklist

- [ ] All account classification rules preserved
- [ ] HRP API integration working correctly
- [ ] Database operations maintain data integrity
- [ ] Unit tests achieve ≥95% coverage
- [ ] Performance meets or exceeds original implementation
- [ ] No data loss during account processing
- [ ] Error handling covers all failure scenarios
- [ ] Code follows NestJS best practices

## Handoff to Next Developer

### What This Domain Provides
- `AccountProcessingService`: Account classification and processing
- `AccountSyncService`: HRP data synchronization
- `TradingAccountService`: Trading account management
- `AccountClassificationService`: Business rule validation

### Dependencies for Other Domains
- **HRP Transfers**: Will need `AccountProcessingService` for account classification
- **HRP Fees**: Will need `TradingAccountService` for fee account mapping
- **Portfolio Calculation**: Will need account classification data

### Known Issues to Document
Record any issues found in original implementation in `.claude/tasks/MIGRATION_ISSUES.md`:
- Inconsistent account type handling
- Missing error handling
- Performance bottlenecks
- Business rule violations