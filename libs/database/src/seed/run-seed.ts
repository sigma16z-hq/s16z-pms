#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import { DatabaseSeedService } from './database.seed';

/**
 * Standalone seed script for direct execution
 * Usage: tsx libs/database/src/seed/run-seed.ts
 * Or: pnpm run seed:direct
 */
async function runSeed(): Promise<void> {
  const prisma = new PrismaClient();
  const seedService = new DatabaseSeedService();

  try {
    await seedService.seedDatabase(prisma);
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Allow direct execution
if (require.main === module) {
  runSeed();
}