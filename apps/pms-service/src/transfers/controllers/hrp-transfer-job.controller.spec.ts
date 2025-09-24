import { describe, beforeEach, it, expect, vi } from 'vitest';
import { HrpTransferJobController } from './hrp-transfer-job.controller';
import { TransfersSchedulerService, TransferSyncResult } from '../services/transfers-scheduler.service';
import type { TransferJobStatus, ScheduleInfo } from '../types/hrp.types';

class StubTransfersSchedulerService {
  private mockSyncResult: TransferSyncResult = {
    message: 'Transfer synchronization completed successfully',
    timestamp: new Date().toISOString(),
    summary: {
      duration: '2500ms',
      shareClassesProcessed: 2,
      totalTransfersProcessed: 15,
      depositsProcessed: 8,
      withdrawalsProcessed: 7,
      dateRange: {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      },
      shareClassResults: [
        { shareClassName: 'SC1', transfersProcessed: 8, success: true },
        { shareClassName: 'SC2', transfersProcessed: 7, success: true },
      ],
    },
  };

  private mockStatus: TransferJobStatus = {
    isRunning: false,
    lastRunTime: new Date('2024-01-15T10:00:00Z'),
    nextRunTime: new Date('2024-01-16T02:00:00Z'),
    lastRunResult: {
      transfersProcessed: 15,
      errors: [],
      duration: 2500,
    },
    schedule: {
      enabled: true,
      cronExpression: '0 2 * * *',
    },
  };

  private mockScheduleInfo: ScheduleInfo = {
    enabled: true,
    cronExpression: '0 2 * * *',
    timezone: 'UTC',
    nextRunTime: new Date('2024-01-16T02:00:00Z'),
    lastRunTime: new Date('2024-01-15T10:00:00Z'),
  };

  private callHistory: string[] = [];

  setSyncResult(result: TransferSyncResult): void {
    this.mockSyncResult = result;
  }

  setStatus(status: TransferJobStatus): void {
    this.mockStatus = status;
  }

  setScheduleInfo(scheduleInfo: ScheduleInfo): void {
    this.mockScheduleInfo = scheduleInfo;
  }

  getCallHistory(): string[] {
    return this.callHistory;
  }

  clearCallHistory(): void {
    this.callHistory = [];
  }

  async triggerManualSync(): Promise<TransferSyncResult> {
    this.callHistory.push('triggerManualSync');
    return this.mockSyncResult;
  }

  getStatus(): TransferJobStatus {
    this.callHistory.push('getStatus');
    return this.mockStatus;
  }

  getScheduleInfo(): ScheduleInfo {
    this.callHistory.push('getScheduleInfo');
    return this.mockScheduleInfo;
  }
}

