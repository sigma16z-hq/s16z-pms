# 🚀 S16Z Portfolio Management System (PMS)

A NestJS-based portfolio management system with real-time data processing from HRP and OneToken APIs.

## ⚡ Quick Start (One Command!)

```bash
# Complete setup in one command
pnpm dev:setup

# Start the application
pnpm start:dev
```

**That's it!** 🎉 The app will be running at http://localhost:3000

## 🏗️ Architecture

### Applications
- **`apps/pms-service/`** - Main NestJS application with business domains

### Business Domains
- **`src/accounts/`** - HRP account processing & classification
- **`src/transfers/`** - Transfer processing (coming soon)
- **`src/fees/`** - Fee calculations (coming soon)

### Libraries
- **`libs/database/`** - Prisma schema & database utilities
- **`libs/hrp-client/`** - HRP API client with authentication
- **`libs/onetoken-client/`** - OneToken API client with HMAC auth

## 🌟 Key Features

### ✅ Currently Available
- **HRP Accounts Domain** - Automatic account sync and classification
- **Real API Integration** - HRP and OneToken clients with proper auth
- **Configurable Scheduling** - Environment-driven cron jobs
- **Database Transactions** - Atomic operations with rollback support
- **Multi-ShareClass Support** - Different credentials per share class
- **Development-Friendly Setup** - No port conflicts, one-command setup

### 🚧 Coming Soon (Phase 4)
- Transfers domain
- Fees domain (CIP, ERS, Financing)
- Portfolio domain
- Currency services

## 🔌 API Endpoints

### HRP Account Jobs
```bash
# Manually trigger account sync
curl -X POST http://localhost:3000/hrp-account-jobs/sync

# Check service status
curl http://localhost:3000/hrp-account-jobs/status

# View schedule info
curl http://localhost:3000/hrp-account-jobs/schedule
```

## 🗄️ Database

- **PostgreSQL** on port `5433` (no conflicts with your local DB)
- **Redis** on port `6380` (no conflicts with your local Redis)
- **Prisma ORM** with automatic migrations
- **Seeded with test data** (departments, counterparties, share classes)

## ⚙️ Configuration

Environment variables (automatically set up):
```env
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/s16z_pms?schema=public"
REDIS_URL="redis://localhost:6380"

# HRP API
HRP_CLIENT_ID=your_hrp_client_id
HRP_CLIENT_SECRET=your_hrp_client_secret

# 1Token API
ONETOKEN_API_KEY=your_onetoken_api_key
ONETOKEN_API_SECRET=your_onetoken_api_secret

# Scheduler
HRP_ACCOUNTS_ENABLED=true
HRP_ACCOUNTS_SCHEDULE="0 */6 * * *"  # Every 6 hours
```

## 📖 Documentation

- **[Developer Setup Guide](./DEVELOPER_SETUP.md)** - Complete setup instructions
- **[HRP Accounts Domain](./apps/pms-service/src/accounts/README.md)** - Domain documentation
- **[Database Schema](./libs/database/prisma/schema.prisma)** - Full schema definition

## 🛠️ Development Commands

```bash
# Development workflow
pnpm dev:setup     # Complete setup (first time)
pnpm start:dev     # Start with hot reload
pnpm dev:reset     # Reset everything

# Database operations
pnpm db:studio     # Database GUI
pnpm db:push       # Apply schema changes
pnpm db:seed:dev   # Seed test data

# Docker operations
pnpm docker:up     # Start databases
pnpm docker:down   # Stop databases
pnpm docker:logs   # View logs
```

## 🔧 Troubleshooting

### Port Conflicts?
The setup uses non-standard ports to avoid conflicts:
- PostgreSQL: `5433` (instead of 5432)
- Redis: `6380` (instead of 6379)
- Redis Commander: `8082` (instead of 8081)

### Database Issues?
```bash
pnpm dev:reset  # Complete reset
```

### Missing Dependencies?
```bash
rm -rf node_modules && pnpm install
```

## 🏭 Production Features

- **Real API Integration** with HRP and OneToken
- **Robust Error Handling** with structured logging
- **Transaction Support** for data consistency
- **Configurable Scheduling** via environment variables
- **Multi-tenant Architecture** supporting multiple share classes
- **Comprehensive Testing** setup ready

## 🚀 Next Steps

1. **Set up your API credentials** in `.env.local`
2. **Explore the accounts domain** in `apps/pms-service/src/accounts/`
3. **Check out the database** with `pnpm db:studio`
4. **Review the architecture** in the domain README files

Built with ❤️ using NestJS, Prisma, and TypeScript.