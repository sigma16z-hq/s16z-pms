import { PortfolioValuation, Prisma } from '@prisma/client';
import { BaseRepository } from './base-repository.interface';

export interface PortfolioValuationRepository extends BaseRepository<
  PortfolioValuation,
  Prisma.PortfolioValuationCreateInput,
  Prisma.PortfolioValuationUpdateInput,
  Prisma.PortfolioValuationWhereInput
> {
  findByPortfolioId(portfolioId: number): Promise<PortfolioValuation[]>;
  findByDateRange(portfolioId: number, fromDate: Date, toDate: Date): Promise<PortfolioValuation[]>;
  findLatestByPortfolioId(portfolioId: number): Promise<PortfolioValuation | null>;
  findBySnapshotId(snapshotId: string): Promise<PortfolioValuation | null>;
  findWithCalculations(valuationId: bigint): Promise<PortfolioValuation | null>;
}