import { DatabaseService } from '@app/database';
import { Injectable, Logger } from '@nestjs/common';
import { Prisma, ShareClass, AccountType } from '@prisma/client';
import { HRPClientFactory } from '@s16z/hrp-client';
import { CurrencyConversionService } from '../../currency/services/currency-conversion.service';
import { HrpTransferEvent, TransferInput, TransferIngestionParams } from '../types/hrp.types';
import { TRANSFERS_SCHEDULER_CONSTANTS } from '../constants/scheduler.constants';

/**
 * Account information interface for transfer processing
 */
export interface AccountInfo {
  hrpAccount: {
    account: string;
    venue: string;
  };
  type: 'TRADING' | 'BASIC' | 'TRIPARTY';
  id: bigint;
}

/**
 * HRP Transfer Processor Service
 *
 * Handles processing of HRP transfer data according to business requirements.
 * Processes deposits and withdrawals with currency conversion and account mapping.
 */
@Injectable()
export class HrpTransferProcessorService {
  private readonly logger = new Logger(HrpTransferProcessorService.name);

  constructor(
    private readonly hrpClientFactory: HRPClientFactory,
    private readonly databaseService: DatabaseService,
    private readonly currencyConversionService: CurrencyConversionService,
  ) {}

  /**
   * Process transfers for a specific ShareClass
   * @param shareClass ShareClass to process transfers for
   * @param params Transfer ingestion parameters
   * @param tx Optional transaction client
   * @returns Number of transfers processed
   */
  async processTransfersForShareClass(
    shareClass: ShareClass,
    params: TransferIngestionParams,
    tx?: Prisma.TransactionClient
  ): Promise<number> {
    this.logger.log(`Processing HRP transfers for shareClass: ${shareClass.name}`);

    try {
      // Get HRP client for this ShareClass
      const hrpClient = await this.getHrpClientForShareClass(shareClass);

      // Get accounts with portfolio assignments
      const accounts = await this.getPortfolioFilteredAccounts(shareClass, tx);

      if (accounts.length === 0) {
        this.logger.warn(`No accounts found with portfolio assignments for shareClass: ${shareClass.name}`);
        return 0;
      }

      this.logger.log(`Processing transfers for ${accounts.length} accounts in shareClass: ${shareClass.name}`);

      let totalProcessed = 0;

      // Process each account
      for (const account of accounts) {
        try {
          if (account.type !== 'TRADING') {
            this.logger.debug(`Skipping non-trading account: ${account.hrpAccount.account}`);
            continue;
          }

          const processed = await this.processTransfersForAccount(
            shareClass,
            account,
            hrpClient,
            params,
            tx
          );
          totalProcessed += processed;
        } catch (error) {
          this.logger.error(`Failed to process transfers for account: ${account.hrpAccount.account}`, {
            error: error.message,
            shareClass: shareClass.name,
          });
        }
      }

      this.logger.log(`Successfully processed ${totalProcessed} transfers for shareClass: ${shareClass.name}`);
      return totalProcessed;
    } catch (error) {
      this.logger.error(`Failed to process HRP transfers for shareClass: ${shareClass.name}`, error);
      throw error;
    }
  }

  /**
   * Process multiple ShareClasses with transaction support
   * @param shareClasses Array of ShareClasses to process
   * @param params Transfer ingestion parameters
   * @returns Map of shareClass name to processed transfer counts
   */
  async processMultipleShareClasses(
    shareClasses: ShareClass[],
    params: TransferIngestionParams
  ): Promise<Map<string, number>> {
    const results = new Map<string, number>();

    for (const shareClass of shareClasses) {
      try {
        const transferCount = await this.databaseService.$transaction(async (tx) => {
          this.logger.log(`Starting transfer processing transaction for ShareClass: ${shareClass.name}`);
          const processed = await this.processTransfersForShareClass(shareClass, params, tx);
          this.logger.log(`Transaction completed successfully for ShareClass: ${shareClass.name}`);
          return processed;
        }, {
          maxWait: 15000, // Maximum time to wait for a transaction slot (15s)
          timeout: 120000, // Transaction timeout (120s) for larger transfer batches
        });

        results.set(shareClass.name, transferCount);
      } catch (error) {
        this.logger.error(`Transaction failed for shareClass: ${shareClass.name}`, {
          error: error.message,
          stack: error.stack,
          shareClassName: shareClass.name,
          shareClassId: shareClass.id
        });
        results.set(shareClass.name, 0);
      }
    }

    return results;
  }

