export type { paths, components, operations } from './schemas/schema';

import { BaseApiConfig } from '@s16z/api-client-base';

export interface OneTokenConfig extends BaseApiConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl?: string;
}

export interface OneTokenModuleOptions {
  config: OneTokenConfig;
  cacheTtl?: number;
}