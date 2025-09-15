import { DynamicModule, Module } from '@nestjs/common';
import { OneTokenService } from './onetoken.service';
import { OneTokenModuleOptions } from '../types';

@Module({})
export class OneTokenModule {
  static forRoot(options: OneTokenModuleOptions): DynamicModule {
    const configProvider = {
      provide: 'ONETOKEN_CONFIG',
      useValue: options.config,
    };

    return {
      module: OneTokenModule,
      providers: [configProvider, OneTokenService],
      exports: [OneTokenService],
      global: false,
    };
  }

  static forRootAsync(options: {
    imports?: any[];
    useFactory: (...args: any[]) => Promise<OneTokenModuleOptions> | OneTokenModuleOptions;
    inject?: any[];
  }): DynamicModule {
    const configProvider = {
      provide: 'ONETOKEN_CONFIG',
      useFactory: options.useFactory,
      inject: options.inject || [],
    };

    return {
      module: OneTokenModule,
      imports: options.imports || [],
      providers: [configProvider, OneTokenService],
      exports: [OneTokenService],
      global: false,
    };
  }
}