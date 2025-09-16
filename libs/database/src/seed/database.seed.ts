import { PrismaClient } from '@prisma/client';
import { Injectable, Logger } from '@nestjs/common';

/**
 * Database seeding service for NestJS
 * Migrated from annamite-pms/packages/db/src/seed.ts
 */
@Injectable()
export class DatabaseSeedService {
  private readonly logger = new Logger(DatabaseSeedService.name);

  /**
   * Seed the database with initial data
   * @param prisma - Prisma client instance
   */
  async seedDatabase(prisma: PrismaClient): Promise<void> {
    this.logger.log('🌱 Starting database seed...');

    try {
      await this.seedDepartments(prisma);
      await this.seedCounterparties(prisma);
      await this.seedShareClasses(prisma);

      this.logger.log('🎉 Database seed completed successfully!');
    } catch (error) {
      this.logger.error('❌ Error seeding database:', error);
      throw error;
    }
  }

  /**
   * Seed departments with 1Token integration
   */
  private async seedDepartments(prisma: PrismaClient): Promise<void> {
    const departments = [
      {
        name: 'TG',
        description: 'TG department',
        oneTokenDepartmentId: 'annamite/default',
      },
      {
        name: 'SPC',
        description: 'SPC department',
        oneTokenDepartmentId: 'annamite/qywubx',
      },
    ];

    for (const deptData of departments) {
      const department = await prisma.department.upsert({
        where: { name: deptData.name },
        update: {
          description: deptData.description,
          oneTokenDepartmentId: deptData.oneTokenDepartmentId,
        },
        create: deptData,
      });

      this.logger.log(`✅ Department "${department.name}" seeded (ID: ${department.id})`);
    }
  }

  /**
   * Seed counterparties for exchange/custodian integration
   */
  private async seedCounterparties(prisma: PrismaClient): Promise<void> {
    const counterparties = [
      {
        name: 'BINANCE',
        description: 'Binance exchange',
        type: 'exchange',
        alternativeNames: { label: 'binance' },
      },
      {
        name: 'BITFINEX',
        description: 'Bitfinex exchange',
        type: 'exchange',
        alternativeNames: { label: 'bitfinex' },
      },
      {
        name: 'BITGET',
        description: 'Bitget exchange',
        type: 'exchange',
        alternativeNames: { label: 'bitget' },
      },
      {
        name: 'BITMEX',
        description: 'BitMEX exchange',
        type: 'exchange',
        alternativeNames: { label: 'bitmex' },
      },
      {
        name: 'BYBIT',
        description: 'Bybit exchange',
        type: 'exchange',
        alternativeNames: { label: 'bybit' },
      },
      {
        name: 'COINBASE_INTERNATIONAL',
        description: 'Coinbase International exchange',
        type: 'exchange',
        alternativeNames: { label: 'coinbase_international' },
      },
      {
        name: 'CRYPTOCOM',
        description: 'Crypto.com exchange',
        type: 'exchange',
        alternativeNames: { label: 'cryptocom' },
      },
      {
        name: 'DERIBIT',
        description: 'Deribit exchange',
        type: 'exchange',
        alternativeNames: { label: 'deribit' },
      },
      {
        name: 'GATEIO',
        description: 'Gate.io exchange',
        type: 'exchange',
        alternativeNames: { label: 'gateio' },
      },
      {
        name: 'HRPMASTER',
        description: 'Hidden Road Partners Master',
        type: 'provider',
        alternativeNames: { label: 'hrpmaster' },
      },
      {
        name: 'KRAKEN',
        description: 'Kraken exchange',
        type: 'exchange',
        alternativeNames: { label: 'kraken' },
      },
      {
        name: 'OKEX',
        description: 'OKX exchange',
        type: 'exchange',
        alternativeNames: { label: 'okex' },
      },
      {
        name: 'ZODIA',
        description: 'Zodia custodian',
        type: 'custodian',
        alternativeNames: { label: 'zodia' },
      },
    ];

    for (const counterpartyData of counterparties) {
      const counterparty = await prisma.counterparty.upsert({
        where: { name: counterpartyData.name },
        update: {
          description: counterpartyData.description,
          type: counterpartyData.type,
          alternativeNames: counterpartyData.alternativeNames,
        },
        create: counterpartyData,
      });

      this.logger.log(`✅ Counterparty "${counterparty.name}" seeded (ID: ${counterparty.id})`);
    }
  }

  /**
   * Seed the 3 hardcoded ShareClass records with HRP credentials
   */
  private async seedShareClasses(prisma: PrismaClient): Promise<void> {
    const shareClasses = [
      {
        name: 'USDT',
        denomCcy: 'USDT',
        apiKeys: {
          hrp_account: 'ANNAUKY:HRPMASTER_UNIVERSAL_ACCOUNTS',
          clientId: process.env.HRP_USDT_CLIENT_ID,
          clientSecret: process.env.HRP_USDT_CLIENT_SECRET,
        },
      },
      {
        name: 'BTC',
        denomCcy: 'BTC',
        apiKeys: {
          hrp_account: 'ANNABKY:HRPMASTER_UNIVERSAL_ACCOUNTS',
          clientId: process.env.HRP_BTC_CLIENT_ID,
          clientSecret: process.env.HRP_BTC_CLIENT_SECRET,
        },
      },
      {
        name: 'ETH',
        denomCcy: 'ETH',
        apiKeys: {
          hrp_account: 'ANNAEKY:HRPMASTER_UNIVERSAL_ACCOUNTS',
          clientId: process.env.HRP_ETH_CLIENT_ID,
          clientSecret: process.env.HRP_ETH_CLIENT_SECRET,
        },
      },
    ];

    for (const shareClassData of shareClasses) {
      // Validate required environment variables
      if (!shareClassData.apiKeys.clientId || !shareClassData.apiKeys.clientSecret) {
        this.logger.warn(`⚠️  Missing HRP credentials for ${shareClassData.name} ShareClass - skipping`);
        continue;
      }

      const shareClass = await prisma.shareClass.upsert({
        where: { name: shareClassData.name },
        update: {
          denomCcy: shareClassData.denomCcy,
          apiKeys: shareClassData.apiKeys,
        },
        create: {
          name: shareClassData.name,
          denomCcy: shareClassData.denomCcy,
          apiKeys: shareClassData.apiKeys,
        },
      });

      this.logger.log(`✅ ShareClass "${shareClass.name}" seeded (ID: ${shareClass.id})`);
    }
  }
}