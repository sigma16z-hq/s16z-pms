# API Client Tests

## 1Token API Test

This test demonstrates how to use the 1Token API client to fetch exchange accounts.

### Setup

1. Copy `.env.example` to `.env` in the api-client package root:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and add your 1Token API credentials:
   ```
   ONETOKEN_API_KEY=your_actual_api_key
   ONETOKEN_API_SECRET=your_actual_api_secret
   ```

3. (Optional) Configure SOCKS5 proxy if needed.

### Running the Test

```bash
# From the api-client package directory
pnpm test:1token

# Or from the project root
pnpm --filter @acpms/api-client test:1token
```

### Expected Output

The test will:
1. Initialize the 1Token client with your credentials
2. Call the `listExchangeAccounts` endpoint
3. Display the response including:
   - Total number of accounts
   - Account details (name, alias, status, venue, etc.)

### Response Structure

The API returns:
```typescript
{
  code: string,              // "success" for successful requests
  message: string,           // Response message
  request_time: number,      // Request timestamp (nanoseconds)
  response_time: number,     // Response timestamp (nanoseconds)
  result: {
    total: number,          // Total number of accounts
    accounts: Array<{
      name: string,         // Account unique name
      alias: string,        // Account alias
      status: string,       // Account status
      venue: string,        // Exchange name
      fund_name: string,    // Portfolio name
      balance_usd: string,  // Balance in USD
      // ... more fields
    }>
  }
}
```