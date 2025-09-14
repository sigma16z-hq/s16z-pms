# 1Token API Client

This client provides TypeScript support for the 1Token CAM API using `openapi-fetch` with auto-generated types from the OpenAPI specification.

## Usage

```typescript
import { OneTokenClient } from '@acpms/api-client';

// Initialize the client
const client = new OneTokenClient({
  apiKey: 'YOUR_API_KEY',
  apiSecret: 'YOUR_API_SECRET',
  baseUrl: 'https://www.1tokencam.com/api/v1' // optional, this is the default
});

// Initialize with SOCKS5 proxy
const clientWithProxy = new OneTokenClient({
  apiKey: 'YOUR_API_KEY',
  apiSecret: 'YOUR_API_SECRET',
  proxy: {
    host: 'proxy.example.com',
    port: 1080,
    userId: 'username', // optional
    password: 'password' // optional
  }
});

// Use predefined methods
const exchangeAccounts = await client.listExchangeAccounts();
const custodyAccounts = await client.listCustodyAccounts('department-name');

// Or use the raw client for any endpoint
const rawClient = client.getClient();

// Example: Get portfolio details
const { data, error } = await rawClient.GET('/fundv3/openapi/portfolio/get-portfolio-detail', {
  params: {
    query: {
      portfolio_name: 'MyPortfolio'
    }
  }
});

if (error) {
  console.error('Error:', error);
} else {
  console.log('Portfolio details:', data);
}
```

## Type Generation

The TypeScript types are auto-generated from the OpenAPI specification. To regenerate them:

```bash
pnpm generate:1token
```

This will update the `schema.d.ts` file with the latest types from the OpenAPI spec.

## Available Endpoints

All endpoints from the 1Token API are available through the raw client. The types are fully typed based on the OpenAPI specification, providing:

- Request parameter types (query, body, path)
- Response types
- Error types

Check the generated `schema.d.ts` file or use your IDE's autocomplete to explore available endpoints and their types.