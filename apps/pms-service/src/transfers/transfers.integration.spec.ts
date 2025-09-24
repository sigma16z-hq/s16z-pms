import { describe, beforeAll, afterAll, beforeEach, it, expect } from 'vitest';
// Integration tests without @nestjs/testing to avoid dependency issues
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { DatabaseService, DatabaseModule } from '@app/database';

import { TransfersModule } from './transfers.module';
import { HrpTransferProcessorService } from './services/hrp-transfer-processor.service';
import { TransfersSchedulerService } from './services/transfers-scheduler.service';
import { HrpTransferJobController } from './controllers/hrp-transfer-job.controller';
import { CurrencyConversionService } from '../currency/services/currency-conversion.service';

import type { HrpTransferEvent, TransferIngestionParams } from './types/hrp.types';
import type { ShareClass } from '@prisma/client';
import type { HRPClientFactory } from '@s16z/hrp-client';

const execFileAsync = promisify(execFile);

// Integration test stubs that simulate real external services
class IntegrationHrpClientFactory {
  private responses: Map<string, { deposits: HrpTransferEvent[], withdrawals: HrpTransferEvent[] }> = new Map();

  setTransfersForShareClass(shareClassName: string, deposits: HrpTransferEvent[], withdrawals: HrpTransferEvent[]): void {
    this.responses.set(shareClassName, { deposits, withdrawals });
  }

  clearAllTransfers(): void {
    this.responses.clear();
  }

  async getClient(credentials: { shareClassName: string }) {
    const data = this.responses.get(credentials.shareClassName) || { deposits: [], withdrawals: [] };

    return {
      async fetchAllDeposits(params: any): Promise<HrpTransferEvent[]> {
        // Simulate API call with parameters
        return data.deposits.filter(transfer => {
          const transferDate = new Date(transfer.eventTimestamp);
          const startDate = new Date(params.startEventTimestampInclusive);
          const endDate = new Date(params.endEventTimestampExclusive);
          return transferDate >= startDate && transferDate < endDate;
        });
      },

      async fetchAllWithdrawals(params: any): Promise<HrpTransferEvent[]> {
        return data.withdrawals.filter(transfer => {
          const transferDate = new Date(transfer.eventTimestamp);
          const startDate = new Date(params.startEventTimestampInclusive);
          const endDate = new Date(params.endEventTimestampExclusive);
          return transferDate >= startDate && transferDate < endDate;
        });
      },
    };
  }
}

class IntegrationConfigService {
  private config: Map<string, string> = new Map([
    ['TRANSFER_SYNC_ENABLED', 'true'],
    ['TRANSFER_SYNC_SCHEDULE', '0 2 * * *'],
    ['TRANSFER_LOOKBACK_DAYS_DEPOSITS', '300'],
    ['TRANSFER_LOOKBACK_DAYS_WITHDRAWALS', '600'],
    ['TRANSFER_BATCH_SIZE', '100'],
  ]);

  get<T = string>(key: string, defaultValue?: T): T {
    const value = this.config.get(key);
    if (value !== undefined) {
      // Handle number conversions for config values
      if (typeof defaultValue === 'number' && typeof value === 'string') {
        return parseInt(value, 10) as T;
      }
      return value as T;
    }
    return defaultValue as T;
  }
}

class IntegrationCurrencyConversionService {
  private rates: Map<string, number> = new Map([
    ['btc_usd', 45000],
    ['eth_usd', 3000],
    ['usdt_usd', 1],
    ['usdc_usd', 1],
  ]);

  setRate(from: string, to: string, rate: number): void {
    this.rates.set(`${from.toLowerCase()}_${to.toLowerCase()}`, rate);
  }

  async convertCurrency(
    amount: number,
    sourceCurrency: string,
    targetCurrency: string,
    timestamp: Date
  ): Promise<number | null> {
    if (sourceCurrency.toLowerCase() === targetCurrency.toLowerCase()) {
      return amount;
    }

    const key = `${sourceCurrency.toLowerCase()}_${targetCurrency.toLowerCase()}`;
    const rate = this.rates.get(key);

    return rate !== undefined ? amount * rate : null;
  }
}

