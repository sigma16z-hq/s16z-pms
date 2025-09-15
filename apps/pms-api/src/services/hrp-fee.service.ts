import { Injectable, Inject } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { HRPClientFactory, ShareClassHRPCredentials } from '@s16z/hrp-client';

// Interfaces for ShareClass and API keys structure
interface ShareClassApiKeys {
  clientId: string;
  clientSecret: string;
  audience?: string;
}

interface ShareClass {
  id: number;
  name: string;
  apiKeys: ShareClassApiKeys | null;
}

interface FeeProcessingResult {
  shareClassId: number;
  shareClassName: string;
  processed: number;
  skipped: number;
  errors: number;
}

/**
 * Service demonstrating how to use HRPClientFactory for multiple ShareClasses
 * This replicates the pattern from the old HRPFeeSchedulerService
 */
@Injectable()
export class HRPFeeService {
  private readonly logger = new Logger(HRPFeeService.name);

  constructor(
    private readonly hrpClientFactory: HRPClientFactory,
    // You would inject your database repository here
    // @Inject('ShareClassRepository') private readonly shareClassRepository: ShareClassRepository,
  ) {}

  /**
   * Process CIP fees for all ShareClasses
   */
  async processAllShareClassFees(): Promise<FeeProcessingResult[]> {
    this.logger.log('Starting CIP fee processing for all ShareClasses');

    const results: FeeProcessingResult[] = [];

    // Get all ShareClasses with HRP API keys
    const shareClasses = await this.getAllActiveShareClasses();
    this.logger.log(`Found ${shareClasses.length} ShareClasses with HRP credentials`);

    for (const shareClass of shareClasses) {
      try {
        const result = await this.processShareClassFees(shareClass);
        results.push(result);
      } catch (error) {
        this.logger.error(`Failed to process fees for ShareClass ${shareClass.name}:`, error);
        results.push({
          shareClassId: shareClass.id,
          shareClassName: shareClass.name,
          processed: 0,
          skipped: 0,
          errors: 1,
        });
      }
    }

    return results;
  }

  /**
   * Process fees for a specific ShareClass
   */
  async processShareClassFees(shareClass: ShareClass): Promise<FeeProcessingResult> {
    this.logger.log(`Processing CIP fees for ShareClass: ${shareClass.name}`);

    // Create HRP client for this specific ShareClass
    const hrpClient = await this.createHrpClientForShareClass(shareClass);

    let processed = 0;
    let skipped = 0;
    let errors = 0;

    try {
      // Example: Fetch CIP calculations for the last 7 days
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);

      this.logger.debug(`Fetching CIP calculations for ${shareClass.name}`, {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });

      // Use the ShareClass-specific HRP client to list accounts
      // This demonstrates the factory pattern - each ShareClass gets its own client instance
      const accounts = await hrpClient.getBaseClient().listAccounts();

      this.logger.log(`Found ${accounts.length} accounts for ${shareClass.name}`);

      // Process CIP calculations for each account
      for (const account of accounts) {
        try {
          this.logger.debug(`Processing CIP calculations for account: ${account.account} at venue: ${account.venue}`);

          // Fetch CIP calculations for this specific account
          const cipCalculations = await hrpClient.getBaseClient().fetchAllCIPCalculations({
            venue: account.venue,
            account: account.account,
            startEventTimestampInclusive: startDate.toISOString(),
            endEventTimestampExclusive: endDate.toISOString(),
            pageSize: 100,
            maxPages: 100,
          });

          this.logger.debug(`Found ${cipCalculations.length} CIP calculations for account ${account.account}`);

          // Process each CIP calculation
          for (const cipCalculation of cipCalculations) {
            try {
              // Here you would save the CIP calculation data to your database
              // Example of what you might do:
              // await this.saveCIPCalculation(shareClass.id, cipCalculation);

              this.logger.debug(`Processed CIP calculation for trade ${cipCalculation.trade_id}: ${cipCalculation.cip_cost} ${cipCalculation.cip_cost_asset_symbol}`);
              processed++;
            } catch (calcError) {
              this.logger.warn(`Failed to process CIP calculation for trade ${cipCalculation.trade_id}:`, calcError);
              errors++;
            }
          }

          // If no CIP calculations found, still count as processed
          if (cipCalculations.length === 0) {
            processed++;
          }

        } catch (error) {
          this.logger.warn(`Failed to process account ${account.account}:`, error);
          errors++;
        }
      }

    } catch (error) {
      this.logger.error(`Failed to fetch CIP calculations for ${shareClass.name}:`, error);
      errors++;
    }

    return {
      shareClassId: shareClass.id,
      shareClassName: shareClass.name,
      processed,
      skipped,
      errors,
    };
  }

  /**
   * Create HRP client for a specific ShareClass using the factory
   */
  private async createHrpClientForShareClass(shareClass: ShareClass) {
    if (!shareClass.apiKeys) {
      throw new Error(`ShareClass ${shareClass.name} does not have API keys configured`);
    }

    const { clientId, clientSecret, audience } = shareClass.apiKeys;

    if (!clientId || !clientSecret) {
      throw new Error(`ShareClass ${shareClass.name} does not have valid HRP credentials`);
    }

    const credentials: ShareClassHRPCredentials = {
      shareClassName: shareClass.name,
      clientId,
      clientSecret,
      audience,
    };

    // Use the factory to get a client for this ShareClass
    return await this.hrpClientFactory.getClient(credentials);
  }

  /**
   * Get all ShareClasses that have HRP API keys configured
   * In a real implementation, this would query your database
   */
  private async getAllActiveShareClasses(): Promise<ShareClass[]> {
    // This is a mock implementation
    // In reality, you would query your database:
    // return await this.shareClassRepository.findMany({
    //   where: { apiKeys: { not: null } }
    // });

    return [
      {
        id: 1,
        name: 'ShareClass-A',
        apiKeys: {
          clientId: 'client_id_for_shareclass_a',
          clientSecret: 'client_secret_for_shareclass_a',
          audience: 'https://api.hiddenroad.com/v0/',
        },
      },
      {
        id: 2,
        name: 'ShareClass-B',
        apiKeys: {
          clientId: 'client_id_for_shareclass_b',
          clientSecret: 'client_secret_for_shareclass_b',
          audience: 'https://api.hiddenroad.com/v0/',
        },
      },
    ];
  }

  /**
   * Clear cached HRP client for a ShareClass (useful when credentials change)
   */
  async clearClientCache(shareClassName: string): Promise<void> {
    // You would need to get the credentials to clear the right cache entry
    const shareClass = await this.getAllActiveShareClasses().then(
      classes => classes.find(sc => sc.name === shareClassName)
    );

    if (shareClass?.apiKeys) {
      const credentials: ShareClassHRPCredentials = {
        shareClassName: shareClass.name,
        clientId: shareClass.apiKeys.clientId,
        clientSecret: shareClass.apiKeys.clientSecret,
        audience: shareClass.apiKeys.audience,
      };

      this.hrpClientFactory.clearClient(credentials);
      this.logger.log(`Cleared HRP client cache for ShareClass: ${shareClassName}`);
    }
  }
}