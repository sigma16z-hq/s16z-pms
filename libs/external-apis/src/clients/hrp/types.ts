// HRP API Types

// Re-export generated types from OpenAPI schemas
export type { paths as AuthPaths, components as AuthComponents, operations as AuthOperations } from './auth/schema';
export type { paths as DataPaths, components as DataComponents, operations as DataOperations } from './data/schema';

// Import components type for internal use
import type { components as DataComponentsType } from './data/schema';

// Custom types for client configuration
export interface HRPConfig {
  clientId: string;
  clientSecret: string;
  authBaseUrl?: string;
  dataBaseUrl?: string;
  audience?: string;
  proxy?: {
    host: string;
    port: number;
    username?: string;
    password?: string;
  };
}

// Credentials interface for dynamic initialization
export interface HRPCredentials {
  clientId: string;
  clientSecret: string;
  shareClass?: string; // Optional identifier for the shareclass this credentials belong to
}

// Factory function to create HRPConfig from global config and credentials
export function createHRPConfig(
  credentials: HRPCredentials,
  globalConfig: {
    hrp: { authBaseUrl: string; dataBaseUrl: string; audience: string; useProxy: boolean };
    proxy?: { host: string; port: number; username?: string; password?: string };
  }
): HRPConfig {
  return {
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
    authBaseUrl: globalConfig.hrp.authBaseUrl,
    dataBaseUrl: globalConfig.hrp.dataBaseUrl,
    audience: globalConfig.hrp.audience,
    proxy: globalConfig.hrp.useProxy ? globalConfig.proxy : undefined,
  };
}

// Token management types
export interface HRPToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
  expires_at: number; // calculated expiry timestamp
}

// Pagination support types
export interface PaginatedResponse<T> {
  results: T[];
  next_page?: string;
}

export interface PaginationOptions {
  pageSize?: number;
  startRecordEventId?: string;
  startRecordCorrectionVersion?: number;
}

// Common response types
export type HRPTradeEvent = DataComponentsType['schemas']['TradeEvent'];
export type HRPAccount = {
  venue: string;
  account: string;
};

// Calculation response types
export type HRPCIPCalculation = DataComponentsType['schemas']['CIPCalculation'];
export type HRPERSCalculation = DataComponentsType['schemas']['ERSCalculation'];
export type HRPFinancingCalculation = DataComponentsType['schemas']['FinancingCalculation'];
export type HRPExecutionPremiumCalculation = DataComponentsType['schemas']['ExecutionPremiumCalculation'];

// Transfer event types
export type HRPTransferEvent = DataComponentsType['schemas']['TransferEvent'];

// Adjustment event types (credits/debits)
export type HRPAdjustmentEvent = DataComponentsType['schemas']['AdjustmentEvent'];
