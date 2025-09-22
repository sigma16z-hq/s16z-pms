import { Module } from '@nestjs/common';
import { ScheduleModule, SchedulerRegistry } from '@nestjs/schedule';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DatabaseModule } from '@app/database';
import { OneTokenModule } from '@s16z/onetoken-client';

import { CurrencyConversionService } from './services/currency-conversion.service';
import { SpotQuoteIngestionService } from './services/spot-quote-ingestion.service';
import { CurrencySchedulerService } from './services/currency-scheduler.service';
import { CurrencyJobController } from './controllers/currency-job.controller';

/**
 * CurrencyModule - Complete currency domain with conversion, ingestion, and scheduling
 *
 * Provides:
 * - Currency conversion between all supported pairs
 * - Daily scheduled synchronization from 1Token API
 * - Manual trigger endpoints for operations
 * - Historical backfill and gap detection
 */
@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    OneTokenModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const useProxy = configService.get('USE_PROXY', 'false') === 'true';

        const config: any = {
          apiKey: configService.get('ONETOKEN_API_KEY', 'default-key'),
          apiSecret: configService.get('ONETOKEN_API_SECRET', 'default-secret'),
          baseUrl: configService.get('ONETOKEN_BASE_URL', 'https://api.1token.com/v1'),
        };

        // Add proxy configuration if enabled
        if (useProxy) {
          const proxyHost = configService.get('SOCKS5_PROXY_HOST') || configService.get('PROXY_HOST');
          const proxyPort = configService.get('SOCKS5_PROXY_PORT') || configService.get('PROXY_PORT');

          if (proxyHost && proxyPort) {
            config.proxy = {
              host: proxyHost,
              port: parseInt(proxyPort, 10),
              username: configService.get('PROXY_USERNAME'),
              password: configService.get('PROXY_PASSWORD'),
            };
          }
        }

        return { config };
      },
      inject: [ConfigService],
    }),
    ScheduleModule.forRoot(), // For @Cron decorator
  ],
  providers: [
    CurrencyConversionService,
    SpotQuoteIngestionService,
    CurrencySchedulerService,
    SchedulerRegistry,
  ],
  controllers: [CurrencyJobController],
  exports: [
    CurrencyConversionService,
    SpotQuoteIngestionService,
  ],
})
export class CurrencyModule {}