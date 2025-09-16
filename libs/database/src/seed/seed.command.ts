import { Command, CommandRunner } from 'nest-commander';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import { DatabaseSeedService } from './database.seed';

/**
 * NestJS CLI Command for database seeding
 * Usage: pnpm run seed
 */
@Injectable()
@Command({
  name: 'seed',
  description: 'Seed the database with initial data',
})
export class SeedCommand extends CommandRunner {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly seedService: DatabaseSeedService,
  ) {
    super();
  }

  async run(): Promise<void> {
    console.log('🚀 Starting database seed command...');

    try {
      await this.seedService.seedDatabase(this.databaseService);
      console.log('✅ Seed command completed successfully!');
      process.exit(0);
    } catch (error) {
      console.error('❌ Seed command failed:', error);
      process.exit(1);
    }
  }
}