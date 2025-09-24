import { Module } from '@nestjs/common';
import { ScheduleModule, SchedulerRegistry } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '@app/database';
import { CurrencyModule } from '../currency';
import { HRPClientFactory } from '@s16z/hrp-client';

import { HrpTransferProcessorService } from './services/hrp-transfer-processor.service';
import { TransfersSchedulerService } from './services/transfers-scheduler.service';
import { HrpTransferJobController } from './controllers/hrp-transfer-job.controller';

/**
 * TransfersModule - Complete transfers domain with HRP integration, processing, and scheduling
 *
 * Provides:
 * - Transfer processing from HRP API with currency conversion
 * - Daily scheduled synchronization of transfers
 * - Manual trigger endpoints for operations
 * - Multi-shareclass credential management
 */
@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    // HRP client will be created per ShareClass using factory
    CurrencyModule, // For currency conversion service
    ScheduleModule.forRoot(), // For @Cron decorator
  ],
  providers: [
    HRPClientFactory,
    HrpTransferProcessorService,
    TransfersSchedulerService,
    SchedulerRegistry,
  ],
  controllers: [HrpTransferJobController],
  exports: [
    HrpTransferProcessorService,
  ],
})
export class TransfersModule {}