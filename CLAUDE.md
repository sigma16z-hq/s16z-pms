# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project background

This is a refactoring project based on the POC project from /root/workspace/annamite-pms which still not online yet.
We want to refactor the backend especially, to replace the boilerplate code that it implement by themselves and use the mature libs in js ecosystem.
Also the code implmentation in the POC project isn't so good, so the refacoting is also a chance for us to make code clearer and easy to maintain.

You should take reference from it, and help us to finish the refactoring and migrating so that we can have a better maintained new project.

## Plan & Review Workflow

- **Plan first**: Stay in plan mode, map an MVP with rationale and tasks (use the Task tool for research), store it as `/tasks/TASK_NAME.md`, and wait for approval before coding
- **Work in public**: Update the plan tool and file as you progress so completed work, blockers, and scope changes are obvious for handoffs

## Development Commands

### Initial Setup
```bash
pnpm dev:setup     # Complete first-time setup (copies .env, starts Docker, pushes schema, seeds DB)
pnpm start:dev     # Start application with hot reload
```

### Testing
```bash
pnpm test          # Run all unit tests (Vitest)
pnpm test:watch    # Run tests in watch mode
pnpm test:cov      # Run tests with coverage report
pnpm test:e2e      # Run end-to-end tests
```

### Database Operations
```bash
pnpm db:push       # Push schema changes to database
pnpm db:generate   # Generate Prisma client after schema changes
pnpm db:studio     # Open Prisma Studio database GUI
pnpm db:seed:dev   # Seed database with development data
pnpm db:migrate    # Create and apply migrations
```

### Code Quality
```bash
pnpm lint          # Run ESLint with auto-fix
pnpm format        # Format code with Prettier
pnpm build         # Build the application
```

### Docker & Environment
```bash
pnpm docker:up     # Start PostgreSQL (port 5433) and Redis (port 6380)
pnpm docker:down   # Stop Docker services
pnpm dev:reset     # Reset entire development environment
pnpm dev:clean     # Remove Docker volumes completely
```

### Single Test Execution
```bash
pnpm test -- hrp-account-processor.service.spec.ts  # Run specific test file
pnpm test:watch -- --grep "specific test name"       # Watch specific test
```

### Pre-Commit Quality Gates
Run these commands before creating PRs:
```bash
pnpm lint                                            # ESLint with auto-fix
pnpm exec prettier --check "apps/**/*.ts" "libs/**/*.ts"  # Prettier check
pnpm exec tsc --noEmit                               # TypeScript compilation check
pnpm vitest run --changed                            # Run tests for changed files
```

## Architecture Overview

### Monorepo Structure
- **`apps/pms-service/`** - Main NestJS application with business domains
- **`libs/`** - Shared libraries for cross-cutting concerns

### Business Domains (Domain-Driven Design)
- **`src/accounts/`** - HRP account processing, classification, and sync scheduling
- **`src/currency/`** - Currency conversion and daily rate synchronization from 1Token
- **`src/transfers/`** - Transfer processing (planned)
- **`src/fees/`** - Fee calculations (planned)

### Core Libraries
- **`libs/database/`** - Prisma schema, migrations, and database utilities
- **`libs/hrp-client/`** - HRP API client with OAuth2 authentication
- **`libs/onetoken-client/`** - OneToken API client with HMAC authentication
- **`libs/common/`** - Shared utilities and types
- **`libs/api-client-base/`** - Base classes for API clients

### Key Architectural Patterns
- **NestJS modules** with feature-based organization
- **Prisma ORM** for database operations with transaction support
- **Scheduled jobs** using NestJS Schedule with configurable cron expressions
- **Multi-tenant support** via share class configurations
- **Environment-driven configuration** with `.env.local` for development

## Database Schema

The system uses PostgreSQL with Prisma ORM. Key entities include:
- **HrpTradingAccount** - Trading accounts from HRP API
- **Department** - Organizational units with OneToken mapping
- **ShareClass** - Investment share classes with API credentials
- **Counterparty** - Trading counterparties

Schema location: `libs/database/prisma/schema.prisma`

## Testing Framework

Uses **Vitest** instead of Jest for better TypeScript and ESM support:
- Unit tests: `*.spec.ts` files alongside source code
- E2E tests: `*.e2e-spec.ts` in `apps/pms-service/test/`
- Test containers for PostgreSQL integration tests
- Coverage target: ≥80%
- Global test setup in `vitest.setup.ts`

### Test-Driven Development Loop
- **Red**: Add a failing spec and prove it with `pnpm test:watch` (or `pnpm test:e2e`)
- **Green**: Ship the minimal fix, keep the watcher running, and commit with the spec
- **Refactor**: Clean up, rerun `pnpm test` + `pnpm lint`, confirm coverage stays above target

## Environment Configuration

Development uses non-conflicting ports:
- **PostgreSQL**: port 5433
- **Redis**: port 6380
- **Application**: port 3000

Copy `.env.local.example` to `.env.local` and configure:
- HRP API credentials (client ID/secret)
- OneToken API credentials (key/secret)
- Scheduler settings (enabled/cron expressions)
- Currency sync settings (enabled/schedule/exchange/backfill days)

Use `pnpm dev:reset` to rebuild containers and `pnpm db:generate` after schema updates.

## Domain-Specific Guidelines

### Accounts Domain
- Processes HRP trading accounts with automatic classification
- Scheduled sync jobs configurable via environment variables
- Manual triggers available via REST endpoints (`/hrp-account-jobs/sync`)
- Transaction-based processing for data consistency

### Currency Domain
- Automated daily currency rate synchronization from 1Token API
- Support for 7 cryptocurrencies: BTC, ETH, USDT, USDC, SOL, AVAX, MATIC
- Intelligent historical backfill with gap detection
- Manual triggers available via REST endpoints (`/currency-jobs/sync`)
- USD-centric conversion supporting all currency pairs

### API Clients
- All external API clients extend base classes from `libs/api-client-base/`
- HRP client handles OAuth2 token refresh automatically
- OneToken client implements HMAC signature authentication
- Proxy support available for external API calls

## Code Conventions

- **Pnpm** as package management
- **TypeScript** with strict mode enabled
- **NestJS** decorators and dependency injection patterns
- **PascalCase** for classes, **camelCase** for methods/properties
- **kebab-case** for file names
- **2-space indentation**, single quotes, trailing commas (Prettier enforced)
- Feature folders with index.ts barrel exports
- Avoid to use any as return type it's a bad habbit in typescript.
- Simple work to make things done
- Always clean up the unused method, and make good control for function access level control