describe.sequential('Transfers Module Integration Tests', () => {
  let container: Awaited<ReturnType<PostgreSqlContainer['start']>>;
  let database: DatabaseService;
  let hrpClientFactory: IntegrationHrpClientFactory;
  let currencyConversionService: IntegrationCurrencyConversionService;
  let configService: ConfigService;
  let schedulerRegistry: SchedulerRegistry;

  // Services under test
  let hrpTransferProcessorService: HrpTransferProcessorService;
  let transfersSchedulerService: TransfersSchedulerService;
  let controller: HrpTransferJobController;

  beforeAll(async () => {
    // Start PostgreSQL container
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('transfers_integration_test')
      .withUsername('tester')
      .withPassword('tester')
      .start();

    const connectionUri = container.getConnectionUri();
    process.env.DATABASE_URL = connectionUri;

    // Initialize database schema
    await execFileAsync('./node_modules/.bin/prisma', [
      'db',
      'push',
      '--schema=libs/database/prisma/schema.prisma',
    ], {
      env: {
        ...process.env,
        DATABASE_URL: connectionUri,
      },
    });

    // Create integration test stubs
    hrpClientFactory = new IntegrationHrpClientFactory();
    currencyConversionService = new IntegrationCurrencyConversionService();

    // Initialize database directly
    database = new DatabaseService();
    await database.$connect();

    // Create services manually
    configService = new IntegrationConfigService() as unknown as ConfigService;
    schedulerRegistry = new SchedulerRegistry();

    hrpTransferProcessorService = new HrpTransferProcessorService(
      hrpClientFactory as unknown as HRPClientFactory,
      database,
      currencyConversionService as unknown as CurrencyConversionService,
    );

    transfersSchedulerService = new TransfersSchedulerService(
      configService,
      hrpTransferProcessorService,
      database,
      schedulerRegistry,
    );

    controller = new HrpTransferJobController(transfersSchedulerService);

    await ensureCounterparties(database);
  }, 120_000);

  afterAll(async () => {
    await database?.$disconnect();
    await container?.stop();
  }, 60_000);

  beforeEach(async () => {
    // Clean up test data completely
    await database.transfer.deleteMany();
    await database.hrpTradingAccount.deleteMany();
    await database.hrpBasicAccount.deleteMany();
    await database.portfolio.deleteMany();
    await database.shareClass.deleteMany({
      where: { name: { startsWith: 'INTEGRATION_' } },
    });

    // Also clear mock data from HRP client factory
    hrpClientFactory.clearAllTransfers();
  });

  describe('End-to-End Transfer Processing', () => {
    it('processes a complete transfer workflow from API to database', async () => {
      // Setup: Create share classes with accounts
      const shareClass1 = await createIntegrationShareClass(database, 'INTEGRATION_SC_1', 'USD');
      const shareClass2 = await createIntegrationShareClass(database, 'INTEGRATION_SC_2', 'EUR');

      const portfolio1 = await createIntegrationPortfolio(database, shareClass1);
      const portfolio2 = await createIntegrationPortfolio(database, shareClass2);

      const tradingAccount1 = await createIntegrationTradingAccount(database, shareClass1, portfolio1, 'hrp123:MAIN');
      const tradingAccount2 = await createIntegrationTradingAccount(database, shareClass2, portfolio2, 'hrp456:EURO');

      const basicAccount1 = await createIntegrationBasicAccount(database, shareClass1, 'basic1:USD');
      const basicAccount2 = await createIntegrationBasicAccount(database, shareClass2, 'basic2:EUR');

      // Setup: Configure HRP client responses
      const sc1Deposits: HrpTransferEvent[] = [
        {
          id: 'dep_001',
          quantity: '1.5',
          asset: 'BTC',
          type: 'Deposit',
          eventTimestamp: '2025-09-15T10:00:00Z',
          transferTimestamp: '2025-09-15T10:05:00Z',
          venue: 'BINANCE',
          account: 'hrp123',
        },
        {
          id: 'dep_002',
          quantity: '1000.00',
          asset: 'USDT',
          type: 'Deposit',
          eventTimestamp: '2025-09-16T14:30:00Z',
          transferTimestamp: '2025-09-16T14:35:00Z',
          venue: 'BINANCE',
          account: 'hrp123',
        },
      ];

      const sc1Withdrawals: HrpTransferEvent[] = [
        {
          id: 'with_001',
          quantity: '500.00',
          asset: 'USD',
          type: 'Withdraw',
          eventTimestamp: '2025-09-17T09:15:00Z',
          transferTimestamp: '2025-09-17T09:20:00Z',
          venue: 'BINANCE',
          account: 'hrp123',
        },
      ];

      const sc2Deposits: HrpTransferEvent[] = [
        {
          id: 'dep_003',
          quantity: '2.0',
          asset: 'ETH',
          type: 'Deposit',
          eventTimestamp: '2025-09-18T11:00:00Z',
          transferTimestamp: '2025-09-18T11:05:00Z',
          venue: 'BINANCE',
          account: 'hrp456',
        },
      ];

      hrpClientFactory.setTransfersForShareClass(shareClass1.name, sc1Deposits, sc1Withdrawals);
      hrpClientFactory.setTransfersForShareClass(shareClass2.name, sc2Deposits, []);

      // Setup: Configure currency conversion rates
      currencyConversionService.setRate('BTC', 'USD', 45000);
      currencyConversionService.setRate('USDT', 'USD', 1);
      currencyConversionService.setRate('ETH', 'EUR', 2500);

      // Action: Process transfers
      const params: TransferIngestionParams = {
        startDate: new Date('2025-09-01T00:00:00Z'),
        endDate: new Date('2025-09-30T23:59:59Z'),
      };

      const results = await hrpTransferProcessorService.processMultipleShareClasses(
        [shareClass1, shareClass2],
        params
      );

      // Verification: Check processing results
      expect(results.get(shareClass1.name)).toBe(3); // 2 deposits + 1 withdrawal
      expect(results.get(shareClass2.name)).toBe(1); // 1 deposit

      // Verification: Check database state
      const allTransfers = await database.transfer.findMany({
        orderBy: { createdAt: 'asc' },
      });

      expect(allTransfers).toHaveLength(4);

      // Verify BTC deposit conversion
      const btcDeposit = allTransfers.find(t =>
        t.amount.toNumber() === 67500 && // 1.5 BTC * 45000 USD/BTC
        t.denomination === 'USD'
      );
      expect(btcDeposit).toBeDefined();
      expect(btcDeposit!.fromAccountType).toBe('BASIC');
      expect(btcDeposit!.toAccountType).toBe('TRADING');

      // Verify USDT deposit (no conversion needed)
      const usdtDeposit = allTransfers.find(t =>
        t.amount.toNumber() === 1000 &&
        t.denomination === 'USD'
      );
      expect(usdtDeposit).toBeDefined();

      // Verify USD withdrawal
      const usdWithdrawal = allTransfers.find(t =>
        t.amount.toNumber() === 500 &&
        t.fromAccountType === 'TRADING' &&
        t.toAccountType === 'BASIC'
      );
      expect(usdWithdrawal).toBeDefined();

      // Verify ETH deposit conversion to EUR
      const ethDeposit = allTransfers.find(t =>
        t.amount.toNumber() === 5000 && // 2.0 ETH * 2500 EUR/ETH
        t.denomination === 'EUR'
      );
      expect(ethDeposit).toBeDefined();
    });

    it('handles mixed success and failure scenarios', async () => {
      const shareClassSuccess = await createIntegrationShareClass(database, 'INTEGRATION_SC_SUCCESS', 'USD');
      const shareClassFailure = await createIntegrationShareClass(database, 'INTEGRATION_SC_FAILURE', 'USD');

      const portfolio = await createIntegrationPortfolio(database, shareClassSuccess);
      await createIntegrationTradingAccount(database, shareClassSuccess, portfolio, 'hrp789:SUCCESS');
      await createIntegrationBasicAccount(database, shareClassSuccess, 'basic3:SUCCESS');

      // Only set up success case - failure case will have no accounts
      hrpClientFactory.setTransfersForShareClass(shareClassSuccess.name, [
        {
          id: 'success_001',
          quantity: '100.00',
          asset: 'USD',
          type: 'Deposit',
          eventTimestamp: '2025-09-15T10:00:00Z',
          transferTimestamp: '2025-09-15T10:05:00Z',
          venue: 'BINANCE',
          account: 'hrp789',
        },
      ], []);

      hrpClientFactory.setTransfersForShareClass(shareClassFailure.name, [], []);

      const params: TransferIngestionParams = {
        startDate: new Date('2025-09-01T00:00:00Z'),
        endDate: new Date('2025-09-30T23:59:59Z'),
      };

      const results = await hrpTransferProcessorService.processMultipleShareClasses(
        [shareClassSuccess, shareClassFailure],
        params
      );

      expect(results.get(shareClassSuccess.name)).toBe(1);
      expect(results.get(shareClassFailure.name)).toBe(0); // No accounts with portfolios

      const transfers = await database.transfer.findMany();
      expect(transfers).toHaveLength(1);
      expect(transfers[0].amount.toNumber()).toBe(100);
    });
  });

  describe('Scheduler Service Integration', () => {
    it('executes full sync workflow through scheduler', async () => {
      const shareClass = await createIntegrationShareClass(database, 'INTEGRATION_SC_SCHEDULER', 'USD');
      const portfolio = await createIntegrationPortfolio(database, shareClass);
      await createIntegrationTradingAccount(database, shareClass, portfolio, 'hrp101:SCHEDULER');
      await createIntegrationBasicAccount(database, shareClass, 'basic4:SCHEDULER');

      hrpClientFactory.setTransfersForShareClass(shareClass.name, [
        {
          id: 'sched_dep_001',
          quantity: '750.00',
          asset: 'USD',
          type: 'Deposit',
          eventTimestamp: '2025-09-01T10:00:00Z', // Recent date within lookback
          transferTimestamp: '2025-09-01T10:05:00Z',
          venue: 'BINANCE',
          account: 'hrp101',
        },
      ], [
        {
          id: 'sched_with_001',
          quantity: '250.00',
          asset: 'USD',
          type: 'Withdraw',
          eventTimestamp: '2025-09-02T10:00:00Z', // Recent date within lookback
          transferTimestamp: '2025-09-02T10:05:00Z',
          venue: 'BINANCE',
          account: 'hrp101',
        },
      ]);

      const syncResult = await transfersSchedulerService.triggerManualSync();

      expect(syncResult.message).toBe('Transfer synchronization completed successfully');
      expect(syncResult.summary.totalTransfersProcessed).toBe(2);
      expect(syncResult.summary.depositsProcessed).toBe(1);
      expect(syncResult.summary.withdrawalsProcessed).toBe(1);
      expect(syncResult.summary.shareClassResults).toHaveLength(1);
      expect(syncResult.summary.shareClassResults[0].success).toBe(true);

      const transfers = await database.transfer.findMany();
      expect(transfers).toHaveLength(2);
    });
  });

  describe('Controller Integration', () => {
    it('handles complete request/response cycle', async () => {
      const shareClass = await createIntegrationShareClass(database, 'INTEGRATION_SC_CONTROLLER', 'USD');
      const portfolio = await createIntegrationPortfolio(database, shareClass);
      await createIntegrationTradingAccount(database, shareClass, portfolio, 'hrp202:CONTROLLER');
      await createIntegrationBasicAccount(database, shareClass, 'basic5:CONTROLLER');

      hrpClientFactory.setTransfersForShareClass(shareClass.name, [
        {
          id: 'ctrl_dep_001',
          quantity: '1000.00',
          asset: 'USD',
          type: 'Deposit',
          eventTimestamp: '2025-09-03T10:00:00Z', // Recent date within lookback
          transferTimestamp: '2025-09-03T10:05:00Z',
          venue: 'BINANCE',
          account: 'hrp202',
        },
      ], []);

      // Test manual sync trigger
      const syncResult = await controller.triggerSync();

      expect(syncResult.message).toBe('Transfer synchronization completed successfully');
      expect(syncResult.summary.totalTransfersProcessed).toBe(1);

      // Test status retrieval
      const status = await controller.getStatus();

      expect(status.lastRunTime).toBeDefined();
      expect(status.lastRunResult?.transfersProcessed).toBe(1);

      // Test schedule info
      const scheduleInfo = await controller.getScheduleInfo();

      expect(scheduleInfo.enabled).toBe(true);
      expect(scheduleInfo.description).toBe('Daily HRP transfer synchronization with multi-shareclass support');
      expect(scheduleInfo.configuration.lookbackDaysDeposits).toBe(300);
      expect(scheduleInfo.configuration.lookbackDaysWithdrawals).toBe(600);
    });
  });

  describe('Currency Conversion Integration', () => {
    it('handles various currency conversion scenarios', async () => {
      const shareClass = await createIntegrationShareClass(database, 'INTEGRATION_SC_CURRENCY', 'USD');
      const portfolio = await createIntegrationPortfolio(database, shareClass);
      await createIntegrationTradingAccount(database, shareClass, portfolio, 'hrp303:CURRENCY');
      await createIntegrationBasicAccount(database, shareClass, 'basic6:CURRENCY');

      // Test successful conversion
      currencyConversionService.setRate('BTC', 'USD', 50000);

      // Test failed conversion (rate not available)
      // Don't set rate for UNKNOWN_COIN

      hrpClientFactory.setTransfersForShareClass(shareClass.name, [
        {
          id: 'curr_dep_001',
          quantity: '0.5',
          asset: 'BTC',
          type: 'Deposit',
          eventTimestamp: '2025-09-15T10:00:00Z',
          transferTimestamp: '2025-09-15T10:05:00Z',
          venue: 'BINANCE',
          account: 'hrp303',
        },
        {
          id: 'curr_dep_002',
          quantity: '1000',
          asset: 'UNKNOWN_COIN',
          type: 'Deposit',
          eventTimestamp: '2025-09-15T11:00:00Z',
          transferTimestamp: '2025-09-15T11:05:00Z',
          venue: 'BINANCE',
          account: 'hrp303',
        },
      ], []);

      const params: TransferIngestionParams = {
        startDate: new Date('2025-09-01T00:00:00Z'),
        endDate: new Date('2025-09-30T23:59:59Z'),
        transferType: 'deposit',
      };

      const result = await hrpTransferProcessorService.processTransfersForShareClass(shareClass, params);

      expect(result).toBe(2);

      const transfers = await database.transfer.findMany({
        orderBy: { createdAt: 'asc' },
      });

      expect(transfers).toHaveLength(2);

      // BTC transfer should be converted
      const btcTransfer = transfers[0];
      expect(btcTransfer.amount.toNumber()).toBe(25000); // 0.5 BTC * 50000 USD/BTC
      expect(btcTransfer.denomination).toBe('USD');

      // UNKNOWN_COIN transfer should use original amount (conversion failed)
      const unknownTransfer = transfers[1];
      expect(unknownTransfer.amount.toNumber()).toBe(1000);
      expect(unknownTransfer.denomination).toBe('USD');
    });
  });
});

