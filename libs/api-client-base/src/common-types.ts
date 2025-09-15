/**
 * Common configuration interface for SOCKS5 proxy
 */
export interface ProxyConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
}

/**
 * Base configuration interface for API clients
 */
export interface BaseApiConfig {
  proxy?: ProxyConfig;
}

/**
 * Common utility types for API clients
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ApiCallOptions {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}