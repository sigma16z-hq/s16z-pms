import { Injectable } from '@nestjs/common';
import { PortfolioValuation, Prisma } from '@prisma/client';
import { DatabaseService } from '../database.service';
import { PortfolioValuationRepository } from '../interfaces';

@Injectable()
export class PortfolioValuationRepositoryImpl implements PortfolioValuationRepository {
  constructor(private readonly prisma: DatabaseService) {}

  async create(data: Prisma.PortfolioValuationCreateInput): Promise<PortfolioValuation> {
    return this.prisma.portfolioValuation.create({ data });
  }

  async findById(id: bigint): Promise<PortfolioValuation | null> {
    return this.prisma.portfolioValuation.findUnique({ where: { id } });
  }

  async findMany(where?: Prisma.PortfolioValuationWhereInput, skip?: number, take?: number): Promise<PortfolioValuation[]> {
    return this.prisma.portfolioValuation.findMany({ where, skip, take });
  }

  async update(id: bigint, data: Prisma.PortfolioValuationUpdateInput): Promise<PortfolioValuation> {
    return this.prisma.portfolioValuation.update({ where: { id }, data });
  }

  async delete(id: bigint): Promise<PortfolioValuation> {
    return this.prisma.portfolioValuation.delete({ where: { id } });
  }

  async count(where?: Prisma.PortfolioValuationWhereInput): Promise<number> {
    return this.prisma.portfolioValuation.count({ where });
  }

  async findByPortfolioId(portfolioId: number): Promise<PortfolioValuation[]> {
    return this.prisma.portfolioValuation.findMany({
      where: { portfolioId },
      orderBy: { valuationTo: 'desc' }
    });
  }

  async findByDateRange(portfolioId: number, fromDate: Date, toDate: Date): Promise<PortfolioValuation[]> {
    return this.prisma.portfolioValuation.findMany({
      where: {
        portfolioId,
        valuationFrom: { gte: fromDate },
        valuationTo: { lte: toDate }
      },
      orderBy: { valuationTo: 'asc' }
    });
  }

  async findLatestByPortfolioId(portfolioId: number): Promise<PortfolioValuation | null> {
    return this.prisma.portfolioValuation.findFirst({
      where: { portfolioId },
      orderBy: { valuationTo: 'desc' }
    });
  }

  async findBySnapshotId(snapshotId: string): Promise<PortfolioValuation | null> {
    return this.prisma.portfolioValuation.findFirst({
      where: { snapshotId }
    });
  }

  async findWithCalculations(valuationId: bigint): Promise<PortfolioValuation | null> {
    return this.prisma.portfolioValuation.findUnique({
      where: { id: valuationId },
      include: {
        portfolioCalculations: true
      }
    });
  }
}