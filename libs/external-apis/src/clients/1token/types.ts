// 1Token API Types

// Re-export generated types from OpenAPI schema
export type { paths, components, operations } from './schema';

// Custom types for client configuration
export interface OneTokenConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl?: string;
  proxy?: {
    host: string;
    port: number;
    username?: string;
    password?: string;
  };
}
