import { HRPClient, HRPCredentials, createHRPConfig } from '../clients/hrp';
import { GlobalConfig } from '@acpms/common';

/**
 * Test script for HRP API client
 *
 * This script demonstrates how to use the HRP client to:
 * - Authenticate with HRP API using dynamic credentials
 * - List accounts
 * - Fetch trades with pagination
 * - Fetch deposits and withdrawals
 */

async function testHRPClient() {
  console.log('🚀 Starting HRP API client test...\n');

  // Create global config (you would normally load from environment)
  const globalConfig = GlobalConfig.createFromEnv();

  // Create test credentials (normally loaded from database or JSON file)
  const testCredentials: HRPCredentials = {
    clientId: process.env.HRP_CLIENT_ID || 'test_client_id',
    clientSecret: process.env.HRP_CLIENT_SECRET || 'test_client_secret',
    shareClass: 'TestShareClass',
  };

  if (!testCredentials.clientId || !testCredentials.clientSecret) {
    console.log(
      '⚠️  Warning: Using placeholder credentials. Set HRP_CLIENT_ID and HRP_CLIENT_SECRET environment variables for real testing.'
    );
  }

  // Create HRP client configuration using factory function
  const hrpConfig = createHRPConfig(testCredentials, globalConfig);

  // Initialize HRP client
  const hrpClient = new HRPClient(hrpConfig, globalConfig);

  try {
    // Test 1: Authentication (implicit - happens automatically on first API call)
    console.log('1️⃣ Testing authentication...');
    const tokenInfo = hrpClient.getAuthClient().getTokenInfo();
    console.log('Current token info:', tokenInfo || 'No token yet');
    console.log('✅ Authentication setup complete\n');

    // Test 2: List accounts
    console.log('2️⃣ Testing list accounts...');
    const accounts = await hrpClient.listAccounts();
    console.log(`Found ${accounts.length} accounts:`);
    accounts.forEach((account, index) => {
      console.log(`  ${index + 1}. Venue: ${account.venue}, Account: ${account.account}`);
    });
    console.log('✅ List accounts complete\n');

    // Test 3: Fetch trades (single page)
    console.log('3️⃣ Testing fetch trades (single page)...');
    const tradesPage = await hrpClient.fetchTradesPage({
      pageSize: 5, // Small page size for testing
    });
    console.log(`Found ${tradesPage.results.length} trades in first page`);
    console.log('Next page available:', !!tradesPage.next_page);
    if (tradesPage.results.length > 0) {
      console.log('Sample trade:', JSON.stringify(tradesPage.results[0], null, 2));
    }
    console.log('✅ Fetch trades page complete\n');

    // Test 4: Fetch all trades (limited for testing)
    console.log('4️⃣ Testing fetch all trades (limited)...');
    const allTrades = await hrpClient.fetchAllTrades({
      pageSize: 3,
      maxPages: 2, // Limit to 2 pages for testing
    });
    console.log(`Total trades fetched: ${allTrades.length}`);
    console.log('✅ Fetch all trades complete\n');

    // Test 5: Fetch deposits (single page)
    console.log('5️⃣ Testing fetch deposits (single page)...');
    const depositsPage = await hrpClient.fetchDepositsPage({
      pageSize: 5,
    });
    console.log(`Found ${depositsPage.results.length} deposits in first page`);
    console.log('Next page available:', !!depositsPage.next_page);
    console.log('✅ Fetch deposits page complete\n');

    // Test 6: Fetch withdrawals (single page)
    console.log('6️⃣ Testing fetch withdrawals (single page)...');
    const withdrawalsPage = await hrpClient.fetchWithdrawalsPage({
      pageSize: 5,
    });
    console.log(`Found ${withdrawalsPage.results.length} withdrawals in first page`);
    console.log('Next page available:', !!withdrawalsPage.next_page);
    console.log('✅ Fetch withdrawals page complete\n');

    // Test 7: Fetch CIP calculations (single page)
    console.log('7️⃣ Testing fetch CIP calculations (single page)...');
    const cipCalculationsPage = await hrpClient.fetchCIPCalculationsPage({
      pageSize: 5,
    });
    console.log(`Found ${cipCalculationsPage.results.length} CIP calculations in first page`);
    console.log('Next page available:', !!cipCalculationsPage.next_page);
    console.log('✅ Fetch CIP calculations page complete\n');

    // Test 8: Fetch ERS calculations (single page)
    console.log('8️⃣ Testing fetch ERS calculations (single page)...');
    const ersCalculationsPage = await hrpClient.fetchERSCalculationsPage({
      pageSize: 5,
    });
    console.log(`Found ${ersCalculationsPage.results.length} ERS calculations in first page`);
    console.log('Next page available:', !!ersCalculationsPage.next_page);
    console.log('✅ Fetch ERS calculations page complete\n');

    // Test 9: Fetch financing calculations (single page)
    console.log('9️⃣ Testing fetch financing calculations (single page)...');
    const financingCalculationsPage = await hrpClient.fetchFinancingCalculationsPage({
      pageSize: 5,
    });
    console.log(`Found ${financingCalculationsPage.results.length} financing calculations in first page`);
    console.log('Next page available:', !!financingCalculationsPage.next_page);
    console.log('✅ Fetch financing calculations page complete\n');

    // Test 10: Fetch execution premium calculations (single page)
    console.log('🔟 Testing fetch execution premium calculations (single page)...');
    const executionPremiumCalculationsPage = await hrpClient.fetchExecutionPremiumCalculationsPage({
      pageSize: 5,
    });
    console.log(
      `Found ${executionPremiumCalculationsPage.results.length} execution premium calculations in first page`
    );
    console.log('Next page available:', !!executionPremiumCalculationsPage.next_page);
    console.log('✅ Fetch execution premium calculations page complete\n');

    // Test 11: Check final token info
    console.log('1️⃣1️⃣ Final token info check...');
    const finalTokenInfo = hrpClient.getAuthClient().getTokenInfo();
    console.log('Final token info:', finalTokenInfo);
    console.log('✅ Token info check complete\n');

    console.log('🎉 All HRP API tests completed successfully!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testHRPClient().catch(console.error);
}

export { testHRPClient };