  /**
   * Process transfers for a single account
   */
  private async processTransfersForAccount(
    shareClass: ShareClass,
    account: AccountInfo,
    hrpClient: any,
    params: TransferIngestionParams,
    tx?: Prisma.TransactionClient
  ): Promise<number> {
    let totalProcessed = 0;

    // Process deposits if requested
    if (!params.transferType || params.transferType === 'deposit') {
      const deposits = await this.fetchTransfersFromHRP(
        hrpClient,
        account,
        'deposit',
        params
      );
      const processed = await this.processTransferBatch(shareClass, account, deposits, 'Deposit', tx);
      totalProcessed += processed;
    }

    // Process withdrawals if requested
    if (!params.transferType || params.transferType === 'withdrawal') {
      const withdrawals = await this.fetchTransfersFromHRP(
        hrpClient,
        account,
        'withdrawal',
        params
      );
      const processed = await this.processTransferBatch(shareClass, account, withdrawals, 'Withdraw', tx);
      totalProcessed += processed;
    }

    return totalProcessed;
  }

  /**
   * Fetch transfers from HRP API
   */
  private async fetchTransfersFromHRP(
    hrpClient: any,
    account: AccountInfo,
    transferType: 'deposit' | 'withdrawal',
    params: TransferIngestionParams
  ): Promise<HrpTransferEvent[]> {
    const accountName = account.hrpAccount.account.split(':')[0];
    const venue = account.hrpAccount.venue;
    const batchSize = params.batchSize || TRANSFERS_SCHEDULER_CONSTANTS.DEFAULT_CONFIG.BATCH_SIZE;

    const requestParams = {
      startEventTimestampInclusive: params.startDate.toISOString(),
      endEventTimestampExclusive: params.endDate.toISOString(),
      pageSize: batchSize,
      venue,
      account: accountName,
    };

    this.logger.debug(`Fetching ${transferType}s for account: ${accountName}`, requestParams);

    try {
      if (transferType === 'deposit') {
        return await hrpClient.fetchAllDeposits(requestParams);
      } else {
        return await hrpClient.fetchAllWithdrawals(requestParams);
      }
    } catch (error) {
      this.logger.error(`Failed to fetch ${transferType}s from HRP`, {
        error: error.message,
        account: accountName,
        venue,
      });
      return [];
    }
  }

  /**
   * Process a batch of transfers
   */
  private async processTransferBatch(
    shareClass: ShareClass,
    account: AccountInfo,
    transfers: HrpTransferEvent[],
    transferType: 'Deposit' | 'Withdraw',
    tx?: Prisma.TransactionClient
  ): Promise<number> {
    if (transfers.length === 0) {
      return 0;
    }

    this.logger.log(`Processing ${transfers.length} ${transferType.toLowerCase()}s for account: ${account.hrpAccount.account}`);

    const db = tx || this.databaseService;
    const transferInputs: TransferInput[] = [];

    // Convert HRP transfer events to database inputs
    for (const transfer of transfers) {
      try {
        const transferInput = await this.createTransferInput(transfer, shareClass, account, transferType);
        if (transferInput) {
          transferInputs.push(transferInput);
        }
      } catch (error) {
        this.logger.error(`Failed to create transfer input for HRP transfer: ${transfer.id}`, {
          error: error.message,
          transfer,
        });
      }
    }

    if (transferInputs.length === 0) {
      this.logger.warn(`No valid transfer inputs created from ${transfers.length} HRP transfers`);
      return 0;
    }

    // Batch insert with duplicate prevention
    try {
      const result = await db.transfer.createMany({
        data: transferInputs,
        skipDuplicates: true,
      });

      this.logger.log(`Created ${result.count} ${transferType.toLowerCase()}s for account: ${account.hrpAccount.account}`);
      return result.count;
    } catch (error) {
      this.logger.error(`Failed to save transfer batch`, {
        error: error.message,
        transferCount: transferInputs.length,
        account: account.hrpAccount.account,
      });
      return 0;
    }
  }

