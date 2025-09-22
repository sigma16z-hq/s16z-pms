import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { DatabaseModule } from '@app/database';
import { AccountsModule } from './accounts';
import { CurrencyModule } from './currency';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    // Global cache module for API clients
    CacheModule.register({
      isGlobal: true,
      ttl: 300000, // 5 minutes
    }),
    DatabaseModule,
    AccountsModule, // HRP Accounts Domain
    CurrencyModule, // Currency Conversion & Rate Sync
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}