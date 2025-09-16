import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from '@app/database';
import { HRPModule } from '@s16z/hrp-client';

import { HRPAccountProcessorService } from './services/hrp-account-processor.service';
import { AccountsSchedulerService } from './services/accounts-scheduler.service';
import { HrpAccountJobController } from './hrp-account-job.controller';

/**
 * Accounts Module
 *
 * Handles HRP account processing, classification, and scheduling
 */
@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(), // Enable NestJS scheduling
    DatabaseModule,
    HRPModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        config: {
          clientId: configService.get('HRP_CLIENT_ID', 'default-client'),
          clientSecret: configService.get('HRP_CLIENT_SECRET', 'default-secret'),
          authBaseUrl: configService.get('HRP_AUTH_BASE_URL', 'https://auth.hiddenroad.com'),
          dataBaseUrl: configService.get('HRP_DATA_BASE_URL', 'https://api.hiddenroad.com'),
          audience: configService.get('HRP_AUDIENCE', 'https://api.hiddenroad.com/v0/'),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [
    HrpAccountJobController,
  ],
  providers: [
    HRPAccountProcessorService,
    AccountsSchedulerService,
  ],
  exports: [
    HRPAccountProcessorService,
    AccountsSchedulerService,
  ],
})
export class AccountsModule {}