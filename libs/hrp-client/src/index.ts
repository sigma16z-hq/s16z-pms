// Export types
export * from './types';

// Export base clients (for multi-instance usage)
export * from './base/hrp-base-client';
export * from './auth/hrp-auth-client';

// Export NestJS services (for singleton usage)
export * from './client/hrp.module';
export * from './client/hrp.service';
export * from './client/hrp-auth.service';

// Re-export from base package
export * from '@s16z/api-client-base';