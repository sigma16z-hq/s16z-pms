import { Injectable } from '@nestjs/common';
import { FeeLedger, Prisma } from '@prisma/client';
import { DatabaseService } from '../database.service';
import { FeeLedgerRepository } from '../interfaces';

@Injectable()
export class FeeLedgerRepositoryImpl implements FeeLedgerRepository {
  constructor(private readonly prisma: DatabaseService) {}

  async create(data: Prisma.FeeLedgerCreateInput): Promise<FeeLedger> {
    return this.prisma.feeLedger.create({ data });
  }

  async findById(id: bigint): Promise<FeeLedger | null> {
    return this.prisma.feeLedger.findUnique({ where: { id } });
  }

  async findMany(where?: Prisma.FeeLedgerWhereInput, skip?: number, take?: number): Promise<FeeLedger[]> {
    return this.prisma.feeLedger.findMany({ where, skip, take });
  }

  async update(id: bigint, data: Prisma.FeeLedgerUpdateInput): Promise<FeeLedger> {
    return this.prisma.feeLedger.update({ where: { id }, data });
  }

  async delete(id: bigint): Promise<FeeLedger> {
    return this.prisma.feeLedger.delete({ where: { id } });
  }

  async count(where?: Prisma.FeeLedgerWhereInput): Promise<number> {
    return this.prisma.feeLedger.count({ where });
  }

  async findByShareClassId(shareClassId: number): Promise<FeeLedger[]> {
    return this.prisma.feeLedger.findMany({
      where: { shareClassId },
      orderBy: { incurredAt: 'desc' }
    });
  }

  async findByFeeType(shareClassId: number, feeType: string): Promise<FeeLedger[]> {
    return this.prisma.feeLedger.findMany({
      where: {
        shareClassId,
        feeType
      },
      orderBy: { incurredAt: 'desc' }
    });
  }

  async findByDateRange(shareClassId: number, fromDate: Date, toDate: Date): Promise<FeeLedger[]> {
    return this.prisma.feeLedger.findMany({
      where: {
        shareClassId,
        incurredAt: {
          gte: fromDate,
          lte: toDate
        }
      },
      orderBy: { incurredAt: 'asc' }
    });
  }

  async findByExternalId(externalId: string): Promise<FeeLedger | null> {
    return this.prisma.feeLedger.findUnique({
      where: { externalId }
    });
  }
}