import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { DatabaseModule } from '@app/database';
// Import the new separated API client packages
// Note: Uncomment and configure these when ready to use
// import { HRPModule } from '@s16z/hrp-client';
// import { OneTokenModule } from '@s16z/onetoken-client';
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
    // Add API client modules as needed:
    // HRPModule.forRootAsync({
    //   imports: [ConfigModule],
    //   useFactory: (configService: ConfigService) => ({
    //     config: {
    //       clientId: configService.get('HRP_CLIENT_ID'),
    //       clientSecret: configService.get('HRP_CLIENT_SECRET'),
    //       authBaseUrl: configService.get('HRP_AUTH_BASE_URL'),
    //       dataBaseUrl: configService.get('HRP_DATA_BASE_URL'),
    //     },
    //   }),
    //   inject: [ConfigService],
    // }),
    // OneTokenModule.forRootAsync({
    //   imports: [ConfigModule],
    //   useFactory: (configService: ConfigService) => ({
    //     config: {
    //       apiKey: configService.get('ONETOKEN_API_KEY'),
    //       apiSecret: configService.get('ONETOKEN_API_SECRET'),
    //       baseUrl: configService.get('ONETOKEN_BASE_URL'),
    //     },
    //   }),
    //   inject: [ConfigService],
    // }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}