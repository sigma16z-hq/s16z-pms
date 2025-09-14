# HRP API Client

This directory contains the HRP (Hidden Road Prices) API client implementation for accessing historical reference price data and account activity.

## Overview

The HRP client follows the same architectural patterns as the 1Token client and provides:

- **OAuth2 Authentication**: Automated client credentials flow with token management
- **Proxy Support**: SOCKS5 proxy support for secure connections
- **Pagination**: Automatic handling of paginated responses with `next_page` tokens
- **Error Handling**: Comprehensive error handling and logging
- **Type Safety**: Full TypeScript support with auto-generated schema types

## Architecture

### Files Structure

```
hrp/
├── README.md              # This documentation
├── index.ts              # Main exports
├── types.ts              # Type definitions and interfaces
├── auth-client.ts        # OAuth2 authentication client
├── client.ts             # Main HRP data API client
├── auth/
│   └── schema.d.ts       # Auto-generated auth API types
└── data/
    └── schema.d.ts       # Auto-generated data API types
```

### Core Components

1. **HRPAuthClient** (`auth-client.ts`)
   - Handles OAuth2 client credentials flow
   - Manages access token lifecycle and refresh
   - Provides token validation with expiry buffer

2. **HRPClient** (`client.ts`)
   - Main API client for data endpoints
   - Extends `RedisCachedClient` for logging and caching
   - Integrates authentication middleware automatically

## Usage

### Basic Setup

```typescript
import { HRPClient, HRPCredentials, createHRPConfig } from '@acpms/api-client';
import { GlobalConfig } from '@acpms/common';

// Create credentials (normally loaded from database or JSON file)
const credentials: HRPCredentials = {
  clientId: 'your_client_id',
  clientSecret: 'your_client_secret', 
  shareClass: 'ShareClassA'
};

const globalConfig = GlobalConfig.createFromEnv();

// Use factory function to create config
const hrpConfig = createHRPConfig(credentials, globalConfig);

// Initialize client
const hrpClient = new HRPClient(hrpConfig, globalConfig);
```

### Multiple ShareClass Setup

```typescript
// Load credentials for different shareclasses
const credentialsList: HRPCredentials[] = [
  {
    clientId: 'client_id_a',
    clientSecret: 'client_secret_a',
    shareClass: 'ShareClass_A'
  },
  {
    clientId: 'client_id_b', 
    clientSecret: 'client_secret_b',
    shareClass: 'ShareClass_B'
  },
  {
    clientId: 'client_id_c',
    clientSecret: 'client_secret_c', 
    shareClass: 'ShareClass_C'
  }
];

// Create multiple client instances
const hrpClients = new Map<string, HRPClient>();

for (const credentials of credentialsList) {
  const hrpConfig = createHRPConfig(credentials, globalConfig);
  const hrpClient = new HRPClient(hrpConfig, globalConfig);
  hrpClients.set(credentials.shareClass!, hrpClient);
}
```

### Environment Variables

The client can be configured via environment variables:

```bash
# Global HRP API settings
HRP_AUTH_BASE_URL=https://auth.hiddenroad.com
HRP_DATA_BASE_URL=https://api.hiddenroad.com
HRP_AUDIENCE=https://api.hiddenroad.com/v0/
HRP_USE_PROXY=true

# Proxy settings (if enabled)
SOCKS5_PROXY_HOST=proxy.example.com
SOCKS5_PROXY_PORT=1080
SOCKS5_PROXY_USERNAME=user
SOCKS5_PROXY_PASSWORD=pass

# Individual shareclass credentials (for testing or service runners)
HRP_CLIENT_ID_SHARECLASS_A=your_client_id_a
HRP_CLIENT_SECRET_SHARECLASS_A=your_client_secret_a
HRP_CLIENT_ID_SHARECLASS_B=your_client_id_b
HRP_CLIENT_SECRET_SHARECLASS_B=your_client_secret_b
HRP_CLIENT_ID_SHARECLASS_C=your_client_id_c
HRP_CLIENT_SECRET_SHARECLASS_C=your_client_secret_c

# For single-client testing
HRP_CLIENT_ID=your_test_client_id
HRP_CLIENT_SECRET=your_test_client_secret
```

### API Methods

#### List Accounts
```typescript
const accounts = await hrpClient.listAccounts();
console.log('Available accounts:', accounts);
```

#### Fetch Trades (Single Page)
```typescript
const tradesPage = await hrpClient.fetchTradesPage({
  venue: 'venue_name',
  account: 'account_name', 
  pageSize: 100,
  startEventTimestampInclusive: '2024-01-01T00:00:00Z',
  endEventTimestampExclusive: '2024-01-02T00:00:00Z'
});

console.log('Trades:', tradesPage.results);
console.log('Has more pages:', !!tradesPage.next_page);
```

#### Fetch All Trades (Auto-Pagination)
```typescript
const allTrades = await hrpClient.fetchAllTrades({
  venue: 'venue_name',
  account: 'account_name',
  startEventTimestampInclusive: '2024-01-01T00:00:00Z',
  endEventTimestampExclusive: '2024-01-02T00:00:00Z',
  pageSize: 100,
  maxPages: 50 // Safety limit
});

console.log('Total trades:', allTrades.length);
```

