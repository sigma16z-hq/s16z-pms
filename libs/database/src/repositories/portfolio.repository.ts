import { Injectable } from '@nestjs/common';
import { Portfolio, Prisma } from '@prisma/client';
import { DatabaseService } from '../database.service';
import { PortfolioRepository } from '../interfaces';

@Injectable()
export class PortfolioRepositoryImpl implements PortfolioRepository {
  constructor(private readonly prisma: DatabaseService) {}

  async create(data: Prisma.PortfolioCreateInput): Promise<Portfolio> {
    return this.prisma.portfolio.create({ data });
  }

  async findById(id: number): Promise<Portfolio | null> {
    return this.prisma.portfolio.findUnique({ where: { id } });
  }

  async findMany(where?: Prisma.PortfolioWhereInput, skip?: number, take?: number): Promise<Portfolio[]> {
    return this.prisma.portfolio.findMany({ where, skip, take });
  }

  async update(id: number, data: Prisma.PortfolioUpdateInput): Promise<Portfolio> {
    return this.prisma.portfolio.update({ where: { id }, data });
  }

  async delete(id: number): Promise<Portfolio> {
    return this.prisma.portfolio.delete({ where: { id } });
  }

  async count(where?: Prisma.PortfolioWhereInput): Promise<number> {
    return this.prisma.portfolio.count({ where });
  }

  async findByShareClassId(shareClassId: number): Promise<Portfolio[]> {
    return this.prisma.portfolio.findMany({
      where: { shareClassId }
    });
  }

  async findByExternalId(externalId: string): Promise<Portfolio | null> {
    return this.prisma.portfolio.findFirst({
      where: { externalId }
    });
  }

  async findWithValuations(portfolioId: number): Promise<Portfolio | null> {
    return this.prisma.portfolio.findUnique({
      where: { id: portfolioId },
      include: {
        valuations: {
          orderBy: { valuationTo: 'desc' }
        }
      }
    });
  }

  async findByManagerId(managerId: bigint): Promise<Portfolio[]> {
    return this.prisma.portfolio.findMany({
      where: { managerId }
    });
  }
}