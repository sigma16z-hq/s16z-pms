export * from '@prisma/client';
export { PrismaClient } from '@prisma/client';

export { testPostgresFixture, PostgresFixtureControl } from './fixture';
export { seedDatabase, runSeed } from './seed';

// Export NestJS database module and service
export { DatabaseModule } from './database.module';
export { DatabaseService } from './database.service';
// Re-export commonly used types
export type {
  Department,
  ShareClass,
  ShareClassInvestor,
  Counterparty,
  ShareClassGrossNav,
  ShareClassNetNav,
  ShareClassGrossReturn,
  ShareClassNetReturn,
  ShareClassInvestment,
  ShareClassRedemption,
  TradingAccount,
  TripartyAccount,
  HrpTradingAccount,
  HrpBasicAccount,
  SmartContractWallet,
  EOAWallet,
  AuditLog,
  EfficientFrontier,
  TradingSmartContract,
  Transfer,
  PosSpot,
  PosCall,
  PosPut,
  PosPerp,
  Loan,
  AerodromeLpPosition,
  SpotQuotes,
  FutureQuotes,
  PercentageFee,
} from '@prisma/client';

// Export enums as values (not types) so they can be used in runtime
export { HrpTradingAccountType } from '@prisma/client';
