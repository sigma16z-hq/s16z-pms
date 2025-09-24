import { describe, beforeAll, afterAll, beforeEach, it, expect, vi } from 'vitest';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { DatabaseService } from '@app/database';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { TransfersSchedulerService, TransferSyncResult } from './transfers-scheduler.service';
import { HrpTransferProcessorService } from './hrp-transfer-processor.service';
import type { ShareClass } from '@prisma/client';
import type { TransferIngestionParams } from '../types/hrp.types';

const execFileAsync = promisify(execFile);

class StubConfigService {
  private config: Map<string, string> = new Map();

  setConfig(key: string, value: string): void {
    this.config.set(key, value);
  }

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

class StubHrpTransferProcessorService {
  private mockResults: Map<string, number> = new Map();
  private shouldThrow = false;
  private callHistory: Array<{ shareClasses: ShareClass[], params: TransferIngestionParams }> = [];

  setMockResults(results: Map<string, number>): void {
    this.mockResults = results;
  }

  setShouldThrow(shouldThrow: boolean): void {
    this.shouldThrow = shouldThrow;
  }

  getCallHistory(): Array<{ shareClasses: ShareClass[], params: TransferIngestionParams }> {
    return this.callHistory;
  }

  clearCallHistory(): void {
    this.callHistory = [];
  }

  async processMultipleShareClasses(
    shareClasses: ShareClass[],
    params: TransferIngestionParams
  ): Promise<Map<string, number>> {
    this.callHistory.push({ shareClasses, params });

    if (this.shouldThrow) {
      throw new Error('Transfer processing failed');
    }

    const results = new Map<string, number>();
    for (const shareClass of shareClasses) {
      results.set(shareClass.name, this.mockResults.get(shareClass.name) || 0);
    }
    return results;
  }
}

class StubSchedulerRegistry {
  private jobs: Map<string, any> = new Map();
  private addedJobs: string[] = [];

  addCronJob(name: string, job: any): void {
    this.jobs.set(name, job);
    this.addedJobs.push(name);
  }

  getCronJob(name: string): any {
    return this.jobs.get(name);
  }

  deleteCronJob(name: string): void {
    this.jobs.delete(name);
  }

  getAddedJobs(): string[] {
    return this.addedJobs;
  }

  clearAddedJobs(): void {
    this.addedJobs = [];
  }
}

describe.sequential('TransfersSchedulerService', () => {
  let container: Awaited<ReturnType<PostgreSqlContainer['start']>>;
  let database: DatabaseService;
  let configService: StubConfigService;
  let schedulerRegistry: StubSchedulerRegistry;
  let hrpTransferProcessorService: StubHrpTransferProcessorService;
  let service: TransfersSchedulerService;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('transfers_scheduler_test')
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
  }, 120_000);

  afterAll(async () => {
    await database.$disconnect();
    await container.stop();
  }, 60_000);

  beforeEach(async () => {
    // Clean up test data
    await database.shareClass.deleteMany({
      where: { name: { startsWith: 'TEST_' } },
    });

    // Reset service dependencies
    configService = new StubConfigService();
    schedulerRegistry = new StubSchedulerRegistry();
    hrpTransferProcessorService = new StubHrpTransferProcessorService();
    hrpTransferProcessorService.clearCallHistory();
    schedulerRegistry.clearAddedJobs();

    // Set default configuration
    configService.setConfig('TRANSFER_SYNC_ENABLED', 'true');
    configService.setConfig('TRANSFER_SYNC_SCHEDULE', '0 2 * * *');
    configService.setConfig('TRANSFER_LOOKBACK_DAYS_DEPOSITS', '300');
    configService.setConfig('TRANSFER_LOOKBACK_DAYS_WITHDRAWALS', '600');
    configService.setConfig('TRANSFER_BATCH_SIZE', '100');
  });

  describe('initialization', () => {
    it('initializes with default configuration when environment variables are not set', () => {
      service = new TransfersSchedulerService(
        configService as unknown as ConfigService,
        hrpTransferProcessorService as unknown as HrpTransferProcessorService,
        database,
        schedulerRegistry as unknown as SchedulerRegistry,
      );

      // Verify job was scheduled
      expect(schedulerRegistry.getAddedJobs()).toContain('hrp-transfer-sync');
    });

    it('does not schedule job when TRANSFER_SYNC_ENABLED is false', () => {
      configService.setConfig('TRANSFER_SYNC_ENABLED', 'false');

      service = new TransfersSchedulerService(
        configService as unknown as ConfigService,
        hrpTransferProcessorService as unknown as HrpTransferProcessorService,
        database,
        schedulerRegistry as unknown as SchedulerRegistry,
      );

      expect(schedulerRegistry.getAddedJobs()).toEqual([]);
    });

    it('uses custom schedule when provided', () => {
      configService.setConfig('TRANSFER_SYNC_SCHEDULE', '0 */6 * * *'); // Every 6 hours

      service = new TransfersSchedulerService(
        configService as unknown as ConfigService,
        hrpTransferProcessorService as unknown as HrpTransferProcessorService,
        database,
        schedulerRegistry as unknown as SchedulerRegistry,
      );

      expect(schedulerRegistry.getAddedJobs()).toContain('hrp-transfer-sync');
    });
  });

