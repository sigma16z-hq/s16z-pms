# HRP Transfers Domain Migration

## Overview
Migrate transfer processing, ingestion, and conversion services that handle deposits and withdrawals from HRP.

**Estimated Time**: 3-4 days
**Complexity**: Medium
**Dependencies**: Accounts Domain (for account classification)

## Services to Migrate

### 1. Transfer Processing Service
**Source**: `/packages/backend/src/services/hrp/hrp-transfer-service.ts`

#### Migration Tasks:
1. **Create `TransferProcessingService`**
   - File: `libs/business-logic/src/transfers/services/transfer-processing.service.ts`
   - Convert external transfer events to Transfer records
   - Implement account type mapping logic
   - Core transfer processing business rules
   - Duplicate prevention mechanisms

2. **Create `TransferValidationService`**
   - File: `libs/business-logic/src/transfers/services/transfer-validation.service.ts`
   - Transfer data validation and integrity checks
   - Business rule validation for transfer amounts and types
   - Cross-reference validation with account data

### 2. Transfer Ingestion Service
**Source**: `/packages/backend/src/services/trading-account-transfer-service.ts`

#### Migration Tasks:
1. **Create `TransferIngestionService`**
   - File: `libs/business-logic/src/transfers/services/transfer-ingestion.service.ts`
   - Fetch transfers from HRP API using existing `@app/external-apis` client
   - Implement filtering and deduplication logic
   - Batch processing for large transfer datasets
   - Error handling for API failures

2. **Create `TransferSyncService`**
   - File: `libs/business-logic/src/transfers/services/transfer-sync.service.ts`
   - Background synchronization of transfer data
   - Gap detection and backfill mechanisms
   - Incremental sync optimization

### 3. Transfer Conversion Service
**Source**: `/packages/backend/src/services/transfer-conversion-service.ts`

#### Migration Tasks:
1. **Create `TransferConversionService`**
   - File: `libs/business-logic/src/transfers/services/transfer-conversion.service.ts`
   - Transfer denomination conversion (will integrate with Currency domain later)
   - Multi-currency transfer handling
   - Conversion rate application and validation

## Database Integration

### Required Repositories
Use existing repositories from `@app/database`:
- `TransferRepository`
- `AccountRepository` (for account lookups)
- `ShareClassRepository` (for shareclass-specific transfers)

### New Repository Methods Needed
Add to existing repositories if missing:
```typescript
// TransferRepository
findByHrpTransferId(hrpTransferId: string): Promise<Transfer | null>
findByAccountAndDateRange(accountId: string, startDate: Date, endDate: Date): Promise<Transfer[]>
findPendingTransfers(): Promise<Transfer[]>
findByTransferType(transferType: TransferType): Promise<Transfer[]>
bulkCreate(transfers: CreateTransferDto[]): Promise<Transfer[]>

// Add pagination for large datasets
findByAccountWithPagination(accountId: string, page: number, limit: number): Promise<PaginatedResult<Transfer>>
```

## Module Structure

### Directory Structure
```
libs/business-logic/src/transfers/
├── services/
│   ├── transfer-processing.service.ts    # Core transfer processing
│   ├── transfer-ingestion.service.ts     # HRP data ingestion
│   ├── transfer-conversion.service.ts    # Currency/denomination conversion
│   ├── transfer-validation.service.ts    # Data validation
│   └── transfer-sync.service.ts          # Background synchronization
├── types/
│   ├── transfer.types.ts                 # Transfer domain types
│   └── transfer-conversion.types.ts      # Conversion-specific types
├── transfers.module.ts                   # NestJS module
└── index.ts                              # Export barrel
```

### Module Configuration
```typescript
@Module({
  imports: [
    DatabaseModule,
    ExternalApisModule.forFeature(['hrp']),
    AccountsModule, // Dependency on accounts domain
  ],
  providers: [
    TransferProcessingService,
    TransferIngestionService,
    TransferConversionService,
    TransferValidationService,
    TransferSyncService,
  ],
  exports: [
    TransferProcessingService,
    TransferIngestionService,
    TransferConversionService,
    TransferValidationService,
    TransferSyncService,
  ],
})
export class TransfersModule {}
```

## Business Rules to Preserve

### Transfer Processing Rules
1. **Transfer Types**:
   - Deposits (cash inflows)
   - Withdrawals (cash outflows)
   - Internal transfers between accounts
   - Fee-related transfers

2. **Account Type Mapping**:
   - Must use account classification from Accounts domain
   - Validate transfer account exists and is active
   - Ensure transfer type matches account permissions

3. **Duplicate Prevention**:
   - Use HRP transfer ID as unique identifier
   - Check for existing transfers before creating
   - Handle potential race conditions in batch processing

4. **Data Integrity Rules**:
   - Transfer amounts must be non-zero
   - Transfer dates must be valid
   - Currency codes must be supported
   - Account relationships must be valid

### Transfer Validation Rules
1. **Amount Validation**:
   - Positive amounts for deposits
   - Negative amounts for withdrawals
   - Balance validation for withdrawal limits (if applicable)

