import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '@app/database';
import { ShareClass, HrpTradingAccountType, Prisma } from '@prisma/client';
import { HRPClientFactory } from '@s16z/hrp-client';
import { HRPAccount } from '../types/hrp.types';

/**
 * Account information interface for processed accounts
 */
export interface AccountInfo {
  hrpAccount: {
    account: string;
    venue: string;
  };
  type: 'TRADING' | 'BASIC' | 'TRIPARTY';
  id: bigint;
  accountType?: HrpTradingAccountType; // Only for TRADING accounts
}

/**
 * HRP Account Processor Service
 *
 * Handles processing and classification of HRP account data according to business requirements.
 * Classifies accounts into Trading, Basic, or Triparty accounts and saves them to appropriate database tables.
 */
@Injectable()
export class HRPAccountProcessorService {
  private readonly logger = new Logger(HRPAccountProcessorService.name);

  constructor(
    private readonly hrpClientFactory: HRPClientFactory,
    private readonly databaseService: DatabaseService,
  ) {}

  /**
   * Process HRP accounts for a specific ShareClass
   * @param shareClass ShareClass to process accounts for
   * @param tx Optional transaction client
   * @returns Array of processed account information
   */
  async processAccountsForShareClass(
    shareClass: ShareClass,
    tx?: Prisma.TransactionClient
  ): Promise<AccountInfo[]> {
    this.logger.log(`Processing HRP accounts for shareClass: ${shareClass.name}`);

    try {
      // Get HRP client for this ShareClass
      const hrpClient = await this.getHrpClientForShareClass(shareClass);

      // Fetch accounts from HRP API using the shareclass credentials
      const accounts = await hrpClient.listAccounts();

      if (!accounts || accounts.length === 0) {
        this.logger.warn(`No accounts found from HRP for shareClass: ${shareClass.name}`);
        return [];
      }

      this.logger.log(`Fetched ${accounts.length} accounts from HRP for shareClass: ${shareClass.name}`);

      // Process each account and collect saved account info
      const savedAccounts: AccountInfo[] = [];
      for (const account of accounts) {
        const savedAccountInfo = await this.processAndClassifyAccount(account, shareClass, tx);
        if (savedAccountInfo) {
          savedAccounts.push(savedAccountInfo);
        }
      }

      this.logger.log(`Successfully processed ${savedAccounts.length}/${accounts.length} accounts for shareClass: ${shareClass.name}`);
      return savedAccounts;
    } catch (error) {
      this.logger.error(`Failed to process HRP accounts for shareClass: ${shareClass.name}`, error);
      throw error;
    }
  }

  /**
   * Process multiple ShareClasses with transaction support
   * Each ShareClass is processed within its own transaction
   * @param shareClasses Array of ShareClasses to process
   * @returns Map of shareClass name to processed accounts
   */
  async processMultipleShareClasses(shareClasses: ShareClass[]): Promise<Map<string, AccountInfo[]>> {
    const results = new Map<string, AccountInfo[]>();

    for (const shareClass of shareClasses) {
      try {
        // Process each ShareClass within its own transaction
        const accounts = await this.databaseService.$transaction(async (tx) => {
          this.logger.log(`Starting transaction for ShareClass: ${shareClass.name}`);
          const processedAccounts = await this.processAccountsForShareClass(shareClass, tx);
          this.logger.log(`Transaction completed successfully for ShareClass: ${shareClass.name}`);
          return processedAccounts;
        });

        results.set(shareClass.name, accounts);
      } catch (error) {
        this.logger.error(`Transaction failed for shareClass: ${shareClass.name}`, {
          error: error.message,
          stack: error.stack,
          shareClassName: shareClass.name,
          shareClassId: shareClass.id
        });
        results.set(shareClass.name, []);
      }
    }

    return results;
  }

