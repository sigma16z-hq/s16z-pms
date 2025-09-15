export type { paths as AuthPaths, components as AuthComponents, operations as AuthOperations } from './schemas/auth/schema';
export type { paths as DataPaths, components as DataComponents, operations as DataOperations } from './schemas/data/schema';

import type { components as DataComponentsType } from './schemas/data/schema';
import { BaseApiConfig } from '@s16z/api-client-base';

export interface HRPConfig extends BaseApiConfig {
  clientId: string;
  clientSecret: string;
  authBaseUrl?: string;
  dataBaseUrl?: string;
  audience?: string;
}

export interface HRPModuleOptions {
  config: HRPConfig;
  cacheTtl?: number;
}

export interface HRPToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
  expires_at: number;
}

export interface PaginatedResponse<T> {
  results: T[];
  next_page?: string;
}

export type HRPTradeEvent = DataComponentsType['schemas']['TradeEvent'];
export type HRPAccount = {
  venue: string;
  account: string;
};
export type HRPCIPCalculation = DataComponentsType['schemas']['CIPCalculation'];
export type HRPERSCalculation = DataComponentsType['schemas']['ERSCalculation'];
export type HRPFinancingCalculation = DataComponentsType['schemas']['FinancingCalculation'];
export type HRPExecutionPremiumCalculation = DataComponentsType['schemas']['ExecutionPremiumCalculation'];
export type HRPTransferEvent = DataComponentsType['schemas']['TransferEvent'];
export type HRPAdjustmentEvent = DataComponentsType['schemas']['AdjustmentEvent'];