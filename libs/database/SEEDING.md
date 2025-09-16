# Database Seeding Guide

## Overview

The S16Z PMS database seeding system provides multiple ways to initialize the database with essential data migrated from the original annamite-pms project.

## Seed Data Included

### 1. Departments (1Token Integration)
- **TG**: `oneTokenDepartmentId: 'annamite/default'`
- **SPC**: `oneTokenDepartmentId: 'annamite/qywubx'`

### 2. Counterparties (Exchange/Custodian Integration)
- **Exchanges**: Binance, Bitfinex, Bitget, BitMEX, Bybit, Coinbase, Crypto.com, Deribit, Gate.io, Kraken, OKX
- **Custodians**: Zodia
- **Providers**: HRP Master

### 3. ShareClasses (Multi-Tenant Configuration)
- **USDT**: `HRP_USDT_CLIENT_ID/SECRET` environment variables
- **BTC**: `HRP_BTC_CLIENT_ID/SECRET` environment variables
- **ETH**: `HRP_ETH_CLIENT_ID/SECRET` environment variables

## Environment Variables Required

```bash
# HRP API Credentials for ShareClasses
HRP_USDT_CLIENT_ID=your_usdt_client_id
HRP_USDT_CLIENT_SECRET=your_usdt_client_secret

HRP_BTC_CLIENT_ID=your_btc_client_id
HRP_BTC_CLIENT_SECRET=your_btc_client_secret

HRP_ETH_CLIENT_ID=your_eth_client_id
HRP_ETH_CLIENT_SECRET=your_eth_client_secret

# Optional: Control auto-seeding behavior
AUTO_SEED=true  # Set to 'false' to disable auto-seed on startup
NODE_ENV=development  # Auto-seed only runs in development
```

## Seeding Methods

### 1. Automatic Seeding (Development Only)
The database is automatically seeded on application startup in development mode:

```bash
# Start the application - seeds automatically if needed
pnpm start:dev
```

**Features**:
- ✅ Only runs in `NODE_ENV=development`
- ✅ Checks if data exists before seeding
- ✅ Skips seeding if data already present
- ✅ Won't crash app if seeding fails
- ✅ Can be disabled with `AUTO_SEED=false`

### 2. Manual CLI Seeding

```bash
# Run seed directly
pnpm db:seed

# Run seed in development mode
pnpm db:seed:dev

# Reset database and re-seed
pnpm db:reset
```

### 3. Standalone Script Execution

```bash
# Direct execution with tsx
tsx libs/database/src/seed/run-seed.ts

# Or with node (after build)
node dist/libs/database/src/seed/run-seed.js
```

### 4. NestJS Command Runner (Future)

```bash
# Using nest-commander (requires setup)
pnpm run command seed
```

## Integration in Your Services

### Import Seed Service

```typescript
import { SeedModule, DatabaseSeedService } from '@app/database';

@Module({
  imports: [SeedModule],
  // ...
})
export class YourModule {}
```

### Manual Seeding in Code

```typescript
@Injectable()
export class YourService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly seedService: DatabaseSeedService,
  ) {}

  async initializeDatabase() {
    await this.seedService.seedDatabase(this.databaseService);
  }
}
```

## File Structure

```
libs/database/src/seed/
├── database.seed.ts          # Main seeding logic
├── seed.command.ts           # NestJS CLI command
├── seed.module.ts            # Seed module for DI
├── startup-seed.service.ts   # Auto-seed on startup
├── run-seed.ts               # Standalone script
└── index.ts                  # Exports
```

## Best Practices

### Development Workflow
1. **First Time Setup**:
   ```bash
   pnpm docker:up          # Start PostgreSQL
   pnpm db:migrate         # Run migrations
   pnpm start:dev          # Auto-seeds on startup
   ```

2. **Reset During Development**:
   ```bash
   pnpm db:reset           # Reset DB and re-seed
   ```

### Production Deployment
- **Disable auto-seed**: Set `AUTO_SEED=false` or `NODE_ENV=production`
- **Manual seeding**: Use `pnpm db:seed` in deployment scripts if needed
- **Environment variables**: Ensure all HRP credentials are set

### Error Handling
- Seeding uses `upsert` operations for idempotency
- Missing environment variables log warnings but don't crash
- Auto-seed failures don't prevent application startup
- All operations are logged with clear success/failure indicators

## Migration from Old Project

This seeding system preserves the exact same data structure as:
- `annamite-pms/packages/db/src/seed.ts`
- All departments, counterparties, and share classes are maintained
- Same upsert logic to prevent duplicates
- Same environment variable names for HRP credentials

## Troubleshooting

### ShareClass Not Seeding
- Check HRP environment variables are set
- Verify variable naming: `HRP_USDT_CLIENT_ID`, `HRP_USDT_CLIENT_SECRET`, etc.
- Check logs for specific missing credentials

### Auto-Seed Not Running
- Verify `NODE_ENV=development`
- Check `AUTO_SEED` is not set to 'false'
- Look for startup logs indicating seed status

### Database Connection Issues
- Ensure PostgreSQL is running: `pnpm docker:up`
- Check database connection string in `.env`
- Verify migrations are up to date: `pnpm db:migrate`