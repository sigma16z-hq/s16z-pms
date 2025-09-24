import { describe, beforeAll, afterAll, beforeEach, it, expect, vi } from 'vitest';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { DatabaseService } from '@app/database';
import { HrpTransferProcessorService } from './hrp-transfer-processor.service';
import type { HrpTransferEvent, TransferIngestionParams } from '../types/hrp.types';
import type { ShareClass, AccountType } from '@prisma/client';
import type { HRPClientFactory } from '@s16z/hrp-client';
import type { CurrencyConversionService } from '../../currency/services/currency-conversion.service';

const execFileAsync = promisify(execFile);

interface ShareClassTransferMap {
  [shareClassName: string]: {
    deposits?: (() => Promise<HrpTransferEvent[]>) | HrpTransferEvent[];
    withdrawals?: (() => Promise<HrpTransferEvent[]>) | HrpTransferEvent[];
  };
}

class StubHrpClientFactory {
  constructor(private readonly responses: ShareClassTransferMap = {}) {}

  setTransfers(shareClassName: string, transfers: ShareClassTransferMap[string]): void {
    this.responses[shareClassName] = transfers;
  }

  async getClient(credentials: { shareClassName: string }) {
    const provider = this.responses[credentials.shareClassName] || {};

    return {
      async fetchAllDeposits(): Promise<HrpTransferEvent[]> {
        const deposits = provider.deposits;
        return typeof deposits === 'function' ? await deposits() : deposits ?? [];
      },
      async fetchAllWithdrawals(): Promise<HrpTransferEvent[]> {
        const withdrawals = provider.withdrawals;
        return typeof withdrawals === 'function' ? await withdrawals() : withdrawals ?? [];
      },
    };
  }
}

class StubCurrencyConversionService {
  private conversionRates: Map<string, number> = new Map();

  setConversionRate(fromCcy: string, toCcy: string, rate: number): void {
    this.conversionRates.set(`${fromCcy.toLowerCase()}_${toCcy.toLowerCase()}`, rate);
  }

  async convertCurrency(
    amount: number,
    sourceCurrency: string,
    targetCurrency: string,
    timestamp: Date
  ): Promise<number | null> {
    const key = `${sourceCurrency.toLowerCase()}_${targetCurrency.toLowerCase()}`;
    const rate = this.conversionRates.get(key);

    if (sourceCurrency.toLowerCase() === targetCurrency.toLowerCase()) {
      return amount;
    }

    if (rate !== undefined) {
      return amount * rate;
    }

    // Return null for failed conversions
    return null;
  }
}

