import { PrismaClient } from '@prisma/client';

/**
 * Seed the database with initial data
 * @param prisma - Prisma client instance
 */
export async function seedDatabase(prisma: PrismaClient): Promise<void> {
  console.log('🌱 Starting database seed...');

  try {
    // Create departments
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

      console.log(`✅ Department "${department.name}" seeded (ID: ${department.id})`);
    }

    // Create counterparties for HRP account integration
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

      console.log(`✅ Counterparty "${counterparty.name}" seeded (ID: ${counterparty.id})`);
    }

    // Create the 3 hardcoded ShareClass records
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

      console.log(`✅ ShareClass "${shareClass.name}" seeded (ID: ${shareClass.id})`);
    }

    console.log('🎉 Database seed completed successfully!');
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  }
}

/**
 * Main seed function for direct execution
 */
export async function runSeed(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    await seedDatabase(prisma);
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Allow direct execution: tsx src/seed.ts
if (require.main === module) {
  runSeed();
}