async function ensureCounterparties(database: DatabaseService): Promise<void> {
  const counterparties = [
    { name: 'BINANCE', type: 'exchange' },
    { name: 'HRPMASTER', type: 'provider' },
    { name: 'ZODIA', type: 'custodian' },
  ];

  for (const counterparty of counterparties) {
    await database.counterparty.upsert({
      where: { name: counterparty.name },
      update: {},
      create: {
        name: counterparty.name,
        type: counterparty.type,
        alternativeNames: { label: counterparty.name.toLowerCase() },
      },
    });
  }
}

async function createIntegrationShareClass(database: DatabaseService, name: string, denomCcy: string): Promise<ShareClass> {
  return database.shareClass.create({
    data: {
      name,
      denomCcy,
      apiKeys: {
        clientId: `${name}-client`,
        clientSecret: `${name}-secret`,
        audience: 'https://api.hiddenroad.com/v0/',
      },
    },
  });
}

async function createIntegrationPortfolio(database: DatabaseService, shareClass: ShareClass) {
  const portfolio = await database.portfolio.create({
    data: {
      name: `Integration Portfolio ${shareClass.name}`,
      shareClassId: shareClass.id,
      allocationQuantity: 1000000, // Required field
    },
  });
  return portfolio.id;
}

async function createIntegrationTradingAccount(database: DatabaseService, shareClass: ShareClass, portfolioId: bigint, accountName: string) {
  const counterparty = await database.counterparty.findFirst({
    where: { name: 'BINANCE' },
  });

  return database.hrpTradingAccount.create({
    data: {
      name: accountName,
      type: 'OTHER',
      shareClassId: shareClass.id,
      venueId: counterparty!.id,
      portfolioId, // Critical: Must have portfolio assignment
    },
  });
}

async function createIntegrationBasicAccount(database: DatabaseService, shareClass: ShareClass, accountName: string) {
  return database.hrpBasicAccount.create({
    data: {
      name: accountName,
      denomination: shareClass.denomCcy,
      shareClassId: shareClass.id,
    },
  });
}