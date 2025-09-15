import { Portfolio, Prisma } from '@prisma/client';
import { BaseRepository } from './base-repository.interface';

export interface PortfolioRepository extends BaseRepository<
  Portfolio,
  Prisma.PortfolioCreateInput,
  Prisma.PortfolioUpdateInput,
  Prisma.PortfolioWhereInput
> {
  findByShareClassId(shareClassId: number): Promise<Portfolio[]>;
  findByExternalId(externalId: string): Promise<Portfolio | null>;
  findWithValuations(portfolioId: number): Promise<Portfolio | null>;
  findByManagerId(managerId: bigint): Promise<Portfolio[]>;
}