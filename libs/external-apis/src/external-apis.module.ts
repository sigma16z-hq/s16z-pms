import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HrpModule } from './hrp/hrp.module';
import { OneTokenModule } from './onetoken/onetoken.module';

@Global()
@Module({
  imports: [
    ConfigModule,
    HrpModule,
    OneTokenModule,
  ],
  exports: [
    HrpModule,
    OneTokenModule,
  ],
})
export class ExternalApisModule {}