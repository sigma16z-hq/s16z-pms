# S16Z PMS Migration Plan: Annamite PMS → NestJS

## Migration Strategy: Layer-by-Layer Approach

### Phase 1: Foundation & Project Structure Setup

**Objective**: Create the NestJS monorepo structure and core infrastructure

**Tasks:**

1. **Initialize NestJS Monorepo Structure**
   - Create proper `apps/` and `libs/` directory structure
   - Set up `nest-cli.json` for monorepo configuration
   - Configure root `package.json` with workspace dependencies
   - Set up TypeScript configuration for monorepo

2. **Create Directory Structure**
   ```
   s16z-pms/
   ├── apps/
   │   └── pms-api/                 # Main API application
   │       ├── src/
   │       │   ├── modules/
   │       │   ├── main.ts
   │       │   └── app.module.ts
   │       └── package.json
   ├── libs/
   │   ├── database/                # Database layer (Phase 2)
   │   ├── external-apis/           # API clients (Phase 3)
   │   └── common/                  # Shared utilities
   └── nest-cli.json
   ```

### Phase 2: Database Layer Migration

**Objective**: Migrate Prisma schema and create NestJS database module

**Tasks:**

1. **Database Schema Migration**
   - Copy Prisma schema from `/packages/db/schema.prisma`
   - Create `libs/database/` library
   - Implement NestJS `DatabaseModule` with proper lifecycle management
   - Create `DatabaseService` extending PrismaClient
   - Set up database configuration using NestJS ConfigModule

2. **Repository Pattern Implementation**
   - Create repository interfaces for core entities
   - Implement repository classes using Prisma
   - Set up proper dependency injection for repositories

### Phase 3: External APIs Integration

**Objective**: Migrate 1Token and HRP clients with NestJS patterns

**Tasks:**

1. **1Token Client Migration**
   - Migrate client from `/packages/api-client/src/clients/1token/`
   - Wrap in NestJS module with proper configuration
   - Implement HttpModule integration for API calls
   - Add Redis caching using NestJS cache-manager

2. **HRP Client Migration**
   - Migrate HRP client and auth logic
   - Create OAuth2 service for HRP authentication
   - Implement proper error handling and retry logic
   - Set up JWT token management

3. **External APIs Module**
   - Create consolidated `ExternalApisModule`
   - Configure API endpoints and credentials via ConfigModule
   - Implement proper logging and monitoring

### Phase 4: Business Logic Services

**Objective**: Migrate core calculation and fee services

**Tasks:**

1. **Portfolio Calculation Service**
   - Migrate `PortfolioCalcService` to NestJS service
   - Preserve cumulative incremental calculation logic
   - Implement chain validation and integrity checks
   - Add proper error handling and logging

2. **Fee Services Migration**
   - Migrate `PortfolioFeeService`, `CipFeeService`, etc.
   - Implement currency conversion service
   - Set up fee aggregation logic
   - Preserve event sourcing for HRP fees

3. **Transfer and Quote Services**
   - Migrate spot quote service
   - Implement transfer conversion service
   - Set up currency conversion logic

### Phase 5: Scheduler Jobs

**Objective**: Replace custom scheduler with NestJS Schedule module

**Tasks:**

1. **Cron Jobs Migration**
   - Migrate existing cron jobs using `@nestjs/schedule`
   - Replace `BaseCronjobRunner` with NestJS patterns
   - Implement proper error handling and logging
   - Set up dynamic job management with SchedulerRegistry

2. **Job Configuration**
   - Migrate job configurations from environment variables
   - Implement job monitoring and health checks
   - Add job status tracking

### Phase 6: API Layer & Controllers

**Objective**: Create REST API endpoints for frontend

**Tasks:**

1. **Controller Implementation**
   - Create controllers for portfolio management
   - Implement authentication and authorization
   - Set up proper request/response validation
   - Add API documentation with Swagger

2. **Middleware & Guards**
   - Implement authentication guards
   - Add request logging middleware
   - Set up rate limiting and security headers

### Phase 7: Configuration & Logging

**Objective**: Replace custom config and logging with NestJS standards