  /**
   * Classify and process a single HRP account
   * @param account HRP account data
   * @param shareClass ShareClass identifier
   * @param tx Optional transaction client
   */
  private async processAndClassifyAccount(
    account: HRPAccount,
    shareClass: ShareClass,
    tx?: Prisma.TransactionClient
  ): Promise<AccountInfo | null> {
    const { venue, account: originalAccountName } = account;

    this.logger.debug(`Processing account: ${originalAccountName} from venue: ${venue}`);

    // Validate account string format
    if (!this.validateAccountFormat(originalAccountName)) {
      this.logger.error(`Invalid account format: ${originalAccountName}`, { venue, shareClass: shareClass.name });
      return null;
    }

    // Classify the account based on business rules
    const accountType = this.classifyAccount(originalAccountName, venue);

    this.logger.debug(`Account classified as: ${accountType}`, {
      originalAccountName,
      venue,
      shareClass: shareClass.name,
    });

    try {
      let databaseAccount;
      switch (accountType) {
        case 'trading':
          databaseAccount = await this.saveTradingAccount(originalAccountName, venue, shareClass, tx);
          break;
        case 'basic':
          databaseAccount = await this.saveBasicAccount(originalAccountName, shareClass, tx);
          break;
        case 'triparty':
          databaseAccount = await this.saveTripartyAccount(originalAccountName, venue, shareClass, tx);
          break;
        default:
          this.logger.warn(`Unknown account type for account: ${originalAccountName}`, {
            venue,
            accountType,
            shareClass: shareClass.name,
          });
          return null;
      }

      if (!databaseAccount) {
        return null;
      }

      const accountInfo: AccountInfo = {
        hrpAccount: {
          account: originalAccountName,
          venue,
        },
        type: accountType === 'trading' ? 'TRADING' : accountType === 'basic' ? 'BASIC' : 'TRIPARTY',
        id: databaseAccount.id,
      };

      // For TRADING accounts, include the HRP account type (FUNDING or OTHER)
      if (accountType === 'trading') {
        const tradingAccountType = this.determineAccountType(originalAccountName);
        accountInfo.accountType = tradingAccountType;
      }

      return accountInfo;
    } catch (error) {
      this.logger.error(`Failed to save ${accountType} account: ${originalAccountName}`, {
        error: error.message,
        venue,
        shareClass: shareClass.name,
      });
      return null;
    }
  }

  /**
   * Classify account based on business rules
   * @param accountString Full account string
   * @param venue Venue name
   * @returns Account classification type
   */
  private classifyAccount(accountString: string, venue: string): 'trading' | 'basic' | 'triparty' {
    this.logger.debug(`Classifying account: "${accountString}" from venue: "${venue}"`);

    // Trading account pattern: hrp followed by consecutive digits
    const hrpId = this.getHrpId(accountString);

    if (hrpId) {
      this.logger.debug(`Found HRP ID "${hrpId}" -> Trading account`);
      return 'trading';
    } else if (venue.toLowerCase() === 'zodia') {
      this.logger.debug(`Venue is Zodia -> Triparty account`);
      return 'triparty';
    } else {
      this.logger.debug(`No HRP ID found and venue is not Zodia -> Basic account`);
      return 'basic';
    }
  }

  private getHrpId(hrpAccountString: string): string | undefined {
    // Match hrp followed by digits, case insensitive, and allow @ symbol after digits
    const match = hrpAccountString.match(/\bhrp\d+/i);

    this.logger.debug(`HRP ID extraction: "${hrpAccountString}" -> "${match?.[0] || 'none'}"`);

    return match?.[0];
  }

  /**
   * Determine HRP trading account type based on account name
   * @param accountName Account name to analyze
   * @returns FUNDING if name contains "FUNDING" (case-insensitive), otherwise OTHER
   */
  private determineAccountType(accountName: string): HrpTradingAccountType {
    const isFunding = accountName.toUpperCase().includes('FUNDING');

    this.logger.debug(`Account type determination: "${accountName}" -> ${isFunding ? 'FUNDING' : 'OTHER'}`);

    return isFunding ? HrpTradingAccountType.FUNDING : HrpTradingAccountType.OTHER;
  }

  /**
   * Save trading account to database
   * @param accountName Account name (before colon)
   * @param venue Venue name
   * @param shareClass ShareClass identifier
   * @param tx Optional transaction client
   */
  private async saveTradingAccount(
    accountName: string,
    venue: string,
    shareClass: ShareClass,
    tx?: Prisma.TransactionClient
  ): Promise<{ id: bigint } | null> {
    try {
      const db = tx || this.databaseService;

      // Find counterparty by venue name (case-insensitive)
      const counterparty = await db.counterparty.findFirst({
        where: {
          name: {
            equals: venue.toUpperCase(),
            mode: 'insensitive',
          },
        },
      });

      if (!counterparty) {
        this.logger.warn(`Counterparty not found for venue: ${venue}`);
        return null;
      }

      // Check if HRP trading account already exists
      const existingAccount = await db.hrpTradingAccount.findFirst({
        where: { name: accountName },
      });

      // Determine account type based on name
      const accountType = this.determineAccountType(accountName);

      let account;
      if (existingAccount) {
        // Update existing account
        account = await db.hrpTradingAccount.update({
          where: { id: existingAccount.id },
          data: {
            type: accountType,
            venueId: counterparty.id,
            shareClassId: shareClass.id,
          },
        });
      } else {
        // Create new account
        account = await db.hrpTradingAccount.create({
          data: {
            name: accountName,
            type: accountType,
            venueId: counterparty.id,
            shareClassId: shareClass.id,
          },
        });
      }

      this.logger.log(`HRP Trading account saved: ${accountName} (type: ${accountType}, venue: ${venue}, shareClass: ${shareClass.name})`);

      return {
        id: account.id,
      };
    } catch (error) {
      this.logger.error(`Failed to save trading account: ${accountName}`, { error: error.message, venue, shareClass: shareClass.name });
      throw error;
    }
  }

