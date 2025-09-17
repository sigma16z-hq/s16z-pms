import { describe, beforeAll, afterAll, beforeEach, it, expect } from 'vitest';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { DatabaseService } from '@app/database';
import { HRPAccountProcessorService } from './hrp-account-processor.service';
import type { HRPAccount } from '../types/hrp.types';
import type { ShareClass } from '@prisma/client';
import type { HRPClientFactory } from '@s16z/hrp-client';

const execFileAsync = promisify(execFile);

interface ShareClassAccountMap {
  [shareClassName: string]: (() => Promise<HRPAccount[]>) | HRPAccount[];
}

class StubHrpClientFactory {
  constructor(private readonly responses: ShareClassAccountMap = {}) {}

  setAccounts(shareClassName: string, accounts: (() => Promise<HRPAccount[]>) | HRPAccount[]): void {
    this.responses[shareClassName] = accounts;
  }

  async getClient(credentials: { shareClassName: string }) {
    const provider = this.responses[credentials.shareClassName];
    const resolveAccounts = typeof provider === 'function' ? provider : async () => provider ?? [];

    return {
      async listAccounts(): Promise<HRPAccount[]> {
        return await resolveAccounts();
      },
    } as unknown;
  }
}

describe.sequential('HRPAccountProcessorService', () => {
  let container: Awaited<ReturnType<PostgreSqlContainer['start']>>;
  let database: DatabaseService;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('hrp_accounts_test')
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
    await database.hrpTradingAccount.deleteMany();
    await database.hrpBasicAccount.deleteMany();
    await database.tripartyAccount.deleteMany();
    await database.shareClass.deleteMany({
      where: { name: { startsWith: 'TEST_' } },
    });
  });

  it('persists trading, basic, and triparty accounts with correct classification', async () => {
    const shareClass = await createTestShareClass(database, 'TEST_SC_1');
    const factory = new StubHrpClientFactory({
      [shareClass.name]: [
        { account: 'hrp1234567890:FUNDING ACCOUNT', venue: 'BINANCE' },
        { account: 'basic-account:001', venue: 'HRPMASTER' },
        { account: 'triparty:001', venue: 'ZODIA' },
      ],
    });

    const service = new HRPAccountProcessorService(
      factory as unknown as HRPClientFactory,
      database,
    );

    const processed = await service.processAccountsForShareClass(shareClass);

    expect(processed).toHaveLength(3);
    expect(processed.map(account => account.type).sort()).toEqual(['BASIC', 'TRADING', 'TRIPARTY']);

    const tradingAccounts = await database.hrpTradingAccount.findMany();
    expect(tradingAccounts).toHaveLength(1);
    expect(tradingAccounts[0].name).toBe('hrp1234567890:FUNDING ACCOUNT');
    expect(tradingAccounts[0].type).toBe('FUNDING');
    expect(tradingAccounts[0].shareClassId).toBe(shareClass.id);

    const basicAccounts = await database.hrpBasicAccount.findMany();
    expect(basicAccounts).toHaveLength(1);
    expect(basicAccounts[0].name).toBe('basic-account:001');
    expect(basicAccounts[0].shareClassId).toBe(shareClass.id);
    expect(basicAccounts[0].denomination).toBe(shareClass.denomCcy);

    const tripartyAccounts = await database.tripartyAccount.findMany();
    expect(tripartyAccounts).toHaveLength(1);
    expect(tripartyAccounts[0].name).toBe('triparty:001');
    expect(tripartyAccounts[0].ownerId).toBe(shareClass.id);
  });

  it('skips malformed account strings while processing valid ones', async () => {
    const shareClass = await createTestShareClass(database, 'TEST_SC_2');
    const factory = new StubHrpClientFactory({
      [shareClass.name]: [
        { account: 'invalid-format', venue: 'BINANCE' },
        { account: 'hrp555555:FUNDING ACCOUNT', venue: 'BINANCE' },
      ],
    });

    const service = new HRPAccountProcessorService(
      factory as unknown as HRPClientFactory,
      database,
    );

    const processed = await service.processAccountsForShareClass(shareClass);

    expect(processed).toHaveLength(1);
    expect(processed[0].type).toBe('TRADING');

    const tradingAccounts = await database.hrpTradingAccount.findMany();
    expect(tradingAccounts).toHaveLength(1);
    expect(tradingAccounts[0].name).toBe('hrp555555:FUNDING ACCOUNT');
  });

  it('continues processing share classes even when one fails', async () => {
    const shareClassSuccess = await createTestShareClass(database, 'TEST_SC_3');
    const shareClassFailure = await createTestShareClass(database, 'TEST_SC_4');

    const factory = new StubHrpClientFactory();
    factory.setAccounts(shareClassSuccess.name, [
      { account: 'hrp111111:Account', venue: 'BINANCE' },
    ]);
    factory.setAccounts(shareClassFailure.name, async () => {
      throw new Error('HRP API temporarily unavailable');
    });

    const service = new HRPAccountProcessorService(
      factory as unknown as HRPClientFactory,
      database,
    );

    const results = await service.processMultipleShareClasses([
      shareClassSuccess,
      shareClassFailure,
    ]);

    expect(results.get(shareClassSuccess.name)).toHaveLength(1);
    expect(results.get(shareClassFailure.name)).toEqual([]);

    const tradingAccounts = await database.hrpTradingAccount.findMany({
      where: { shareClassId: shareClassSuccess.id },
    });
    expect(tradingAccounts).toHaveLength(1);

    const failedTradingAccounts = await database.hrpTradingAccount.findMany({
      where: { shareClassId: shareClassFailure.id },
    });
    expect(failedTradingAccounts).toHaveLength(0);
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

async function createTestShareClass(database: DatabaseService, name: string): Promise<ShareClass> {
  return database.shareClass.create({
    data: {
      name,
      denomCcy: 'USD',
      apiKeys: {
        clientId: `${name}-client`,
        clientSecret: `${name}-secret`,
      },
    },
  });
}