**Tasks:**

1. **Configuration Migration**
   - Replace `GlobalConfig` with NestJS ConfigModule
   - Migrate environment variable handling
   - Implement configuration validation with Joi
   - Set up environment-specific configurations

2. **Logging Setup**
   - Replace custom logger with NestJS Logger
   - Set up structured logging
   - Implement log levels and formatting
   - Add request/response logging

### Phase 8: Testing & Quality Assurance

**Objective**: Set up comprehensive testing framework

**Tasks:**

1. **Unit Testing**
   - Set up Jest configuration for monorepo
   - Create unit tests for all services
   - Implement proper mocking strategies
   - Add test coverage reporting

2. **Integration Testing**
   - Set up E2E testing framework
   - Create integration tests for API endpoints
   - Test database interactions
   - Implement test database setup

### Phase 9: DevOps & Deployment

**Objective**: Set up build and deployment pipeline

**Tasks:**

1. **Build Configuration**
   - Set up NestJS build process
   - Configure Docker containers
   - Implement hot reload for development
   - Set up production optimizations

2. **CI/CD Pipeline**
   - Set up GitHub Actions or similar
   - Implement automated testing
   - Configure deployment strategies
   - Set up monitoring and alerting

## Key Principles:

1. **Business Logic Preservation**: All calculation algorithms and business rules must be preserved exactly
2. **NestJS Best Practices**: Follow 2024-2025 NestJS standards throughout
3. **Incremental Migration**: Each phase can be tested independently
4. **Zero Data Loss**: Database migration must preserve all existing data
5. **Backward Compatibility**: Maintain API compatibility during transition

## Success Criteria:

- All business logic functions identically to original system
- Performance matches or exceeds original implementation
- Code follows NestJS best practices and is maintainable
- Comprehensive test coverage (>80%)
- Documentation is complete and up-to-date

This plan provides a structured approach to migrate the entire system while maintaining business continuity and following modern development practices.

## Implementation Progress

### Principle

1. Always remember we are using pnpm.
2. Always don't make things up or exaggerate things
3. Always follow make things work, make things right, make things fast this principle
4. **Always update this migration documentation file** after completing any phase or significant task
5. **Track all issues, weird implementations, and deviations** - when encountering something that doesn't follow best practices, weird implementations in the old project, or anything not migrated, record them in `.claude/tasks/MIGRATION_ISSUES.md` for review

### Completed:

- [x] Migration plan created and documented
- [x] Phase 1: Foundation & Project Structure Setup
  - [x] Initialize NestJS monorepo structure
  - [x] Set up nest-cli.json configuration
  - [x] Configure root package.json with workspace dependencies (minimal approach)
  - [x] Create apps/pms-api application structure
  - [x] Set up libs/ directory structure
  - [x] Remove overdesigned packages (follow: make it work, make it right, make it fast)
  - [x] Test build and ensure basic functionality works
- [x] Phase 2: Database Layer Migration
  - [x] Copy Prisma schema from old project (980 lines of complex business schema)
  - [x] Create NestJS DatabaseModule with proper lifecycle management
  - [x] Create DatabaseService extending PrismaClient
  - [x] Set up Docker Compose for PostgreSQL and Redis (local development)
  - [x] Add database scripts to package.json
  - [x] Generate Prisma client and test build successfully
  - [x] Create .env configuration files
  - [x] Repository Pattern Implementation
    - [x] Create repository interfaces for all core entities (Portfolio, ShareClass, PortfolioValuation, PortfolioCalculation, FeeLedger, SpotQuote, Transfer)
    - [x] Implement repository classes with full CRUD operations using Prisma
    - [x] Set up proper dependency injection in DatabaseModule
    - [x] Add specialized query methods (findWithValuations, findNetInflowForAccount, etc.)
    - [x] Test build and ensure all repositories are properly registered

### In Progress:

- [ ] Phase 3: External APIs Integration

### Next Steps:

1. Start databases with `pnpm docker:up`
2. Test database connection with actual PostgreSQL instance
3. Begin migrating 1Token API client from old project
4. Begin migrating HRP API client from old project
