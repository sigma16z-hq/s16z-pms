import { Injectable } from '@nestjs/common';
import { PortfolioCalculation, Prisma } from '@prisma/client';
import { DatabaseService } from '../database.service';
import { PortfolioCalculationRepository } from '../interfaces';

@Injectable()
export class PortfolioCalculationRepositoryImpl implements PortfolioCalculationRepository {
  constructor(private readonly prisma: DatabaseService) {}

  async create(data: Prisma.PortfolioCalculationCreateInput): Promise<PortfolioCalculation> {
    return this.prisma.portfolioCalculation.create({ data });
  }

  async findById(id: bigint): Promise<PortfolioCalculation | null> {
    return this.prisma.portfolioCalculation.findUnique({ where: { id } });
  }

  async findMany(where?: Prisma.PortfolioCalculationWhereInput, skip?: number, take?: number): Promise<PortfolioCalculation[]> {
    return this.prisma.portfolioCalculation.findMany({ where, skip, take });
  }

  async update(id: bigint, data: Prisma.PortfolioCalculationUpdateInput): Promise<PortfolioCalculation> {
    return this.prisma.portfolioCalculation.update({ where: { id }, data });
  }

  async delete(id: bigint): Promise<PortfolioCalculation> {
    return this.prisma.portfolioCalculation.delete({ where: { id } });
  }

  async count(where?: Prisma.PortfolioCalculationWhereInput): Promise<number> {
    return this.prisma.portfolioCalculation.count({ where });
  }

  async findByPortfolioId(portfolioId: number): Promise<PortfolioCalculation[]> {
    return this.prisma.portfolioCalculation.findMany({
      where: { portfolioId },
      orderBy: { valuationTo: 'desc' }
    });
  }

  async findByDateRange(portfolioId: number, fromDate: Date, toDate: Date): Promise<PortfolioCalculation[]> {
    return this.prisma.portfolioCalculation.findMany({
      where: {
        portfolioId,
        valuationFrom: { gte: fromDate },
        valuationTo: { lte: toDate }
      },
      orderBy: { valuationTo: 'asc' }
    });
  }

  async findLatestByPortfolioId(portfolioId: number): Promise<PortfolioCalculation | null> {
    return this.prisma.portfolioCalculation.findFirst({
      where: { portfolioId },
      orderBy: { valuationTo: 'desc' }
    });
  }

  async findCalculationChain(portfolioId: number): Promise<PortfolioCalculation[]> {
    return this.prisma.portfolioCalculation.findMany({
      where: { portfolioId },
      include: {
        previousCalculation: true,
        nextCalculation: true
      },
      orderBy: { valuationTo: 'asc' }
    });
  }

  async findByValuationId(valuationId: bigint): Promise<PortfolioCalculation | null> {
    return this.prisma.portfolioCalculation.findUnique({
      where: { valuationId }
    });
  }
}