2. **Date Validation**:
   - Transfer dates cannot be in future
   - Historical transfer validation for backdating rules
   - Time zone handling consistency

## External API Integration

### HRP Client Usage
Use the existing HRP client from `@app/external-apis`:
```typescript
// In transfer-ingestion.service.ts
constructor(
  private readonly hrpService: HRPService,
  private readonly transferRepository: TransferRepository,
  private readonly accountProcessingService: AccountProcessingService,
) {}

async ingestTransfersFromHRP(params: TransferIngestionParams): Promise<void> {
  const hrpTransfers = await this.hrpService.getTransfers({
    page: params.page,
    limit: params.limit,
    startDate: params.startDate,
    endDate: params.endDate,
  });

  for (const hrpTransfer of hrpTransfers) {
    await this.processTransfer(hrpTransfer);
  }
}
```

### Pagination Handling
```typescript
async ingestAllTransfers(startDate: Date, endDate: Date): Promise<void> {
  let page = 1;
  const limit = 1000; // Configurable batch size

  while (true) {
    const transfers = await this.hrpService.getTransfers({
      page,
      limit,
      startDate,
      endDate,
    });

    if (transfers.length === 0) break;

    await this.processTransferBatch(transfers);
    page++;
  }
}
```

## Testing Requirements

### Unit Tests
- **Transfer processing logic**: Test all business rules
- **Data ingestion**: Mock HRP API responses with various scenarios
- **Duplicate prevention**: Test race conditions and edge cases
- **Validation rules**: Test all validation scenarios
- **Error handling**: Test API failures and data inconsistencies

### Integration Tests
- **HRP API integration**: Test with real API (in test environment)
- **Database operations**: Test repository interactions
- **Account dependency**: Test integration with Accounts domain

### Test Files
```
libs/business-logic/src/transfers/services/__tests__/
├── transfer-processing.service.spec.ts
├── transfer-ingestion.service.spec.ts
├── transfer-conversion.service.spec.ts
├── transfer-validation.service.spec.ts
└── transfer-sync.service.spec.ts
```

### Test Coverage Goals
- **Service logic**: ≥95% coverage
- **Business rules**: 100% of validation rules tested
- **Error scenarios**: All failure modes covered
- **Edge cases**: Boundary conditions and race conditions

## Implementation Steps

### Day 1: Core Processing Setup
1. Create transfers module structure
2. Implement `TransferProcessingService` with core business logic
3. Set up database repository integration
4. Create unit tests for processing rules

### Day 2: HRP Integration and Ingestion
1. Implement `TransferIngestionService` with HRP client integration
2. Add pagination handling for large datasets
3. Implement `TransferSyncService` for background synchronization
4. Test HRP API integration with mock data

### Day 3: Validation and Conversion
1. Implement `TransferValidationService` with all business rules
2. Create `TransferConversionService` (basic structure, will enhance with Currency domain)
3. Add comprehensive error handling
4. Test validation scenarios and edge cases

### Day 4: Testing and Integration
1. Complete comprehensive test suite
2. Integration testing with Accounts domain dependency
3. Performance testing with large transfer datasets
4. End-to-end validation with real HRP data

## Performance Considerations

### Batch Processing
- Process transfers in configurable batch sizes (default: 1000)
- Use database transactions for batch operations
- Implement retry logic for failed batches

### Memory Management
- Stream large datasets instead of loading all into memory
- Use cursor-based pagination where possible
- Clean up temporary objects after processing

### Database Optimization
- Use bulk insert operations for new transfers
- Index optimization for frequent query patterns
- Connection pooling for concurrent operations

## Validation Checklist

- [ ] All transfer processing rules preserved
- [ ] HRP API integration working correctly
- [ ] Duplicate prevention mechanisms working
- [ ] Account dependency integration working
- [ ] Database operations maintain data integrity
- [ ] Unit tests achieve ≥95% coverage
- [ ] Performance meets requirements for large datasets
- [ ] No data loss during transfer processing
- [ ] Error handling covers all failure scenarios
- [ ] Code follows NestJS best practices

## Handoff to Next Developer

### What This Domain Provides
- `TransferProcessingService`: Core transfer business logic
- `TransferIngestionService`: HRP data synchronization
- `TransferConversionService`: Currency conversion (basic structure)
- `TransferValidationService`: Data validation
- `TransferSyncService`: Background synchronization

### Dependencies for Other Domains
- **HRP Fees**: May need transfer data for fee calculations
- **Portfolio Calculation**: Will need transfer data for P&L calculations
- **Currency Services**: Will enhance `TransferConversionService` with currency conversion

### Integration Points
- **Accounts Domain**: Uses `AccountProcessingService` for account validation
- **Currency Domain** (future): Will integrate for multi-currency transfers

### Known Issues to Document
Record any issues found in original implementation in `.claude/tasks/MIGRATION_ISSUES.md`:
- Data consistency issues
- Performance bottlenecks
- Missing error handling
- Business rule gaps