  /**
   * Create transfer input from HRP transfer event
   */
  private async createTransferInput(
    transfer: HrpTransferEvent,
    shareClass: ShareClass,
    account: AccountInfo,
    transferType: 'Deposit' | 'Withdraw'
  ): Promise<TransferInput | null> {
    const denomination = transfer.asset;
    const originalAmount = Number(transfer.quantity);
    const transferTime = new Date(transfer.transferTimestamp);
    const valuationTime = new Date(transfer.eventTimestamp);

    // Currency conversion to share class denomination
    let finalAmount = originalAmount;
    const targetCurrency = shareClass.denomCcy;

    if (denomination.toLowerCase() !== targetCurrency.toLowerCase()) {
      try {
        const convertedAmount = await this.currencyConversionService.convertCurrency(
          originalAmount,
          denomination,
          targetCurrency,
          transferTime
        );

        if (convertedAmount !== null) {
          finalAmount = convertedAmount;
        } else {
          this.logger.warn(`Currency conversion failed, using original amount`, {
            denomination,
            targetCurrency,
            amount: originalAmount,
            date: transferTime,
          });
        }
      } catch (error) {
        this.logger.error(`Currency conversion error`, {
          error: error.message,
          denomination,
          targetCurrency,
          amount: originalAmount,
        });
      }
    }

    // Get share class account ID
    const shareClassAccount = await this.getShareClassAccount(shareClass);
    if (!shareClassAccount) {
      this.logger.error(`Share class account not found for: ${shareClass.name}`);
      return null;
    }

    // Map transfer direction to account types
    let fromAccountType: AccountType;
    let fromAccountId: bigint;
    let toAccountType: AccountType;
    let toAccountId: bigint;

    if (transferType === 'Deposit') {
      // Deposit: BASIC → TRADING
      fromAccountType = AccountType.BASIC;
      fromAccountId = shareClassAccount.id;
      toAccountType = AccountType.TRADING;
      toAccountId = account.id;
    } else {
      // Withdrawal: TRADING → BASIC
      fromAccountType = AccountType.TRADING;
      fromAccountId = account.id;
      toAccountType = AccountType.BASIC;
      toAccountId = shareClassAccount.id;
    }

    return {
      amount: finalAmount,
      denomination: targetCurrency, // Store in converted currency
      fromAccountType,
      fromAccountId,
      toAccountType,
      toAccountId,
      valuationTime,
      transferTime,
    };
  }

  /**
   * Get accounts with portfolio assignments (filtered)
   */
  private async getPortfolioFilteredAccounts(
    shareClass: ShareClass,
    tx?: Prisma.TransactionClient
  ): Promise<AccountInfo[]> {
    const db = tx || this.databaseService;

    const tradingAccounts = await db.hrpTradingAccount.findMany({
      where: {
        shareClassId: shareClass.id,
        portfolioId: { not: null }, // Only accounts with portfolio assignments
      },
      include: {
        venue: true,
      },
    });

    return tradingAccounts.map(account => ({
      hrpAccount: {
        account: `${account.name}:${account.venue?.name || 'unknown'}`,
        venue: account.venue?.name || 'unknown',
      },
      type: 'TRADING' as const,
      id: account.id,
    }));
  }

  /**
   * Get share class basic account
   */
  private async getShareClassAccount(shareClass: ShareClass): Promise<{ id: bigint } | null> {
    const account = await this.databaseService.hrpBasicAccount.findFirst({
      where: {
        shareClassId: shareClass.id,
      },
    });

    return account ? { id: account.id } : null;
  }

  /**
   * Get HRP client for specific ShareClass using credentials from database
   */
  private async getHrpClientForShareClass(shareClass: ShareClass) {
    if (!shareClass.apiKeys) {
      throw new Error(`ShareClass ${shareClass.name} does not have API keys configured`);
    }

    const apiKeys = shareClass.apiKeys as any;
    const { clientId, clientSecret, audience } = apiKeys;

    if (!clientId || !clientSecret) {
      throw new Error(`ShareClass ${shareClass.name} does not have valid HRP credentials`);
    }

    const credentials = {
      shareClassName: shareClass.name,
      clientId,
      clientSecret,
      audience: audience || 'https://api.hiddenroad.com/v0/',
    };

    this.logger.debug(`Getting HRP client for ShareClass: ${shareClass.name}`);

    return await this.hrpClientFactory.getClient(credentials);
  }
}