import { Injectable } from '@nestjs/common';
import { Transfer, Prisma, AccountType } from '@prisma/client';
import { DatabaseService } from '../database.service';
import { TransferRepository } from '../interfaces';

@Injectable()
export class TransferRepositoryImpl implements TransferRepository {
  constructor(private readonly prisma: DatabaseService) {}

  async create(data: Prisma.TransferCreateInput): Promise<Transfer> {
    return this.prisma.transfer.create({ data });
  }

  async findById(id: bigint): Promise<Transfer | null> {
    return this.prisma.transfer.findUnique({ where: { id } });
  }

  async findMany(where?: Prisma.TransferWhereInput, skip?: number, take?: number): Promise<Transfer[]> {
    return this.prisma.transfer.findMany({ where, skip, take });
  }

  async update(id: bigint, data: Prisma.TransferUpdateInput): Promise<Transfer> {
    return this.prisma.transfer.update({ where: { id }, data });
  }

  async delete(id: bigint): Promise<Transfer> {
    return this.prisma.transfer.delete({ where: { id } });
  }

  async count(where?: Prisma.TransferWhereInput): Promise<number> {
    return this.prisma.transfer.count({ where });
  }

  async findByAccount(accountType: AccountType, accountId: bigint): Promise<Transfer[]> {
    return this.prisma.transfer.findMany({
      where: {
        OR: [
          { fromAccountType: accountType, fromAccountId: accountId },
          { toAccountType: accountType, toAccountId: accountId }
        ]
      },
      orderBy: { valuationTime: 'desc' }
    });
  }

  async findByDateRange(fromDate: Date, toDate: Date): Promise<Transfer[]> {
    return this.prisma.transfer.findMany({
      where: {
        valuationTime: {
          gte: fromDate,
          lte: toDate
        }
      },
      orderBy: { valuationTime: 'asc' }
    });
  }

  async findNetInflowForAccount(accountType: AccountType, accountId: bigint, upToDate: Date): Promise<number> {
    const result = await this.prisma.transfer.aggregate({
      where: {
        OR: [
          {
            toAccountType: accountType,
            toAccountId: accountId,
            valuationTime: { lte: upToDate }
          },
          {
            fromAccountType: accountType,
            fromAccountId: accountId,
            valuationTime: { lte: upToDate }
          }
        ]
      },
      _sum: {
        amount: true
      }
    });

    // Calculate net inflow (inflows - outflows)
    const inflows = await this.prisma.transfer.aggregate({
      where: {
        toAccountType: accountType,
        toAccountId: accountId,
        valuationTime: { lte: upToDate }
      },
      _sum: { amount: true }
    });

    const outflows = await this.prisma.transfer.aggregate({
      where: {
        fromAccountType: accountType,
        fromAccountId: accountId,
        valuationTime: { lte: upToDate }
      },
      _sum: { amount: true }
    });

    const inflowSum = Number(inflows._sum.amount) || 0;
    const outflowSum = Number(outflows._sum.amount) || 0;

    return inflowSum - outflowSum;
  }
}