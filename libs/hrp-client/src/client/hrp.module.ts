import { DynamicModule, Module } from '@nestjs/common';
import { HRPService } from './hrp.service';
import { HRPAuthService } from './hrp-auth.service';
import { HRPClientFactory } from './hrp-client.factory';
import { HRPModuleOptions } from '../types';

@Module({})
export class HRPModule {
  static forRoot(options: HRPModuleOptions): DynamicModule {
    const configProvider = {
      provide: 'HRP_CONFIG',
      useValue: options.config,
    };

    return {
      module: HRPModule,
      providers: [configProvider, HRPAuthService, HRPService, HRPClientFactory],
      exports: [HRPService, HRPAuthService, HRPClientFactory],
      global: false,
    };
  }

  static forRootAsync(options: {
    imports?: any[];
    useFactory: (...args: any[]) => Promise<HRPModuleOptions> | HRPModuleOptions;
    inject?: any[];
  }): DynamicModule {
    const configProvider = {
      provide: 'HRP_CONFIG',
      useFactory: options.useFactory,
      inject: options.inject || [],
    };

    return {
      module: HRPModule,
      imports: options.imports || [],
      providers: [configProvider, HRPAuthService, HRPService, HRPClientFactory],
      exports: [HRPService, HRPAuthService, HRPClientFactory],
      global: false,
    };
  }
}