#### Fetch Deposits/Withdrawals
```typescript
// Single page
const depositsPage = await hrpClient.fetchDepositsPage({ pageSize: 50 });
const withdrawalsPage = await hrpClient.fetchWithdrawalsPage({ pageSize: 50 });

// All pages
const allDeposits = await hrpClient.fetchAllDeposits({ maxPages: 20 });
const allWithdrawals = await hrpClient.fetchAllWithdrawals({ maxPages: 20 });
```

#### Fetch Calculations (CIP, ERS, Financing, Execution Premium)

The HRP API provides detailed calculation data for various trading costs and metrics:

- **CIP (Customer Indemnity Payments)**: Trade-level cost calculations for customer protection
- **ERS (Execution Rate Spread)**: Rate spread calculations for execution analysis  
- **Financing**: Financing cost calculations for positions
- **Execution Premium**: Premium calculations for trade execution

```typescript
// CIP Calculations
const cipCalculationsPage = await hrpClient.fetchCIPCalculationsPage({
  venue: 'venue_name',
  account: 'account_name',
  pageSize: 100,
  startEventTimestampInclusive: '2024-01-01T00:00:00Z',
  endEventTimestampExclusive: '2024-01-02T00:00:00Z'
});

const allCIPCalculations = await hrpClient.fetchAllCIPCalculations({
  venue: 'venue_name',
  account: 'account_name',
  startEventTimestampInclusive: '2024-01-01T00:00:00Z',
  endEventTimestampExclusive: '2024-01-02T00:00:00Z',
  maxPages: 50
});

// ERS Calculations  
const ersCalculationsPage = await hrpClient.fetchERSCalculationsPage({ pageSize: 100 });
const allERSCalculations = await hrpClient.fetchAllERSCalculations({ maxPages: 50 });

// Financing Calculations
const financingCalculationsPage = await hrpClient.fetchFinancingCalculationsPage({ pageSize: 100 });
const allFinancingCalculations = await hrpClient.fetchAllFinancingCalculations({ maxPages: 50 });

// Execution Premium Calculations
const executionPremiumCalculationsPage = await hrpClient.fetchExecutionPremiumCalculationsPage({ pageSize: 100 });
const allExecutionPremiumCalculations = await hrpClient.fetchAllExecutionPremiumCalculations({ maxPages: 50 });
```

### Authentication Management

The client handles authentication automatically, but you can access auth details:

```typescript
// Get current token info (for monitoring)
const tokenInfo = hrpClient.getAuthClient().getTokenInfo();
console.log('Token expires at:', new Date(tokenInfo.expires_at * 1000));

// Force token refresh
hrpClient.getAuthClient().clearToken();
```

## Pagination

The HRP API uses cursor-based pagination with `next_page` URL paths. The client provides a clean automatic pagination implementation:

### Automatic Pagination (Recommended)
```typescript
// The client handles all pagination automatically by following next_page links
const allResults = await hrpClient.fetchAllTrades({
  maxPages: 100 // Safety limit to prevent runaway requests
});
```

### Manual Pagination
```typescript
let nextPagePath: string | null = null;
const allResults = [];

// First page
let response = await hrpClient.fetchTradesPage({
  // ... your parameters
});

allResults.push(...response.results);
nextPagePath = response.next_page;

// Continue following next_page links
while (nextPagePath !== null) {
  // The client automatically constructs full URLs from the next_page path
  response = await hrpClient.fetchTradesPageByUrl(nextPagePath);
  allResults.push(...response.results);
  nextPagePath = response.next_page;
}
```

### Pagination Implementation Details

The client implements a generic pagination handler that:

1. **Follows `next_page` links**: Concatenates the `next_page` path with the base URL
2. **Continues until `null`**: Stops only when `next_page` is `null` (not just undefined)
3. **Respects safety limits**: Uses `maxPages` parameter to prevent runaway requests
4. **Handles errors gracefully**: Each page request is independent

## Error Handling

The client provides comprehensive error handling:

```typescript
try {
  const accounts = await hrpClient.listAccounts();
} catch (error) {
  if (error.message.includes('401')) {
    // Authentication error
    console.error('Authentication failed');
  } else if (error.message.includes('422')) {
    // Validation error  
    console.error('Invalid request parameters');
  } else {
    // Other errors
    console.error('API error:', error.message);
  }
}
```

## Testing

Run the HRP client test suite:

```bash
# From the api-client package directory
pnpm test:hrp
```

The test suite validates:
- Authentication flow
- Account listing
- Trade data fetching with pagination
- Deposits and withdrawals fetching
- Token management

## Integration with Services

The HRP client integrates with the backend cronjob system via `HRPDataFetchRunner`:

```typescript
// The runner is automatically registered and scheduled
// Location: packages/backend/src/services/cronjob/runners/hrp-data.ts

// Manual trigger (for testing)
const cronjobService = serviceManager.get('CronjobService');
await cronjobService.triggerJob('HRPDataFetchRunner');
```

## Schema Generation

The TypeScript schemas are auto-generated from OpenAPI specifications:

```bash
# Generate data API schema
pnpm generate:hrp

# Generate auth API schema  
pnpm generate:hrp-auth
```

Source files:
- Auth API: `packages/docs/hrp_auth_openapi.json`
- Data API: `packages/docs/hrp_openapi.json`

## Security Considerations

1. **Credentials**: Store client ID and secret securely in environment variables
2. **Proxy**: Use SOCKS5 proxy for secure connections in production
3. **Token Storage**: Tokens are kept in memory only, not persisted
4. **Rate Limiting**: Implement appropriate delays between requests if needed
5. **Logging**: API requests/responses are logged but credentials are never logged