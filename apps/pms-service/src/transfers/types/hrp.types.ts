import { AccountType } from '@prisma/client';

/**
 * HRP Transfer Event from API
 */
export interface HrpTransferEvent {
  id: string;
  quantity: string;
  asset: string;
  type: 'Deposit' | 'Withdraw';
  eventTimestamp: string;
  transferTimestamp: string;
  venue: string;
  account: string;
}

/**
 * Transfer Input for database creation (matches current Prisma schema)
 */
export interface TransferInput {
  amount: number;
  denomination: string;
  fromAccountType: AccountType;
  fromAccountId: bigint;
  toAccountType: AccountType;
  toAccountId: bigint;
  valuationTime: Date;
  transferTime: Date;
}

/**
 * Transfer processing parameters
 */
export interface TransferIngestionParams {
  startDate: Date;
  endDate: Date;
  shareClassName?: string;
  transferType?: 'deposit' | 'withdrawal';
  batchSize?: number;
}

/**
 * Transfer job status
 */
export interface TransferJobStatus {
  isRunning: boolean;
  lastRunTime?: Date;
  nextRunTime?: Date;
  lastRunResult?: {
    transfersProcessed: number;
    errors?: string[];
    duration: number;
  };
  schedule?: {
    enabled: boolean;
    cronExpression: string;
  };
}

/**
 * Schedule information
 */
export interface ScheduleInfo {
  enabled: boolean;
  cronExpression: string;
  timezone: string;
  nextRunTime?: Date;
  lastRunTime?: Date;
}