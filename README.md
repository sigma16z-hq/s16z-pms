# S16Z Portfolio Management System

NestJS-based portfolio management system migrated from the legacy annamite-pms framework.

## Quick Start

### Prerequisites

- Node.js 22+
- pnpm 9+
- Docker & Docker Compose

### Development Setup

1. **Start databases**:
   ```bash
   pnpm docker:up
   ```
   This starts:
   - PostgreSQL on `localhost:5432`
   - Redis on `localhost:6379`
   - Redis Commander on `localhost:8081` (optional GUI)

2. **Generate Prisma client**:
   ```bash
   pnpm db:generate
   ```

3. **Push database schema**:
   ```bash
   pnpm db:push
   ```

4. **Start development server**:
   ```bash
   pnpm start:dev
   ```

The API will be available at `http://localhost:3000`

### Useful Commands

```bash
# Database
pnpm db:generate     # Generate Prisma client
pnpm db:push         # Push schema to database
pnpm db:migrate      # Create and apply migrations
pnpm db:studio       # Open Prisma Studio

# Docker
pnpm docker:up       # Start databases
pnpm docker:down     # Stop databases
pnpm docker:logs     # View database logs

# Development
pnpm start:dev       # Start dev server with hot reload
pnpm build           # Build application
pnpm test            # Run tests
```

## Project Structure

```
s16z-pms/
├── apps/pms-api/           # Main API application
├── libs/database/          # Database layer with Prisma
├── libs/external-apis/     # External API clients (1Token, HRP)
├── libs/common/            # Shared utilities
└── docker-compose.yml     # Local development databases
```

## Migration Status

- ✅ Phase 1: Foundation & Project Structure
- 🚧 Phase 2: Database Layer Migration
- ⏳ Phase 3: External APIs Integration
- ⏳ Phase 4: Business Logic Services
- ⏳ Phase 5: Scheduler Jobs
- ⏳ Phase 6: API Layer & Controllers

See `.claude/tasks/MIGRATION_PLAN.md` for detailed migration progress.