import { Injectable } from '@nestjs/common';
import { SpotQuote, Prisma } from '@prisma/client';
import { DatabaseService } from '../database.service';
import { SpotQuoteRepository, DateGap } from '../interfaces';

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

  async detectGaps(symbol: string, exchange: string): Promise<DateGap[]> {
    const result = await this.prisma.$queryRaw<Array<{
      current_date: Date;
      previous_date: Date;
      gap_days: number;
    }>>`
      WITH ordered_dates AS (
        SELECT DISTINCT "price_date" as price_date
        FROM "SpotQuote"
        WHERE "symbol" = ${symbol.toLowerCase()}
          AND "exchange" = ${exchange}
        ORDER BY "price_date"
      ),
      gaps AS (
        SELECT
          price_date as current_date,
          LAG(price_date) OVER (ORDER BY price_date) as previous_date,
          EXTRACT(DAY FROM price_date - LAG(price_date) OVER (ORDER BY price_date)) as gap_days
        FROM ordered_dates
      )
      SELECT current_date, previous_date, gap_days
      FROM gaps
      WHERE gap_days > 1
      ORDER BY current_date;
    `;

    return result.map(row => {
      const gapStart = new Date(row.previous_date);
      gapStart.setDate(gapStart.getDate() + 1);

      const gapEnd = new Date(row.current_date);
      gapEnd.setDate(gapEnd.getDate() - 1);

      return {
        startDate: gapStart.toISOString().split('T')[0],
        endDate: gapEnd.toISOString().split('T')[0],
        missingDays: row.gap_days - 1
      };
    });
  }
}