import { SpotQuote, Prisma } from '@prisma/client';
import { BaseRepository } from './base-repository.interface';

export interface SpotQuoteRepository extends BaseRepository<
  SpotQuote,
  Prisma.SpotQuoteCreateInput,
  Prisma.SpotQuoteUpdateInput,
  Prisma.SpotQuoteWhereInput
> {
  findBySymbol(symbol: string): Promise<SpotQuote[]>;
  findLatestBySymbol(symbol: string): Promise<SpotQuote | null>;
  findByDate(symbol: string, date: Date): Promise<SpotQuote | null>;
  findByDateRange(symbol: string, fromDate: Date, toDate: Date): Promise<SpotQuote[]>;
}