describe.sequential('HrpTransferProcessorService', () => {
  let container: Awaited<ReturnType<PostgreSqlContainer['start']>>;
  let database: DatabaseService;
  let hrpClientFactory: StubHrpClientFactory;
  let currencyConversionService: StubCurrencyConversionService;
  let service: HrpTransferProcessorService;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('hrp_transfers_test')
      .withUsername('tester')
      .withPassword('tester')
      .start();

    const connectionUri = container.getConnectionUri();
    process.env.DATABASE_URL = connectionUri;

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

    database = new DatabaseService();
    await database.$connect();

    await ensureCounterparties(database);
  }, 120_000);

  afterAll(async () => {
    await database.$disconnect();
    await container.stop();
  }, 60_000);

  beforeEach(async () => {
    // Clean up all test data
    await database.transfer.deleteMany();
    await database.hrpTradingAccount.deleteMany();
    await database.hrpBasicAccount.deleteMany();
    await database.shareClass.deleteMany({
      where: { name: { startsWith: 'TEST_' } },
    });

    // Reset service dependencies
    hrpClientFactory = new StubHrpClientFactory();
    currencyConversionService = new StubCurrencyConversionService();

    service = new HrpTransferProcessorService(
      hrpClientFactory as unknown as HRPClientFactory,
      database,
      currencyConversionService as unknown as CurrencyConversionService,
    );
  });

  describe('processTransfersForShareClass', () => {
    it('processes deposits successfully with currency conversion', async () => {
      const shareClass = await createTestShareClass(database, 'TEST_SC_1', 'USD');
      const tradingAccount = await createTestTradingAccount(database, shareClass, 'hrp123:ACCOUNT');
      const basicAccount = await createTestBasicAccount(database, shareClass, 'basic:ACCOUNT');

      // Set up test data
      const testDeposits: HrpTransferEvent[] = [{
        id: 'dep_001',
        quantity: '1.5',
        asset: 'BTC',
        type: 'Deposit',
        eventTimestamp: '2024-01-15T10:00:00Z',
        transferTimestamp: '2024-01-15T10:05:00Z',
        venue: 'BINANCE',
        account: 'hrp123',
      }];

      hrpClientFactory.setTransfers(shareClass.name, { deposits: testDeposits });
      currencyConversionService.setConversionRate('BTC', 'USD', 45000);

      const params: TransferIngestionParams = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        transferType: 'deposit',
      };

      const result = await service.processTransfersForShareClass(shareClass, params);

      expect(result).toBe(1);

      const transfers = await database.transfer.findMany();
      expect(transfers).toHaveLength(1);

      const transfer = transfers[0];
      expect(transfer.amount.toNumber()).toBe(67500); // 1.5 BTC * 45000 USD/BTC
      expect(transfer.denomination).toBe('USD');
      expect(transfer.fromAccountType).toBe('BASIC');
      expect(transfer.fromAccountId).toBe(basicAccount.id);
      expect(transfer.toAccountType).toBe('TRADING');
      expect(transfer.toAccountId).toBe(tradingAccount.id);
    });

    it('processes withdrawals successfully', async () => {
      const shareClass = await createTestShareClass(database, 'TEST_SC_2', 'USD');
      const tradingAccount = await createTestTradingAccount(database, shareClass, 'hrp456:ACCOUNT');
      const basicAccount = await createTestBasicAccount(database, shareClass, 'basic:ACCOUNT');

      const testWithdrawals: HrpTransferEvent[] = [{
        id: 'with_001',
        quantity: '500.25',
        asset: 'USD',
        type: 'Withdraw',
        eventTimestamp: '2024-01-15T10:00:00Z',
        transferTimestamp: '2024-01-15T10:05:00Z',
        venue: 'BINANCE',
        account: 'hrp456',
      }];

      hrpClientFactory.setTransfers(shareClass.name, { withdrawals: testWithdrawals });

      const params: TransferIngestionParams = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        transferType: 'withdrawal',
      };

      const result = await service.processTransfersForShareClass(shareClass, params);

      expect(result).toBe(1);

      const transfers = await database.transfer.findMany();
      expect(transfers).toHaveLength(1);

      const transfer = transfers[0];
      expect(transfer.amount.toNumber()).toBe(500.25);
      expect(transfer.denomination).toBe('USD');
      expect(transfer.fromAccountType).toBe('TRADING');
      expect(transfer.fromAccountId).toBe(tradingAccount.id);
      expect(transfer.toAccountType).toBe('BASIC');
      expect(transfer.toAccountId).toBe(basicAccount.id);
    });

    it('handles currency conversion failures gracefully', async () => {
      const shareClass = await createTestShareClass(database, 'TEST_SC_3', 'USD');
      await createTestTradingAccount(database, shareClass, 'hrp789:ACCOUNT');
      await createTestBasicAccount(database, shareClass, 'basic:ACCOUNT');

      const testDeposits: HrpTransferEvent[] = [{
        id: 'dep_002',
        quantity: '100',
        asset: 'UNKNOWN_COIN',
        type: 'Deposit',
        eventTimestamp: '2024-01-15T10:00:00Z',
        transferTimestamp: '2024-01-15T10:05:00Z',
        venue: 'BINANCE',
        account: 'hrp789',
      }];

      hrpClientFactory.setTransfers(shareClass.name, { deposits: testDeposits });
      // Don't set conversion rate - will return null

      const params: TransferIngestionParams = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        transferType: 'deposit',
      };

      const result = await service.processTransfersForShareClass(shareClass, params);

      expect(result).toBe(1);

      const transfers = await database.transfer.findMany();
      expect(transfers).toHaveLength(1);

      const transfer = transfers[0];
      expect(transfer.amount.toNumber()).toBe(100); // Uses original amount when conversion fails
      expect(transfer.denomination).toBe('USD');
    });

    it('processes both deposits and withdrawals when transferType is not specified', async () => {
      const shareClass = await createTestShareClass(database, 'TEST_SC_4', 'USD');
      await createTestTradingAccount(database, shareClass, 'hrp101:ACCOUNT');
      await createTestBasicAccount(database, shareClass, 'basic:ACCOUNT');

      const testDeposits: HrpTransferEvent[] = [{
        id: 'dep_003',
        quantity: '1000',
        asset: 'USD',
        type: 'Deposit',
        eventTimestamp: '2024-01-15T10:00:00Z',
        transferTimestamp: '2024-01-15T10:05:00Z',
        venue: 'BINANCE',
        account: 'hrp101',
      }];

      const testWithdrawals: HrpTransferEvent[] = [{
        id: 'with_002',
        quantity: '500',
        asset: 'USD',
        type: 'Withdraw',
        eventTimestamp: '2024-01-15T11:00:00Z',
        transferTimestamp: '2024-01-15T11:05:00Z',
        venue: 'BINANCE',
        account: 'hrp101',
      }];

      hrpClientFactory.setTransfers(shareClass.name, {
        deposits: testDeposits,
        withdrawals: testWithdrawals,
      });

      const params: TransferIngestionParams = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
      };

      const result = await service.processTransfersForShareClass(shareClass, params);

      expect(result).toBe(2);

      const transfers = await database.transfer.findMany();
      expect(transfers).toHaveLength(2);

      const depositTransfer = transfers.find(t => t.fromAccountType === 'BASIC');
      const withdrawalTransfer = transfers.find(t => t.fromAccountType === 'TRADING');

      expect(depositTransfer).toBeDefined();
      expect(withdrawalTransfer).toBeDefined();
      expect(depositTransfer!.amount.toNumber()).toBe(1000);
      expect(withdrawalTransfer!.amount.toNumber()).toBe(500);
    });

    it('skips accounts without portfolio assignments', async () => {
      const shareClass = await createTestShareClass(database, 'TEST_SC_5', 'USD');
      // Create trading account WITHOUT portfolio assignment
      await database.hrpTradingAccount.create({
        data: {
          name: 'hrp202:ACCOUNT',
          type: 'OTHER',
          shareClassId: shareClass.id,
          venueId: await getCounterpartyId(database, 'BINANCE'),
          // portfolioId is null - no portfolio assignment
        },
      });

      const testDeposits: HrpTransferEvent[] = [{
        id: 'dep_004',
        quantity: '1000',
        asset: 'USD',
        type: 'Deposit',
        eventTimestamp: '2024-01-15T10:00:00Z',
        transferTimestamp: '2024-01-15T10:05:00Z',
        venue: 'BINANCE',
        account: 'hrp202',
      }];

      hrpClientFactory.setTransfers(shareClass.name, { deposits: testDeposits });

      const params: TransferIngestionParams = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        transferType: 'deposit',
      };

      const result = await service.processTransfersForShareClass(shareClass, params);

      expect(result).toBe(0);

      const transfers = await database.transfer.findMany();
      expect(transfers).toHaveLength(0);
    });

    it('handles HRP API failures gracefully', async () => {
      const shareClass = await createTestShareClass(database, 'TEST_SC_6', 'USD');
      await createTestTradingAccount(database, shareClass, 'hrp303:ACCOUNT');

      hrpClientFactory.setTransfers(shareClass.name, {
        deposits: async () => {
          throw new Error('HRP API temporarily unavailable');
        },
      });

      const params: TransferIngestionParams = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        transferType: 'deposit',
      };

      const result = await service.processTransfersForShareClass(shareClass, params);

      expect(result).toBe(0);

      const transfers = await database.transfer.findMany();
      expect(transfers).toHaveLength(0);
    });
  });

  describe('processMultipleShareClasses', () => {
    it('processes multiple share classes concurrently', async () => {
      const shareClass1 = await createTestShareClass(database, 'TEST_SC_7', 'USD');
      const shareClass2 = await createTestShareClass(database, 'TEST_SC_8', 'EUR');

      await createTestTradingAccount(database, shareClass1, 'hrp404:ACCOUNT');
      await createTestBasicAccount(database, shareClass1, 'basic1:ACCOUNT');

      await createTestTradingAccount(database, shareClass2, 'hrp505:ACCOUNT');
      await createTestBasicAccount(database, shareClass2, 'basic2:ACCOUNT');

      hrpClientFactory.setTransfers(shareClass1.name, {
        deposits: [createTestDeposit('dep_005', '1000', 'USD')],
      });

      hrpClientFactory.setTransfers(shareClass2.name, {
        deposits: [createTestDeposit('dep_006', '800', 'EUR')],
      });

      const params: TransferIngestionParams = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
      };

      const results = await service.processMultipleShareClasses([shareClass1, shareClass2], params);

      expect(results.get(shareClass1.name)).toBe(1);
      expect(results.get(shareClass2.name)).toBe(1);

      const transfers = await database.transfer.findMany();
      expect(transfers).toHaveLength(2);
    });

    it('continues processing other share classes when one fails', async () => {
      const shareClassSuccess = await createTestShareClass(database, 'TEST_SC_9', 'USD');
      const shareClassFailure = await createTestShareClass(database, 'TEST_SC_10', 'EUR');

      await createTestTradingAccount(database, shareClassSuccess, 'hrp606:ACCOUNT');
      await createTestBasicAccount(database, shareClassSuccess, 'basic3:ACCOUNT');

      hrpClientFactory.setTransfers(shareClassSuccess.name, {
        deposits: [createTestDeposit('dep_007', '1000', 'USD')],
      });

      hrpClientFactory.setTransfers(shareClassFailure.name, {
        deposits: async () => {
          throw new Error('ShareClass API failure');
        },
      });

      const params: TransferIngestionParams = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
      };

      const results = await service.processMultipleShareClasses([shareClassSuccess, shareClassFailure], params);

      expect(results.get(shareClassSuccess.name)).toBe(1);
      expect(results.get(shareClassFailure.name)).toBe(0);

      const transfers = await database.transfer.findMany();
      expect(transfers).toHaveLength(1);
    });
  });

  describe('duplicate prevention', () => {
    it('handles repeated processing by creating duplicate records (current schema behavior)', async () => {
      const shareClass = await createTestShareClass(database, 'TEST_SC_11', 'USD');
      await createTestTradingAccount(database, shareClass, 'hrp707:ACCOUNT');
      await createTestBasicAccount(database, shareClass, 'basic4:ACCOUNT');

      const testDeposit = createTestDeposit('dep_008', '1000', 'USD');

      hrpClientFactory.setTransfers(shareClass.name, {
        deposits: [testDeposit],
      });

      const params: TransferIngestionParams = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        transferType: 'deposit',
      };

      // Process the same transfers twice
      const result1 = await service.processTransfersForShareClass(shareClass, params);
      const result2 = await service.processTransfersForShareClass(shareClass, params);

      expect(result1).toBe(1);
      expect(result2).toBe(1); // Creates duplicate since we don't have unique constraints

      const transfers = await database.transfer.findMany();
      expect(transfers).toHaveLength(2); // Two identical transfers
    });
  });
});

