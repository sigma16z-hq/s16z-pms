import { Module, Global } from '@nestjs/common';
import { DatabaseService } from './database.service';
import {
  PortfolioRepositoryImpl,
  ShareClassRepositoryImpl,
  PortfolioValuationRepositoryImpl,
  PortfolioCalculationRepositoryImpl,
  FeeLedgerRepositoryImpl,
  SpotQuoteRepositoryImpl,
  TransferRepositoryImpl,
} from './repositories';

@Global()
@Module({
  providers: [
    DatabaseService,
    // Repository implementations
    {
      provide: 'PortfolioRepository',
      useClass: PortfolioRepositoryImpl,
    },
    {
      provide: 'ShareClassRepository',
      useClass: ShareClassRepositoryImpl,
    },
    {
      provide: 'PortfolioValuationRepository',
      useClass: PortfolioValuationRepositoryImpl,
    },
    {
      provide: 'PortfolioCalculationRepository',
      useClass: PortfolioCalculationRepositoryImpl,
    },
    {
      provide: 'FeeLedgerRepository',
      useClass: FeeLedgerRepositoryImpl,
    },
    {
      provide: 'SpotQuoteRepository',
      useClass: SpotQuoteRepositoryImpl,
    },
    {
      provide: 'TransferRepository',
      useClass: TransferRepositoryImpl,
    },
  ],
  exports: [
    DatabaseService,
    'PortfolioRepository',
    'ShareClassRepository',
    'PortfolioValuationRepository',
    'PortfolioCalculationRepository',
    'FeeLedgerRepository',
    'SpotQuoteRepository',
    'TransferRepository',
  ],
})
export class DatabaseModule {}