  describe('syncTransfers', () => {
    beforeEach(() => {
      service = new TransfersSchedulerService(
        configService as unknown as ConfigService,
        hrpTransferProcessorService as unknown as HrpTransferProcessorService,
        database,
        schedulerRegistry as unknown as SchedulerRegistry,
      );
    });

    it('processes transfers for all active share classes successfully', async () => {
      const shareClass1 = await createTestShareClass(database, 'TEST_SC_1');
      const shareClass2 = await createTestShareClass(database, 'TEST_SC_2');

      hrpTransferProcessorService.setMockResults(new Map([
        ['TEST_SC_1', 10],
        ['TEST_SC_2', 5],
      ]));

      const result = await service.syncTransfers();

      expect(result.message).toBe('Transfer synchronization completed successfully');
      expect(result.summary.totalTransfersProcessed).toBe(30); // (10+10) + (5+5) from both deposit and withdrawal calls
      expect(result.summary.depositsProcessed).toBe(15); // 10 + 5 from deposit call
      expect(result.summary.withdrawalsProcessed).toBe(15); // 10 + 5 from withdrawal call
      expect(result.summary.shareClassesProcessed).toBe(2);
      expect(result.summary.shareClassResults).toHaveLength(2);

      // Verify processor was called with correct parameters
      const callHistory = hrpTransferProcessorService.getCallHistory();
      expect(callHistory).toHaveLength(2); // Called twice (deposits and withdrawals)

      // Verify deposit params
      const depositCall = callHistory[0];
      expect(depositCall.params.transferType).toBe('deposit');
      expect(depositCall.params.batchSize).toBe(100);

      // Verify lookback days (300 days ago)
      const expectedStartDate = new Date();
      expectedStartDate.setUTCDate(expectedStartDate.getUTCDate() - 300);
      const actualStartDate = depositCall.params.startDate;
      expect(Math.abs(actualStartDate.getTime() - expectedStartDate.getTime())).toBeLessThan(60000); // Within 1 minute

      // Verify withdrawal params
      const withdrawalCall = callHistory[1];
      expect(withdrawalCall.params.transferType).toBe('withdrawal');
    });

    it('handles empty share class list gracefully', async () => {
      // No share classes in database
      const result = await service.syncTransfers();

      expect(result.message).toBe('No ShareClasses found for processing');
      expect(result.summary.totalTransfersProcessed).toBe(0);
      expect(result.summary.shareClassResults).toHaveLength(0);
    });

    it('handles transfer processing failures gracefully', async () => {
      await createTestShareClass(database, 'TEST_SC_3');

      hrpTransferProcessorService.setShouldThrow(true);

      const result = await service.syncTransfers();

      expect(result.message).toBe('Transfer synchronization failed');
      expect(result.summary.shareClassResults).toHaveLength(1);
      expect(result.summary.shareClassResults[0].success).toBe(false);
      expect(result.summary.shareClassResults[0].error).toContain('Transfer processing failed');
    });

    it('prevents concurrent execution', async () => {
      await createTestShareClass(database, 'TEST_SC_4');

      // Make the first call take some time
      let resolveFirst: () => void;
      const firstCallPromise = new Promise<void>((resolve) => {
        resolveFirst = resolve;
      });

      hrpTransferProcessorService.setMockResults(new Map([['TEST_SC_4', 1]]));

      // Override processMultipleShareClasses to wait for our signal
      const originalMethod = hrpTransferProcessorService.processMultipleShareClasses;
      hrpTransferProcessorService.processMultipleShareClasses = async (...args) => {
        await firstCallPromise;
        return originalMethod.call(hrpTransferProcessorService, ...args);
      };

      // Start first sync
      const firstSyncPromise = service.syncTransfers();

      // Start second sync immediately (should be rejected)
      const secondSyncResult = await service.syncTransfers();

      // Complete first sync
      resolveFirst!();
      const firstSyncResult = await firstSyncPromise;

      expect(firstSyncResult.message).toBe('Transfer synchronization completed successfully');
      expect(secondSyncResult.message).toBe('Transfer sync is already running');
      expect(secondSyncResult.summary.totalTransfersProcessed).toBe(0);
    });

    it('calculates correct lookback periods for deposits and withdrawals', async () => {
      configService.setConfig('TRANSFER_LOOKBACK_DAYS_DEPOSITS', '200');
      configService.setConfig('TRANSFER_LOOKBACK_DAYS_WITHDRAWALS', '400');

      service = new TransfersSchedulerService(
        configService as unknown as ConfigService,
        hrpTransferProcessorService as unknown as HrpTransferProcessorService,
        database,
        schedulerRegistry as unknown as SchedulerRegistry,
      );

      await createTestShareClass(database, 'TEST_SC_5');
      hrpTransferProcessorService.setMockResults(new Map([['TEST_SC_5', 1]]));

      await service.syncTransfers();

      const callHistory = hrpTransferProcessorService.getCallHistory();

      // Verify deposits use 200 days lookback
      const depositCall = callHistory.find(call => call.params.transferType === 'deposit');
      expect(depositCall).toBeDefined();

      const depositExpectedStart = new Date();
      depositExpectedStart.setUTCDate(depositExpectedStart.getUTCDate() - 200);
      expect(Math.abs(depositCall!.params.startDate.getTime() - depositExpectedStart.getTime())).toBeLessThan(60000);

      // Verify withdrawals use 400 days lookback
      const withdrawalCall = callHistory.find(call => call.params.transferType === 'withdrawal');
      expect(withdrawalCall).toBeDefined();

      const withdrawalExpectedStart = new Date();
      withdrawalExpectedStart.setUTCDate(withdrawalExpectedStart.getUTCDate() - 400);
      expect(Math.abs(withdrawalCall!.params.startDate.getTime() - withdrawalExpectedStart.getTime())).toBeLessThan(60000);
    });
  });