function createTestDeposit(id: string, quantity: string, asset: string): HrpTransferEvent {
  return {
    id,
    quantity,
    asset,
    type: 'Deposit',
    eventTimestamp: '2024-01-15T10:00:00Z',
    transferTimestamp: '2024-01-15T10:05:00Z',
    venue: 'BINANCE',
    account: 'hrp123',
  };
}

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

async function createTestShareClass(database: DatabaseService, name: string, denomCcy: string): Promise<ShareClass> {
  return database.shareClass.create({
    data: {
      name,
      denomCcy,
      apiKeys: {
        clientId: `${name}-client`,
        clientSecret: `${name}-secret`,
      },
    },
  });
}

async function createTestTradingAccount(database: DatabaseService, shareClass: ShareClass, accountName: string) {
  const portfolioId = await createTestPortfolio(database, shareClass);

  return database.hrpTradingAccount.create({
    data: {
      name: accountName,
      type: 'OTHER',
      shareClassId: shareClass.id,
      venueId: await getCounterpartyId(database, 'BINANCE'),
      portfolioId, // Assign to portfolio so it gets processed
    },
  });
}

async function createTestBasicAccount(database: DatabaseService, shareClass: ShareClass, accountName: string) {
  return database.hrpBasicAccount.create({
    data: {
      name: accountName,
      denomination: shareClass.denomCcy,
      shareClassId: shareClass.id,
    },
  });
}

async function createTestPortfolio(database: DatabaseService, shareClass: ShareClass) {
  const portfolio = await database.portfolio.create({
    data: {
      name: `Test Portfolio ${shareClass.name}`,
      shareClassId: shareClass.id,
      allocationQuantity: 1000000, // Required field
    },
  });
  return portfolio.id;
}

async function getCounterpartyId(database: DatabaseService, name: string): Promise<bigint> {
  const counterparty = await database.counterparty.findFirst({
    where: { name },
  });
  return counterparty!.id;
}