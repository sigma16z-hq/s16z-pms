import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database.service';
import { DatabaseSeedService } from './database.seed';

/**
 * Startup Seed Service
 * Automatically seeds database on application startup in development
 */
@Injectable()
export class StartupSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(StartupSeedService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly databaseService: DatabaseService,
    private readonly seedService: DatabaseSeedService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const nodeEnv = this.configService.get('NODE_ENV', 'development');
    const autoSeed = this.configService.get('AUTO_SEED', 'true') === 'true';

    // Only auto-seed in development environment
    if (nodeEnv === 'development' && autoSeed) {
      this.logger.log('🌱 Auto-seeding database on startup (development mode)');

      try {
        await this.checkAndSeed();
      } catch (error) {
        this.logger.warn('❌ Auto-seed failed on startup:', error.message);
        // Don't fail the application startup if seed fails
      }
    }
  }

  private async checkAndSeed(): Promise<void> {
    try {
      // Check if basic seed data exists
      const departmentCount = await this.databaseService.department.count();
      const shareClassCount = await this.databaseService.shareClass.count();

      if (departmentCount === 0 || shareClassCount === 0) {
        this.logger.log('🔍 Missing seed data, running seed...');
        await this.seedService.seedDatabase(this.databaseService);
      } else {
        this.logger.log('✅ Seed data already exists, skipping auto-seed');
      }
    } catch (error) {
      this.logger.error('Failed to check/seed database:', error);
      throw error;
    }
  }
}