  /**
   * Save basic account to database
   * @param accountName Account name (before colon)
   * @param shareClass ShareClass identifier
   * @param tx Optional transaction client
   */
  private async saveBasicAccount(
    accountName: string,
    shareClass: ShareClass,
    tx?: Prisma.TransactionClient
  ): Promise<{ id: bigint } | null> {
    try {
      const db = tx || this.databaseService;

      // Check if HRP basic account already exists
      const existingAccount = await db.hrpBasicAccount.findFirst({
        where: { name: accountName },
      });

      let account;
      if (existingAccount) {
        // Update existing account
        account = await db.hrpBasicAccount.update({
          where: { id: existingAccount.id },
          data: {
            updatedAt: new Date(),
          },
        });
      } else {
        // Create new account
        account = await db.hrpBasicAccount.create({
          data: {
            name: accountName,
            denomination: shareClass.denomCcy,
            shareClassId: shareClass.id,
          },
        });
      }

      this.logger.log(`HRP Basic account saved: ${accountName} (shareClass: ${shareClass.name})`);

      return {
        id: account.id,
      };
    } catch (error) {
      this.logger.error(`Failed to save basic account: ${accountName}`, { error: error.message, shareClass: shareClass.name });
      throw error;
    }
  }

  /**
   * Save triparty account to database
   * @param accountString Full account string
   * @param venue Venue name
   * @param shareClass ShareClass identifier
   * @param tx Optional transaction client
   */
  private async saveTripartyAccount(
    accountString: string,
    venue: string,
    shareClass: ShareClass,
    tx?: Prisma.TransactionClient
  ): Promise<{ id: bigint } | null> {
    try {
      const db = tx || this.databaseService;

      // Find counterparty for ZODIA venue
      const counterparty = await db.counterparty.findFirst({
        where: { name: { equals: 'ZODIA', mode: 'insensitive' } },
      });

      if (!counterparty) {
        this.logger.warn(`ZODIA counterparty not found for triparty account: ${accountString}`);
        return null;
      }

      // Check if triparty account already exists
      const existingAccount = await db.tripartyAccount.findFirst({
        where: { name: accountString },
      });

      let account;
      if (existingAccount) {
        // Update existing account
        account = await db.tripartyAccount.update({
          where: { id: existingAccount.id },
          data: {
            venueId: counterparty.id,
            updatedAt: new Date(),
          },
        });
      } else {
        // Create new account
        account = await db.tripartyAccount.create({
          data: {
            name: accountString,
            denomination: shareClass.denomCcy,
            ownerId: shareClass.id,
            secondOwnerId: null,
            venueId: counterparty.id,
          },
        });
      }

      this.logger.log(`Triparty account saved: ${accountString} (venue: ${venue}, shareClass: ${shareClass.name})`);

      return {
        id: account.id,
      };
    } catch (error) {
      this.logger.error(`Failed to save triparty account: ${accountString}`, { error: error.message, venue, shareClass: shareClass.name });
      throw error;
    }
  }

  /**
   * Get HRP client for specific ShareClass using credentials from database
   * @param shareClass ShareClass with API credentials
   * @returns Promise<HRP client instance>
   */
  private async getHrpClientForShareClass(shareClass: ShareClass) {
    if (!shareClass.apiKeys) {
      throw new Error(`ShareClass ${shareClass.name} does not have API keys configured`);
    }

    const apiKeys = shareClass.apiKeys as any;
    const { clientId, clientSecret, audience } = apiKeys;

    if (!clientId || !clientSecret) {
      throw new Error(`ShareClass ${shareClass.name} does not have valid HRP credentials`);
    }

    const credentials = {
      shareClassName: shareClass.name,
      clientId,
      clientSecret,
      audience: audience || 'https://api.hiddenroad.com/v0/',
    };

    this.logger.debug(`Getting HRP client for ShareClass: ${shareClass.name}`);

    // Use the factory to get a client for this ShareClass
    return await this.hrpClientFactory.getClient(credentials);
  }

  /**
   * Validate account string format
   * @param accountString Account string to validate
   * @returns True if valid format
   */
  private validateAccountFormat(accountString: string): boolean {
    // Basic validation: should contain at least one character before colon
    return accountString.includes(':') && accountString.split(':')[0].length > 0;
  }
}