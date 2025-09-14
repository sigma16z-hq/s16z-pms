import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { OneTokenService } from './onetoken.service';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: OneTokenService,
      useFactory: (configService: ConfigService) => {
        return new OneTokenService(configService);
      },
      inject: [ConfigService],
    },
  ],
  exports: [OneTokenService],
})
export class OneTokenModule {}