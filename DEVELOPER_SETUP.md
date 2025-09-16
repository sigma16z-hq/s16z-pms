# 🚀 Developer Setup Guide

## Quick Start (2 minutes)

```bash
# 1. Clone and install
git clone <your-repo-url>
cd s16z-pms
pnpm install

# 2. Set up environment
cp .env.local.example .env.local

# 3. Start databases and app (one command!)
pnpm dev:setup

# 4. Start the application
pnpm start:dev
```

The app will be running at http://localhost:3000

## Port Configuration (No Conflicts!)

We use non-standard ports to avoid conflicts with your existing local databases:

| Service | Port | Access |
|---------|------|--------|
| **PostgreSQL** | `5433` | `localhost:5433` |
| **Redis** | `6380` | `localhost:6380` |
| **Redis Commander** | `8082` | http://localhost:8082 |
| **PMS Service** | `3000` | http://localhost:3000 |

## Available Commands

### Development Commands
```bash
# Complete setup (databases + seeding)
pnpm dev:setup

# Reset everything (clean start)
pnpm dev:reset

# Start application in watch mode
pnpm start:dev

# Build application
pnpm build
```

### Database Commands
```bash
# Start databases
pnpm docker:up

# Stop databases
pnpm docker:down

# View database logs
pnpm docker:logs

# Generate Prisma client
pnpm db:generate

# Push schema to database
pnpm db:push

# Run database migrations
pnpm db:migrate

# Seed database with test data
pnpm db:seed:dev

# Open Prisma Studio (database GUI)
pnpm db:studio
```

### HRP Accounts Domain Commands
```bash
# Trigger manual HRP accounts sync
curl -X POST http://localhost:3000/hrp-account-jobs/sync

# Check HRP accounts job status
curl http://localhost:3000/hrp-account-jobs/status

# View HRP accounts schedule info
curl http://localhost:3000/hrp-account-jobs/schedule
```

## Environment Configuration

### Required Environment Variables

Copy `.env.local.example` to `.env.local` and update:

```env
# Database (configured for Docker)
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/s16z_pms?schema=public"
REDIS_URL="redis://localhost:6380"

# HRP API (get from your HRP provider)
HRP_CLIENT_ID=your_actual_hrp_client_id
HRP_CLIENT_SECRET=your_actual_hrp_client_secret

# 1Token API (get from your 1Token provider)
ONETOKEN_API_KEY=your_actual_onetoken_api_key
ONETOKEN_API_SECRET=your_actual_onetoken_api_secret_base64
```

### Optional Configuration

```env
# HRP Accounts Scheduler
HRP_ACCOUNTS_ENABLED=true
HRP_ACCOUNTS_SCHEDULE="0 */6 * * *"  # Every 6 hours

# Development
DEBUG=true
LOG_LEVEL=debug
```

## Database Schema

The application uses PostgreSQL with Prisma ORM. Key tables:

- **ShareClass** - Portfolio share classes with API credentials
- **Department** - Business departments
- **Counterparty** - Trading counterparties
- **HrpTradingAccount** - HRP trading accounts
- **HrpBasicAccount** - HRP basic accounts
- **TripartyAccount** - Triparty custody accounts

## API Endpoints

### HRP Account Jobs
- `POST /hrp-account-jobs/sync` - Manually trigger account sync
- `GET /hrp-account-jobs/status` - Get service status
- `GET /hrp-account-jobs/schedule` - Get scheduling info

## Troubleshooting

### Port Conflicts
If you still have port conflicts, update these files:
- `docker-compose.yml` - Change the external ports (left side of `5433:5432`)
- `.env.local` - Update `DATABASE_URL` and `REDIS_URL` to match

### Database Connection Issues
```bash
# Check if containers are running
docker ps

# View database logs
pnpm docker:logs

# Reset database
pnpm dev:reset
```

### Missing Dependencies
```bash
# Reinstall all dependencies
rm -rf node_modules
pnpm install
```

### HRP/OneToken API Issues
- Check your API credentials in `.env.local`
- Verify network connectivity to external APIs
- Check application logs for authentication errors

### Build Issues
```bash
# Clean build
rm -rf dist
pnpm build
```

## Architecture Overview

```
apps/
├── pms-service/           # Main NestJS application
│   └── src/accounts/      # HRP accounts domain
libs/
├── database/              # Prisma schema & utilities
├── hrp-client/           # HRP API client
└── onetoken-client/      # OneToken API client
```

## Development Workflow

1. **Make changes** to code
2. **Application auto-reloads** (watch mode)
3. **Test APIs** using curl or Postman
4. **View database** with `pnpm db:studio`
5. **Check logs** in terminal
6. **Reset data** with `pnpm dev:reset` if needed

## Next Steps

- Set up your actual HRP and OneToken API credentials
- Review the accounts domain logic in `apps/pms-service/src/accounts/`
- Check the database schema in `libs/database/prisma/schema.prisma`
- Explore the API documentation in each domain's README

Happy coding! 🎉