  describe('triggerManualSync', () => {
    beforeEach(() => {
      service = new TransfersSchedulerService(
        configService as unknown as ConfigService,
        hrpTransferProcessorService as unknown as HrpTransferProcessorService,
        database,
        schedulerRegistry as unknown as SchedulerRegistry,
      );
    });

    it('triggers manual sync successfully', async () => {
      await createTestShareClass(database, 'TEST_SC_6');
      hrpTransferProcessorService.setMockResults(new Map([['TEST_SC_6', 5]]));

      const result = await service.triggerManualSync();

      expect(result.message).toBe('Transfer synchronization completed successfully');
      expect(result.summary.totalTransfersProcessed).toBe(10); // 5 deposits + 5 withdrawals
    });
  });

  describe('getStatus', () => {
    beforeEach(() => {
      service = new TransfersSchedulerService(
        configService as unknown as ConfigService,
        hrpTransferProcessorService as unknown as HrpTransferProcessorService,
        database,
        schedulerRegistry as unknown as SchedulerRegistry,
      );
    });

    it('returns correct status information', async () => {
      const status = service.getStatus();

      expect(status.isRunning).toBe(false);
      expect(status.schedule?.enabled).toBe(true);
      expect(status.schedule?.cronExpression).toBe('0 2 * * *');
      expect(status.lastRunResult).toBeUndefined();
    });

    it('returns status after running sync', async () => {
      await createTestShareClass(database, 'TEST_SC_7');
      hrpTransferProcessorService.setMockResults(new Map([['TEST_SC_7', 3]]));

      await service.syncTransfers();

      const status = service.getStatus();

      expect(status.lastRunTime).toBeDefined();
      expect(status.lastRunResult?.transfersProcessed).toBe(6); // 3 deposits + 3 withdrawals
      expect(status.lastRunResult?.errors).toEqual([]);
    });
  });

  describe('getScheduleInfo', () => {
    it('returns correct schedule info when enabled', () => {
      service = new TransfersSchedulerService(
        configService as unknown as ConfigService,
        hrpTransferProcessorService as unknown as HrpTransferProcessorService,
        database,
        schedulerRegistry as unknown as SchedulerRegistry,
      );

      const scheduleInfo = service.getScheduleInfo();

      expect(scheduleInfo.enabled).toBe(true);
      expect(scheduleInfo.cronExpression).toBe('0 2 * * *');
      expect(scheduleInfo.timezone).toBe('UTC');
    });

    it('returns disabled when TRANSFER_SYNC_ENABLED is false', () => {
      configService.setConfig('TRANSFER_SYNC_ENABLED', 'false');

      service = new TransfersSchedulerService(
        configService as unknown as ConfigService,
        hrpTransferProcessorService as unknown as HrpTransferProcessorService,
        database,
        schedulerRegistry as unknown as SchedulerRegistry,
      );

      const scheduleInfo = service.getScheduleInfo();

      expect(scheduleInfo.enabled).toBe(false);
    });
  });

  describe('updateSchedule', () => {
    beforeEach(() => {
      service = new TransfersSchedulerService(
        configService as unknown as ConfigService,
        hrpTransferProcessorService as unknown as HrpTransferProcessorService,
        database,
        schedulerRegistry as unknown as SchedulerRegistry,
      );
    });

    it('updates schedule successfully', () => {
      const newCronExpression = '0 */4 * * *'; // Every 4 hours

      expect(() => {
        service.updateSchedule(newCronExpression);
      }).not.toThrow();

      // Verify new job was added
      expect(schedulerRegistry.getAddedJobs()).toContain('hrp-transfer-sync');
    });

    it('handles invalid cron expressions', () => {
      const invalidCronExpression = 'invalid cron';

      expect(() => {
        service.updateSchedule(invalidCronExpression);
      }).toThrow();
    });
  });
});

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