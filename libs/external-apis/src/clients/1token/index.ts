export { OneTokenClient } from './client';
export type { ListPortfolioResponse } from './client';
export * from './types';

// TODO: can we re-export the types from the schema?
// 1Token Fund (Portfolio) type - directly define based on API response
export type OTFund = {
  fund_name: string;
  fund_alias: string;
  denomination: string;
  valuation_currency: string;
  status: 'waiting' | 'running' | 'stop' | 'paused';
  inception_time_str?: string;
  inception_time?: number;
  settlement_time_str?: string;
  settlement_time?: number;
  auto_ta_mode?: boolean;
  tag_list?: string[];
  tag_alias_list?: string[];
  creation_time_str?: string;
  creation_time?: number;
  operator?: string;
  operation_time_str?: string;
  operation_time?: number;
  version?: string;
  parent_fund_name?: string;
  parent_fund_alias?: string;
};

// 1Token Exchange Account type
export type OTAccount = {
  name: string;
  alias: string;
  status: string;
  venue?: string;
  type?: string;
  remark?: string;
  fund_name?: string;
  fund_alias?: string;
  exg_mom_sub?: string;
  account_uid?: string;
  main_tradeacc?: string;
  balance_usd?: string;
  create_time?: number;
  paused_time?: number;
  info_update_time?: number;
  child?: OTAccount[];
};

// 1Token Asset Position type (from position_view in API response)
export type OTAssetPosition = {
  symbol: string; // Spot or contract name (e.g., "btc", "btc-perp")
  symbol_str?: string; // Human readable symbol
  instrument?: 'spot' | 'future' | 'option' | 'margin_future';
  instrument_str?: string;
  fund_name?: string;
  fund_alias?: string;
  venue?: string;
  venue_str?: string;
  account_name: string; // Account identifier (e.g., "tradeacc/deribit/g6pwy")
  account_alias?: string;
  type?: string; // "coin", "derivative", etc.
  type_str?: string;
  amount?: string | number; // Position amount
  amount_by_format_currency?: string;
  cash_asset?: string | number; // Available balance
  cash_asset_by_format_currency?: string;
  principle?: string | number; // Cost basis
  principle_by_format_currency?: string;
  unrealized_balance?: string | number;
  realized_balance?: string | number;
  contract?: string; // For derivatives
  side?: 'long' | 'short'; // For derivatives
  margin?: string | number;
  average_fill_price?: string | number;
  mark_price?: string | number;
  ltv?: string | number;
};

// Response type for asset positions
export type OTAssetPositionResponse = {
  result: {
    data: {
      position_view: OTAssetPosition[];
    };
  };
};
