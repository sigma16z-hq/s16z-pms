import { OneTokenClient } from '../clients/1token';
import { createLogger, GlobalConfig } from '@acpms/common';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const logger = createLogger('1TokenAPITest');

async function testListExchangeAccounts() {
  logger.info('Starting 1Token API test...');

  // Get credentials from environment variables
  // Support both naming conventions
  const apiKey = process.env.ONETOKEN_API_KEY || process.env.TOKEN_CAM_API_KEY;
  const apiSecret = process.env.ONETOKEN_API_SECRET || process.env.TOKEN_CAM_API_SECRET;
  const baseUrl = process.env.ONETOKEN_BASE_URL || 'https://annamite.1token.tech/api/v1';

  if (!apiKey || !apiSecret) {
    logger.error('Missing API credentials. Please set ONETOKEN_API_KEY and ONETOKEN_API_SECRET environment variables.');
    process.exit(1);
  }

  // Optional proxy configuration
  const proxyConfig = process.env.SOCKS5_PROXY_HOST
    ? {
        host: process.env.SOCKS5_PROXY_HOST || 'localhost',
        port: parseInt(process.env.SOCKS5_PROXY_PORT || '1080'),
        userId: process.env.SOCKS5_PROXY_USER,
        password: process.env.SOCKS5_PROXY_PASS,
      }
    : undefined;

  try {
    // Initialize global config (for Redis etc.)
    const globalConfig = GlobalConfig.createFromEnv();

    // Initialize client
    const client = new OneTokenClient(
      {
        apiKey,
        apiSecret,
        baseUrl,
        proxy: proxyConfig,
      },
      globalConfig
    );

    // Skip deprecated endpoint test - it's working
    // logger.info('Testing deprecated list-all-accounts endpoint...');
    // try {
    //   const deprecatedResult = await client.listAllAccountsDeprecated();
    //   logger.info('Deprecated endpoint worked!');
    //   console.log('Deprecated result:', JSON.stringify(deprecatedResult, null, 2));
    // } catch (error) {
    //   logger.error('Deprecated endpoint failed:', error);
    // }

    logger.info('Fetching exchange accounts with new endpoint...');

    // Call listExchangeAccounts
    const result = await client.listExchangeAccounts({ pageSize: 100, pageIndex: 1 });

    logger.info('Exchange accounts fetched successfully:');

    // Check if the response has the expected structure
    // The API returns code: '' (empty string) when successful
    if (result && result.message === 'success') {
      logger.info(`Response code: '${result.code}' (empty = success)`);
      logger.info(`Response message: ${result.message}`);
      logger.info(`Total accounts: ${result.result.total}`);

      // Log the full response for inspection
      console.log('Full response:', JSON.stringify(result, null, 2));

      // If there are accounts, log some details
      if (result.result.accounts && result.result.accounts.length > 0) {
        logger.info(`Found ${result.result.accounts.length} accounts`);
        logger.info('First account details:');
        const firstAccount = result.result.accounts[0];
        if (firstAccount) {
          console.log(
            JSON.stringify(
              {
                name: firstAccount.name,
                alias: firstAccount.alias,
                status: firstAccount.status,
                venue: firstAccount.venue,
                fund_name: firstAccount.fund_name,
                balance_usd: firstAccount.balance_usd,
              },
              null,
              2
            )
          );
        }
      }
    } else {
      logger.error('Unexpected response structure:', result);
    }

    // Test Redis logging functionality
    logger.info('Testing Redis API logging...');
    try {
      // Wait a moment for logs to be written
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Get recent API logs
      const apiLogs = await client.getOneTokenApiLogs(Date.now() - 60000); // Last minute
      logger.info(`Found ${apiLogs.length} API logs in Redis`);

      if (apiLogs.length > 0) {
        const latestLog = apiLogs[0];
        logger.info('Latest API log entry:');
        console.log(
          JSON.stringify(
            {
              id: latestLog.id,
              request: {
                method: latestLog.request.method,
                url: latestLog.request.url,
                timestamp: new Date(latestLog.request.timestamp).toISOString(),
              },
              response: latestLog.response
                ? {
                    status: latestLog.response.status,
                    duration: `${latestLog.response.duration}ms`,
                    timestamp: new Date(latestLog.response.timestamp).toISOString(),
                  }
                : 'No response logged yet',
            },
            null,
            2
          )
        );
      }
    } catch (redisError) {
      logger.warn('Redis logging test failed (this is OK if Redis is not running):', redisError);
    }

    // Clean up Redis connection
    try {
      await client.disconnect();
      logger.info('Redis connection closed');
    } catch (disconnectError) {
      logger.warn('Error disconnecting from Redis:', disconnectError);
    }
  } catch (error) {
    logger.error('Error fetching exchange accounts:', error);
    if (error instanceof Error) {
      logger.error('Error message:', error.message);
      logger.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Run the test
testListExchangeAccounts()
  .then(() => {
    logger.info('Test completed successfully');
    process.exit(0);
  })
  .catch(error => {
    logger.error('Test failed:', error);
    process.exit(1);
  });
