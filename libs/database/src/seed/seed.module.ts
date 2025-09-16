import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database.module';
import { DatabaseSeedService } from './database.seed';
import { SeedCommand } from './seed.command';

/**
 * Database Seed Module
 * Provides seeding functionality for the database
 */
@Module({
  imports: [DatabaseModule],
  providers: [
    DatabaseSeedService,
    SeedCommand,
  ],
  exports: [DatabaseSeedService],
})
export class SeedModule {}