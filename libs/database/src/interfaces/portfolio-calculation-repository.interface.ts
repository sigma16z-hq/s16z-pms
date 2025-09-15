import { PortfolioCalculation, Prisma } from '@prisma/client';
import { BaseRepository } from './base-repository.interface';

export interface PortfolioCalculationRepository extends BaseRepository<
  PortfolioCalculation,
  Prisma.PortfolioCalculationCreateInput,
  Prisma.PortfolioCalculationUpdateInput,
  Prisma.PortfolioCalculationWhereInput
> {
  findByPortfolioId(portfolioId: number): Promise<PortfolioCalculation[]>;
  findByDateRange(portfolioId: number, fromDate: Date, toDate: Date): Promise<PortfolioCalculation[]>;
  findLatestByPortfolioId(portfolioId: number): Promise<PortfolioCalculation | null>;
  findCalculationChain(portfolioId: number): Promise<PortfolioCalculation[]>;
  findByValuationId(valuationId: bigint): Promise<PortfolioCalculation | null>;
}