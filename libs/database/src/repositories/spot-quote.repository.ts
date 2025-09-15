import { Injectable } from '@nestjs/common';
import { SpotQuote, Prisma } from '@prisma/client';
import { DatabaseService } from '../database.service';
import { SpotQuoteRepository } from '../interfaces';

@Injectable()
export class SpotQuoteRepositoryImpl implements SpotQuoteRepository {
  constructor(private readonly prisma: DatabaseService) {}

  async create(data: Prisma.SpotQuoteCreateInput): Promise<SpotQuote> {
    return this.prisma.spotQuote.create({ data });
  }

  async findById(id: bigint): Promise<SpotQuote | null> {
    return this.prisma.spotQuote.findUnique({ where: { id } });
  }

  async findMany(where?: Prisma.SpotQuoteWhereInput, skip?: number, take?: number): Promise<SpotQuote[]> {
    return this.prisma.spotQuote.findMany({ where, skip, take });
  }

  async update(id: bigint, data: Prisma.SpotQuoteUpdateInput): Promise<SpotQuote> {
    return this.prisma.spotQuote.update({ where: { id }, data });
  }

  async delete(id: bigint): Promise<SpotQuote> {
    return this.prisma.spotQuote.delete({ where: { id } });
  }

  async count(where?: Prisma.SpotQuoteWhereInput): Promise<number> {
    return this.prisma.spotQuote.count({ where });
  }

  async findBySymbol(symbol: string): Promise<SpotQuote[]> {
    return this.prisma.spotQuote.findMany({
      where: { symbol },
      orderBy: { priceDate: 'desc' }
    });
  }

  async findLatestBySymbol(symbol: string): Promise<SpotQuote | null> {
    return this.prisma.spotQuote.findFirst({
      where: { symbol },
      orderBy: { priceDate: 'desc' }
    });
  }

  async findByDate(symbol: string, date: Date): Promise<SpotQuote | null> {
    return this.prisma.spotQuote.findFirst({
      where: {
        symbol,
        priceDate: date
      }
    });
  }

  async findByDateRange(symbol: string, fromDate: Date, toDate: Date): Promise<SpotQuote[]> {
    return this.prisma.spotQuote.findMany({
      where: {
        symbol,
        priceDate: {
          gte: fromDate,
          lte: toDate
        }
      },
      orderBy: { priceDate: 'asc' }
    });
  }
}