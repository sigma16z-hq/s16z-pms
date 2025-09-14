import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { HrpService } from './hrp.service';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: HrpService,
      useFactory: (configService: ConfigService) => {
        return new HrpService(configService);
      },
      inject: [ConfigService],
    },
  ],
  exports: [HrpService],
})
export class HrpModule {}