describe('HrpTransferJobController', () => {
  let controller: HrpTransferJobController;
  let transfersSchedulerService: StubTransfersSchedulerService;

  beforeEach(() => {
    transfersSchedulerService = new StubTransfersSchedulerService();
    transfersSchedulerService.clearCallHistory();

    controller = new HrpTransferJobController(
      transfersSchedulerService as unknown as TransfersSchedulerService
    );
  });

  describe('triggerSync', () => {
    it('triggers manual sync successfully', async () => {
      const mockResult: TransferSyncResult = {
        message: 'Transfer synchronization completed successfully',
        timestamp: '2024-01-15T10:30:00.000Z',
        summary: {
          duration: '3200ms',
          shareClassesProcessed: 3,
          totalTransfersProcessed: 25,
          depositsProcessed: 15,
          withdrawalsProcessed: 10,
          dateRange: {
            startDate: '2023-10-15',
            endDate: '2024-01-15',
          },
          shareClassResults: [
            { shareClassName: 'MAIN', transfersProcessed: 15, success: true },
            { shareClassName: 'SECONDARY', transfersProcessed: 10, success: true },
            { shareClassName: 'TEST', transfersProcessed: 0, success: true },
          ],
        },
      };

      transfersSchedulerService.setSyncResult(mockResult);

      const result = await controller.triggerSync();

      expect(result).toEqual(mockResult);
      expect(transfersSchedulerService.getCallHistory()).toContain('triggerManualSync');
    });

    it('returns failure result when sync fails', async () => {
      const mockFailureResult: TransferSyncResult = {
        message: 'Transfer synchronization failed',
        timestamp: '2024-01-15T10:30:00.000Z',
        summary: {
          duration: '1200ms',
          shareClassesProcessed: 0,
          totalTransfersProcessed: 0,
          depositsProcessed: 0,
          withdrawalsProcessed: 0,
          dateRange: { startDate: '', endDate: '' },
          shareClassResults: [{
            shareClassName: 'ALL',
            transfersProcessed: 0,
            success: false,
            error: 'Database connection failed',
          }],
        },
      };

      transfersSchedulerService.setSyncResult(mockFailureResult);

      const result = await controller.triggerSync();

      expect(result).toEqual(mockFailureResult);
      expect(result.message).toBe('Transfer synchronization failed');
      expect(result.summary.shareClassResults[0].success).toBe(false);
    });

    it('handles sync in progress', async () => {
      const mockInProgressResult: TransferSyncResult = {
        message: 'Transfer sync is already running',
        timestamp: '2024-01-15T10:30:00.000Z',
        summary: {
          duration: '0ms',
          shareClassesProcessed: 0,
          totalTransfersProcessed: 0,
          depositsProcessed: 0,
          withdrawalsProcessed: 0,
          dateRange: { startDate: '', endDate: '' },
          shareClassResults: [],
        },
      };

      transfersSchedulerService.setSyncResult(mockInProgressResult);

      const result = await controller.triggerSync();

      expect(result).toEqual(mockInProgressResult);
      expect(result.message).toBe('Transfer sync is already running');
    });
  });

  describe('getStatus', () => {
    it('returns current job status successfully', async () => {
      const mockStatus: TransferJobStatus = {
        isRunning: false,
        lastRunTime: new Date('2024-01-15T10:00:00Z'),
        nextRunTime: new Date('2024-01-16T02:00:00Z'),
        lastRunResult: {
          transfersProcessed: 42,
          errors: [],
          duration: 5000,
        },
        schedule: {
          enabled: true,
          cronExpression: '0 2 * * *',
        },
      };

      transfersSchedulerService.setStatus(mockStatus);

      const result = await controller.getStatus();

      expect(result).toEqual(mockStatus);
      expect(result.isRunning).toBe(false);
      expect(result.lastRunResult?.transfersProcessed).toBe(42);
      expect(transfersSchedulerService.getCallHistory()).toContain('getStatus');
    });

    it('returns status when job is running', async () => {
      const mockRunningStatus: TransferJobStatus = {
        isRunning: true,
        lastRunTime: new Date('2024-01-15T10:00:00Z'),
        nextRunTime: new Date('2024-01-16T02:00:00Z'),
        schedule: {
          enabled: true,
          cronExpression: '0 2 * * *',
        },
      };

      transfersSchedulerService.setStatus(mockRunningStatus);

      const result = await controller.getStatus();

      expect(result.isRunning).toBe(true);
      expect(result.lastRunResult).toBeUndefined();
    });

    it('returns status with errors from last run', async () => {
      const mockStatusWithErrors: TransferJobStatus = {
        isRunning: false,
        lastRunTime: new Date('2024-01-15T10:00:00Z'),
        lastRunResult: {
          transfersProcessed: 10,
          errors: [
            'ShareClass API1 failed: Connection timeout',
            'ShareClass API2 failed: Invalid credentials',
          ],
          duration: 3000,
        },
        schedule: {
          enabled: true,
          cronExpression: '0 2 * * *',
        },
      };

      transfersSchedulerService.setStatus(mockStatusWithErrors);

      const result = await controller.getStatus();

      expect(result.lastRunResult?.errors).toHaveLength(2);
      expect(result.lastRunResult?.errors).toContain('ShareClass API1 failed: Connection timeout');
    });

    it('returns status when scheduling is disabled', async () => {
      const mockDisabledStatus: TransferJobStatus = {
        isRunning: false,
        lastRunTime: new Date('2024-01-15T10:00:00Z'),
      };

      transfersSchedulerService.setStatus(mockDisabledStatus);

      const result = await controller.getStatus();

      expect(result.schedule).toBeUndefined();
    });
  });

  describe('getScheduleInfo', () => {
    it('returns schedule info successfully when enabled', async () => {
      const mockScheduleInfo: ScheduleInfo = {
        enabled: true,
        cronExpression: '0 2 * * *',
        timezone: 'UTC',
        nextRunTime: new Date('2024-01-16T02:00:00Z'),
        lastRunTime: new Date('2024-01-15T02:00:00Z'),
      };

      transfersSchedulerService.setScheduleInfo(mockScheduleInfo);

      const result = await controller.getScheduleInfo();

      expect(result.enabled).toBe(true);
      expect(result.schedule).toBe('0 2 * * *');
      expect(result.timeZone).toBe('UTC');
      expect(result.nextRun).toBe('2024-01-16T02:00:00.000Z');
      expect(result.lastRun).toBe('2024-01-15T02:00:00.000Z');
      expect(result.description).toBe('Daily HRP transfer synchronization with multi-shareclass support');
      expect(result.configuration).toEqual({
        lookbackDaysDeposits: 300,
        lookbackDaysWithdrawals: 600,
        batchSize: 100,
      });

      expect(transfersSchedulerService.getCallHistory()).toContain('getScheduleInfo');
    });

    it('returns schedule info when disabled', async () => {
      const mockDisabledScheduleInfo: ScheduleInfo = {
        enabled: false,
        cronExpression: '',
        timezone: '',
        nextRunTime: undefined,
        lastRunTime: new Date('2024-01-15T02:00:00Z'),
      };

      transfersSchedulerService.setScheduleInfo(mockDisabledScheduleInfo);

      const result = await controller.getScheduleInfo();

      expect(result.enabled).toBe(false);
      expect(result.schedule).toBe('');
      expect(result.nextRun).toBeUndefined();
      expect(result.lastRun).toBe('2024-01-15T02:00:00.000Z');
      expect(result.description).toBe('Daily HRP transfer synchronization with multi-shareclass support');
    });

    it('returns schedule info with custom configuration', async () => {
      const mockCustomScheduleInfo: ScheduleInfo = {
        enabled: true,
        cronExpression: '0 */6 * * *',
        timezone: 'UTC',
        nextRunTime: new Date('2024-01-16T06:00:00Z'),
        lastRunTime: new Date('2024-01-15T18:00:00Z'),
      };

      transfersSchedulerService.setScheduleInfo(mockCustomScheduleInfo);

      const result = await controller.getScheduleInfo();

      expect(result.enabled).toBe(true);
      expect(result.schedule).toBe('0 */6 * * *');
      expect(result.nextRun).toBe('2024-01-16T06:00:00.000Z');
      expect(result.configuration).toEqual({
        lookbackDaysDeposits: 300,
        lookbackDaysWithdrawals: 600,
        batchSize: 100,
      });
    });

    it('handles missing next run time', async () => {
      const mockScheduleInfo: ScheduleInfo = {
        enabled: true,
        cronExpression: '0 2 * * *',
        timezone: 'UTC',
        nextRunTime: undefined,
        lastRunTime: new Date('2024-01-15T02:00:00Z'),
      };

      transfersSchedulerService.setScheduleInfo(mockScheduleInfo);

      const result = await controller.getScheduleInfo();

      expect(result.enabled).toBe(true);
      expect(result.nextRun).toBeUndefined();
      expect(result.lastRun).toBe('2024-01-15T02:00:00.000Z');
    });

    it('handles missing last run time', async () => {
      const mockScheduleInfo: ScheduleInfo = {
        enabled: true,
        cronExpression: '0 2 * * *',
        timezone: 'UTC',
        nextRunTime: new Date('2024-01-16T02:00:00Z'),
        lastRunTime: undefined,
      };

      transfersSchedulerService.setScheduleInfo(mockScheduleInfo);

      const result = await controller.getScheduleInfo();

      expect(result.enabled).toBe(true);
      expect(result.nextRun).toBe('2024-01-16T02:00:00.000Z');
      expect(result.lastRun).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('propagates errors from scheduler service', async () => {
      // Mock the scheduler service to throw an error
      const errorMessage = 'Internal scheduler error';
      transfersSchedulerService.triggerManualSync = vi.fn().mockRejectedValue(new Error(errorMessage));

      await expect(controller.triggerSync()).rejects.toThrow(errorMessage);
    });

    it('propagates errors from status retrieval', async () => {
      const errorMessage = 'Status retrieval failed';
      transfersSchedulerService.getStatus = vi.fn().mockImplementation(() => {
        throw new Error(errorMessage);
      });

      await expect(controller.getStatus()).rejects.toThrow(errorMessage);
    });

    it('propagates errors from schedule info retrieval', async () => {
      const errorMessage = 'Schedule info retrieval failed';
      transfersSchedulerService.getScheduleInfo = vi.fn().mockImplementation(() => {
        throw new Error(errorMessage);
      });

      await expect(controller.getScheduleInfo()).rejects.toThrow(errorMessage);
    });
  });
});