# NestJS Refactoring Plan for Annamite PMS Backend

## Executive Summary

This plan outlines the refactoring of the annamite-pms **backend only** from a custom service-based architecture to a modern NestJS-based system. The system is a **Portfolio Management System (PMS)** that fetches data from 3rd party APIs (1Token, HRP), processes and calculates portfolio metrics, fees, and transfers, then serves this data via APIs.

## Current Architecture Analysis (Actual Understanding)

### What the System Actually Does
The annamite-pms is a **Portfolio Management System** that:

1. **Data Ingestion**: Fetches data from external sources
   - **1Token API**: Portfolio data and historical NAV
   - **HRP (High Risk Portfolio) API**: Trading account data, fees, transfers
   
2. **Data Processing & Calculations**: 
   - **Portfolio Calculations**: NAV, returns, performance metrics using cumulative approach
   - **Fee Calculations**: CIP fees, portfolio management fees with currency conversion
   - **Transfer Processing**: Account transfers between BASIC, TRADING, TRIPARTY accounts
   
3. **Data Storage**: PostgreSQL with complex portfolio/trading data model
4. **API Service**: Fastify-based dashboard API serving processed data
5. **Scheduled Jobs**: Cron-based data fetching and calculation pipeline

### Existing Structure
```
annamite-pms/packages/backend/src/
├── services/
│   ├── api/dashboard-api-service.ts        # Fastify API server
│   ├── cronjob/                           # Scheduled data processing
│   ├── hrp/                               # HRP API integration services
│   │   ├── hrp-fee-ingestion.ts          # Fetch fees from HRP
│   │   ├── hrp-transfer-service.ts       # Process HRP transfers  
│   │   └── hrp-account-processor.ts      # HRP account management
│   ├── portfolio-calc.ts                  # Core portfolio calculations
│   ├── portfolio-fee-service.ts          # Fee aggregation service
│   ├── portfolio-net-inflow-service.ts   # Cash flow calculations
│   ├── cip-fee-service.ts                # CIP fee calculations
│   └── trading-account-*.ts              # Trading account services
└── index.ts                              # Service bootstrap
```

### Current Technology Stack
- **Backend Framework**: Custom service architecture with Fastify API
- **Database**: PostgreSQL with Prisma ORM (complex portfolio data model)
- **Service Management**: Custom ServiceManager with dependency injection
- **External APIs**: 1Token, HRP via @acpms/api-client
- **Scheduling**: node-cron for data pipeline jobs
- **Build System**: esbuild
- **Language**: TypeScript

### Current Services Analysis (Real Functionality)
1. **HRPFeeIngestionService**: Fetches CIP fees from HRP API by trading accounts
2. **HRPTransferService**: Processes deposit/withdrawal transfers from HRP
3. **HRPAccountProcessorService**: Manages HRP trading account synchronization
4. **PortfolioCalcService**: Core portfolio calculations (NAV, returns) with strict chaining
5. **PortfolioFeeService**: Aggregates fees from multiple sources with currency conversion
6. **PortfolioNetInflowService**: Calculates cash flows and net inflows  
7. **CIPFeeService**: Calculates CIP fees for portfolios via trading accounts
8. **TradingAccountServices**: Handle account transfers and fee processing
9. **DashboardAPIService**: Fastify server with portfolio/shareclass REST endpoints
10. **CronjobService**: Orchestrates scheduled data pipeline (fetch → calculate → store)

## Proposed NestJS Architecture (Multi-App Structure)

### Multi-Application NestJS Structure
```
annamite-pms-nestjs/
├── apps/                          # 🚀 DEPLOYABLE APPLICATIONS
│   ├── pms-api/                   # REST API server for dashboard
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── portfolio/     # Portfolio API endpoints
│   │   │   │   ├── shareclass/    # ShareClass API endpoints  
│   │   │   │   ├── fees/          # Fee calculation APIs
│   │   │   │   ├── transfers/     # Transfer APIs
│   │   │   │   └── health/        # Health check endpoints
│   │   │   ├── main.ts           # API server bootstrap (port 3000)
│   │   │   └── app.module.ts     # Root module
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── pms-data-fetch/            # Background data processing service
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── hrp-ingestion/ # HRP data fetching
│   │   │   │   ├── onetoken/      # 1Token data fetching
│   │   │   │   ├── calculations/  # Portfolio calculations
│   │   │   │   ├── transfers/     # Transfer processing
│   │   │   │   └── scheduler/     # Cron job orchestration
│   │   │   ├── main.ts           # Background service bootstrap
│   │   │   └── app.module.ts     # Root module
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   └── pms-admin/                 # Admin/management interface
│       ├── src/
│       │   ├── modules/
│       │   │   ├── system-health/ # System monitoring
│       │   │   ├── portfolio-mgmt/# Portfolio administration
│       │   │   ├── user-mgmt/     # User management
│       │   │   ├── job-control/   # Background job management
│       │   │   └── data-export/   # Data export utilities
│       │   ├── main.ts           # Admin server bootstrap (port 3001)
│       │   └── app.module.ts     # Root module
│       ├── Dockerfile
│       └── package.json
│
├── libs/                          # 📚 SHARED LIBRARIES (ALL SHARED CODE)
│   ├── common/                   # Migrated from packages/common/ + NestJS enhancements
│   │   ├── src/
│   │   │   ├── config/           # Configuration modules (enhanced with NestJS patterns)
│   │   │   ├── decorators/       # Custom NestJS decorators
│   │   │   ├── services/         # Migrated service base classes with NestJS integration
│   │   │   ├── types/            # Shared TypeScript types
│   │   │   └── index.ts          # Re-export all common functionality
│   │   └── package.json
│   │
│   ├── database/                 # Migrated from packages/db/ + NestJS enhancements
│   │   ├── src/
│   │   │   ├── prisma/           # Prisma schema and generated client
│   │   │   ├── database.module.ts # NestJS Prisma module with connection management
│   │   │   ├── database.service.ts # NestJS Prisma service with lifecycle hooks
│   │   │   ├── repositories/     # Repository pattern implementations
│   │   │   └── index.ts          # Export database module and types
│   │   └── package.json
│   │
│   ├── external-apis/            # Migrated from packages/api-client/ + NestJS enhancements
│   │   ├── src/
│   │   │   ├── hrp/              # HRP client with NestJS module wrapper
│   │   │   ├── onetoken/         # 1Token client with NestJS module wrapper
│   │   │   ├── clients.module.ts # Consolidated external API clients module
│   │   │   └── index.ts          # Export all API clients and modules
│   │   └── package.json
│   │
│   ├── business-logic/           # Core business logic services (from backend/src/services/)
│   │   ├── src/
│   │   │   ├── portfolio/        # Portfolio calculation services (PortfolioCalcService)
│   │   │   ├── fees/             # Fee calculation services (CIPFeeService, PortfolioFeeService)
│   │   │   ├── transfers/        # Transfer processing services (HRPTransferService)
│   │   │   ├── hrp/              # HRP integration services (HRPFeeIngestionService, etc.)
│   │   │   └── trading/          # Trading account services
│   │   └── package.json
│   │
│   ├── api-types/                # Shared API DTOs and interfaces
│   │   ├── src/
│   │   │   ├── portfolio/        # Portfolio-related DTOs
│   │   │   ├── fees/             # Fee-related DTOs
│   │   │   ├── transfers/        # Transfer-related DTOs
│   │   │   └── common/           # Common API types
│   │   └── package.json
│   │
│   ├── ui-components/            # Shared React components (migrated from packages/dashboard/)
│   │   ├── src/
│   │   │   ├── components/       # Reusable UI components
│   │   │   ├── hooks/            # Custom React hooks
│   │   │   ├── types/            # UI-related types
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── frontend-utils/           # Frontend utilities and helpers
│       ├── src/
│       │   ├── api/              # API client utilities
│       │   ├── utils/            # Common frontend utilities
│       │   ├── constants/        # Frontend constants
│       │   └── index.ts
│       └── package.json
│
├── packages/                     # 🚧 TEMPORARY (during migration only)
│   ├── common/                   # @acpms/common → TO BE MOVED to libs/common/
│   ├── db/                       # @acpms/db → TO BE MOVED to libs/database/
│   ├── api-client/               # @acpms/api-client → TO BE MOVED to libs/external-apis/
│   └── dashboard/                # Frontend → TO BE SPLIT between libs/ui-components/ and apps/pms-dashboard/
│
├── nest-cli.json                # NestJS multi-app configuration
├── package.json                 # Root package.json with workspace deps
└── tsconfig.json               # Root TypeScript config
```

### Application-Based Refactoring Strategy

We'll split into **5 independent deployable applications** (3 backend services + 2 frontend apps) with clear separation of concerns:

#### 1. **pms-api** Application (Port 3000)
**Purpose**: REST API server for dashboard frontend
- **Current Services Migrated**: 
  - DashboardAPIService → REST Controllers
  - Portfolio calculation queries → Portfolio API endpoints
  - Fee calculation queries → Fees API endpoints  
  - Transfer history queries → Transfers API endpoints
- **Responsibilities**: 
  - Serve dashboard API endpoints
  - Portfolio/shareclass data queries
  - Fee calculation endpoints  
  - Transfer history APIs
  - Authentication & authorization
- **NestJS Patterns**: Controllers, DTOs, Guards, Interceptors
- **Deployment**: Horizontal scaling for API load

#### 2. **pms-data-fetch** Application (Background Service)
**Purpose**: Background data processing and calculations
- **Current Services Migrated**:
  - HRPFeeIngestionService → HRP data fetching module
  - HRPTransferService → Transfer processing module  
  - HRPAccountProcessorService → Account sync module
  - TradingAccountTransferService → Trading account sync (legacy)
  - PortfolioCalcService → Portfolio calculation jobs
  - CronjobService → Job orchestration
- **Responsibilities**:
  - Fetch data from HRP/1Token APIs
  - Process portfolio calculations
  - Handle cron job scheduling  
  - Data ingestion pipeline
  - Background processing
- **NestJS Patterns**: Cron decorators, Queue processors, Background services
- **Deployment**: Resource-intensive, batch processing optimized

#### 3. **pms-admin-api** Application (Port 3001)  
**Purpose**: Administrative API server for system management
- **New Capabilities**:
  - System health monitoring APIs
  - Background job control and monitoring APIs
  - Portfolio configuration management APIs
  - User management APIs (if needed)
  - Data export/import APIs
  - System diagnostics APIs
- **Responsibilities**:
  - Admin dashboard backend APIs
  - System health monitoring endpoints
  - Job control endpoints (start/stop/restart)
  - Configuration management endpoints
  - Data export/import endpoints
- **NestJS Patterns**: Admin controllers, Management services
- **Deployment**: Minimal resources, internal access

#### 4. **pms-dashboard** Application (Frontend)
**Purpose**: Main portfolio management dashboard (React/Next.js)
- **Current Code Migrated**:
  - packages/dashboard/ → pms-dashboard app
  - Shared components → libs/ui-components/
  - Utilities → libs/frontend-utils/
- **Responsibilities**:
  - Portfolio data visualization
  - Fee calculation displays
  - Transfer history views
  - Real-time data dashboard
  - User authentication UI
- **Technology**: React/Next.js with TypeScript
- **Deployment**: Static hosting or SSR

#### 5. **pms-admin-portal** Application (Frontend)
**Purpose**: Administrative interface for system management
- **New Frontend App**:
  - System health monitoring UI
  - Background job control interface
  - Portfolio configuration management UI
  - Data export/import interface
  - System diagnostics dashboard
- **Responsibilities**:
  - Admin dashboard frontend
  - Job monitoring and control UI
  - Configuration management interface
  - System health visualization
  - Data management tools
- **Technology**: React/Next.js with TypeScript
- **Deployment**: Internal access, minimal resources

### Technology Stack Upgrades

#### Core Framework
- **Backend Framework**: NestJS with Express (can be upgraded to Fastify adapter)
- **Architecture Pattern**: Clean Architecture + Domain-Driven Design
- **Communication**: REST APIs with GraphQL Federation for complex queries
- **Authentication**: JWT with refresh token strategy

#### Database & Persistence
- **ORM**: Enhanced Prisma integration with NestJS
- **Connection**: Prisma connection pooling
- **Migration**: Gradual schema migration
- **Caching**: Redis integration for performance optimization

#### API & Communication
- **API Gateway**: NestJS API Gateway with rate limiting
- **Documentation**: OpenAPI/Swagger with comprehensive docs
- **Validation**: class-validator with DTOs
- **Serialization**: class-transformer for response formatting

#### Testing & Quality
- **Unit Testing**: Jest with NestJS testing utilities
- **Integration Testing**: Supertest with test database
- **E2E Testing**: Jest + TestContainers for database testing
- **Code Quality**: ESLint, Prettier, Husky pre-commit hooks

## Implementation Strategy (Multi-App Architecture)

### Phase 1: NestJS Multi-App Foundation (1-2 weeks)
1. **Project Setup**
   - Create NestJS multi-app structure alongside existing backend
   - Setup nest-cli.json for 3 applications (pms-api, pms-data-fetch, pms-admin)
   - Configure workspace dependencies and build configuration

2. **Shared Libraries Migration**
   - Migrate packages/db/ → libs/database/ (with NestJS enhancements)
   - Migrate packages/api-client/ → libs/external-apis/ (with NestJS modules)
   - Migrate packages/common/ → libs/common/ (with NestJS patterns)
   - Create libs/business-logic/ (migrate backend/src/services/)
   - Create libs/api-types/ (shared DTOs and interfaces)
   - Extract libs/ui-components/ from packages/dashboard/
   - Create libs/frontend-utils/ (frontend shared utilities)

3. **Basic App Scaffolding**
   - Setup basic structure for all 5 apps (3 backend + 2 frontend)
   - Configure main.ts and app.module.ts for backend apps
   - Configure Next.js setup for frontend apps  
   - Setup different ports and basic health checks
   - Configure workspace dependencies between apps and libs

### Phase 2: pms-data-fetch Application (2-3 weeks)

#### Week 1: Background Service Foundation
- **Setup Data Fetch App Structure**
  - Background service with no HTTP server
  - Configure cron job scheduling (NestJS @nestjs/schedule)
  - Setup job orchestration module
- **Migrate HRP Integration**
  - HRPFeeIngestionService → hrp-ingestion module
  - HRPTransferService → transfers module  
  - HRPAccountProcessorService → hrp-ingestion module
- **Preserve @acpms/api-client integration**

#### Week 2: Portfolio Calculations
- **Migrate Portfolio Calculations**
  - PortfolioCalcService → calculations module
  - Preserve complex calculation logic and cumulative approach
  - Maintain strict chain validation and PnL calculations
- **Setup Background Job Processing**
  - Convert CronjobService → scheduler module
  - Migrate all cron runners to NestJS background tasks

#### Week 3: Transfer Processing & Legacy Support
- **Migrate Transfer Services**
  - TradingAccountTransferService → transfers module (legacy support)
  - Preserve FUNDING account filtering logic
  - Maintain hardcoded account prefix support for testing
- **Integration Testing**
  - Test complete data pipeline (fetch → process → calculate → store)
  - Validate background job scheduling works correctly

### Phase 3: pms-api Application (2-3 weeks)

#### Week 1: REST API Foundation
- **Setup API App Structure**
  - HTTP server on port 3000
  - Configure CORS, validation pipes, global error handling
  - Setup authentication/authorization framework
- **Migrate Core API Endpoints**
  - DashboardAPIService routes → NestJS Controllers
  - Portfolio data endpoints
  - ShareClass endpoints

#### Week 2: Business Logic APIs
- **Fee Calculation APIs**
  - CIPFeeService queries → fees module controllers
  - PortfolioFeeService aggregation → fees endpoints
  - Preserve currency conversion in API responses
- **Transfer History APIs**
  - Transfer query endpoints
  - Account transfer history
  - Real-time transfer status

#### Week 3: API Completion & Testing
- **Complete API Migration**
  - **Maintain exact API compatibility** for dashboard frontend
  - Setup DTOs, validation, and response formatting
  - Error handling and status codes
- **API Integration Testing**
  - Test all endpoints with existing dashboard
  - Performance testing vs current Fastify implementation
  - Load testing for dashboard usage patterns

### Phase 4: pms-admin-api Application (1-2 weeks)

#### Week 1: Admin API Setup
- **Setup Admin API Structure**
  - HTTP server on port 3001
  - Admin-specific authentication/authorization
  - System health monitoring endpoints
- **Job Control API**
  - Background job status monitoring endpoints
  - Job control endpoints (start/stop/restart)
  - Job execution history and logs APIs

#### Week 2: Management API Features
- **System Administration APIs**
  - Portfolio configuration management endpoints
  - System diagnostics and health check APIs
  - Data export/import API endpoints
- **User Management APIs** (if needed)
  - User account management endpoints
  - Permission management APIs
  - Access control endpoints

### Phase 5: Frontend Applications (2-3 weeks)

#### Week 1: pms-dashboard Migration
- **Dashboard App Setup**
  - Migrate packages/dashboard/ to apps/pms-dashboard/
  - Extract shared components to libs/ui-components/
  - Setup Next.js with TypeScript configuration
- **API Integration**
  - Configure API client to connect to pms-api
  - Migrate existing API calls and data fetching
  - Implement authentication integration

#### Week 2: pms-admin-portal Development
- **Admin Portal Setup**
  - Create new React/Next.js app for admin interface
  - Setup admin-specific UI components
  - Configure API client to connect to pms-admin-api
- **Admin Features Implementation**
  - System health monitoring UI
  - Job control and monitoring interface
  - Portfolio configuration management UI

#### Week 3: Frontend Integration & Testing
- **Complete Frontend Migration**
  - Finalize shared component extraction
  - Test both frontend applications
  - Implement responsive design and accessibility
- **End-to-End Testing**
  - Test complete user workflows
  - API integration testing
  - Cross-browser compatibility testing

### Phase 6: Production Migration & Deployment (1-2 weeks)

#### Week 1: Deployment Preparation
- **Docker & Orchestration**
  - Create Dockerfiles for all 5 applications
  - Setup docker-compose for local development
  - Configure Kubernetes manifests for production
- **Monitoring & Observability**
  - Setup logging for all applications
  - Configure health checks and monitoring
  - Setup alerting for critical failures

#### Week 2: Production Cutover
- **Parallel Deployment**
  - Deploy all 5 applications alongside current system
  - Configure load balancers and service discovery
  - Database migration validation
- **Gradual Cutover**
  - Start with pms-data-fetch (least risky)
  - Switch pms-api with feature flags
  - Deploy pms-dashboard to replace existing frontend
  - Enable pms-admin-api and pms-admin-portal for admin users
  - Monitor performance and stability

## Migration Strategy Details

### Service-by-Service Migration Approach

#### 1. Dual-System Operation
- Run both old and new systems in parallel
- Use feature flags to route traffic
- Gradual traffic migration

#### 2. Data Synchronization
- Implement dual-write patterns during transition
- Data validation and consistency checks
- Rollback capabilities

#### 3. API Compatibility
- Maintain API compatibility during migration
- Implement adapter pattern for API changes
- Versioned APIs for breaking changes

### Service Dependencies Mapping

```typescript
// Current Dependencies (to be migrated)
PortfolioCalcService -> [database, redis, external_apis]
PortfolioFeeService -> [PortfolioCalcService, database]
TradingAccountFeeService -> [database, external_apis]
HRPFeeIngestionService -> [external_apis, database]
DashboardAPIService -> [all_calculation_services]

// New Dependencies (NestJS modules)
PortfolioModule -> [DatabaseModule, CacheModule, ConfigModule]
TradingModule -> [DatabaseModule, PortfolioModule, ConfigModule]
RiskModule -> [DatabaseModule, ExternalAPIModule, ConfigModule]
FeeModule -> [PortfolioModule, TradingModule, DatabaseModule]
SchedulerModule -> [all_domain_modules]
```

## Technical Implementation Details

### 1. Service Architecture Pattern

```typescript
// Example: Portfolio Module Structure
@Module({
  imports: [
    DatabaseModule,
    CacheModule,
    ConfigModule
  ],
  controllers: [PortfolioController],
  providers: [
    PortfolioService,
    PortfolioRepository,
    PortfolioCalculationService,
    PortfolioFeeService
  ],
  exports: [PortfolioService]
})
export class PortfolioModule {}

// Service Implementation
@Injectable()
export class PortfolioService {
  constructor(
    private readonly repository: PortfolioRepository,
    private readonly calculationService: PortfolioCalculationService,
    private readonly feeService: PortfolioFeeService
  ) {}
  
  async calculatePortfolioMetrics(portfolioId: string): Promise<PortfolioMetrics> {
    const portfolio = await this.repository.findById(portfolioId);
    return this.calculationService.calculate(portfolio);
  }
}
```

### 2. Database Integration Pattern

```typescript
// Enhanced Database Module
@Module({
  providers: [
    {
      provide: 'DATABASE_CONNECTION',
      useFactory: async (config: ConfigService) => {
        return new PrismaClient({
          datasources: {
            db: {
              url: config.get('DATABASE_URL')
            }
          }
        });
      },
      inject: [ConfigService]
    }
  ],
  exports: ['DATABASE_CONNECTION']
})
export class DatabaseModule {}

// Repository Pattern
@Injectable()
export class PortfolioRepository {
  constructor(
    @Inject('DATABASE_CONNECTION') private prisma: PrismaClient
  ) {}
  
  async findById(id: string): Promise<Portfolio | null> {
    return this.prisma.portfolio.findUnique({
      where: { id },
      include: {
        holdings: true,
        transactions: true
      }
    });
  }
}
```

### 3. Configuration Management

```typescript
// Configuration Schema
export class AppConfig {
  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;
  
  @IsString()
  @IsNotEmpty()  
  REDIS_URL: string;
  
  @IsNumber()
  @Min(3000)
  @Max(65535)
  PORT: number;
}

// Module Configuration
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: AppConfig
    })
  ]
})
export class AppModule {}
```

## Risk Mitigation

### Technical Risks
1. **Service Compatibility**: Maintain API contracts during migration
2. **Data Consistency**: Implement dual-write with validation
3. **Performance**: Load testing before production deployment
4. **Dependencies**: Gradual migration to avoid breaking changes

### Business Risks  
1. **Downtime**: Blue-green deployment strategy
2. **Data Loss**: Comprehensive backup and rollback procedures
3. **Feature Regression**: Extensive testing and validation
4. **User Impact**: Gradual rollout with user feedback collection

## Success Metrics

### Technical Metrics
- **API Response Time**: < 200ms for 95th percentile
- **System Availability**: 99.9% uptime
- **Error Rate**: < 0.1% of requests
- **Test Coverage**: > 85% for critical business logic

### Business Metrics  
- **Migration Success**: 100% feature parity
- **User Satisfaction**: Maintain or improve user experience
- **Development Velocity**: Improved developer productivity
- **Maintenance Cost**: Reduced maintenance overhead

## Key Migration Principles

### 1. Preserve Business Logic
- **Exact calculation preservation**: Portfolio calculation logic with cumulative approach
- **Fee aggregation logic**: Currency conversion and multi-source fee calculation
- **Transfer processing**: Account transfer logic between different account types
- **Data pipeline integrity**: Maintain fetch → process → calculate → serve workflow

### 2. Maintain API Compatibility  
- **Dashboard API**: Preserve exact REST endpoints for frontend compatibility
- **Response formats**: Maintain existing JSON response structures
- **Error handling**: Preserve error response patterns

### 3. Database Integration
- **Schema preservation**: Use existing Prisma schema without changes
- **Connection management**: Enhance connection pooling with NestJS patterns
- **Transaction handling**: Preserve complex transaction logic

### 4. External API Integration
- **Preserve @acpms/api-client**: Reuse existing 1Token and HRP client libraries
- **Rate limiting**: Maintain existing API call patterns and error handling
- **Caching strategies**: Preserve Redis caching where implemented

## Timeline Summary (Multi-App Architecture)

| Phase | Duration | Key Deliverables |
|-------|----------|------------------|
| Multi-App Foundation | 1-2 weeks | NestJS multi-app structure, libs/ migration, basic scaffolding |
| pms-data-fetch App | 2-3 weeks | Background service, HRP ingestion, portfolio calculations |
| pms-api App | 2-3 weeks | REST API server, dashboard compatibility, business logic APIs |
| pms-admin-api App | 1-2 weeks | Admin API server, job control APIs, system management |
| Frontend Applications | 2-3 weeks | pms-dashboard migration, pms-admin-portal development |
| Production Deployment | 1-2 weeks | Docker deployment, monitoring, gradual cutover |

**Total Estimated Duration**: 9-15 weeks (2-4 months)

### Migration Strategy: Clean Slate with libs/ Organization

Since the project is not yet in production, we can implement a **clean-slate migration strategy**:

1. **Phase 1**: Setup new NestJS structure with `libs/` containing all shared code
2. **Phase 2-4**: Migrate backend services with NestJS enhancements
3. **Phase 5**: Migrate frontend applications with shared component libraries
4. **Phase 6**: Complete cutover and remove old `packages/` directory

This approach allows us to:
- Optimize the architecture without backward compatibility constraints
- Implement NestJS best practices from the ground up
- Create a more maintainable and scalable codebase
- Leverage modern development patterns and tooling

## Service Distribution Summary

### **Current → New Mapping**

#### **pms-data-fetch** (Background Processing)
- ✅ **HRPFeeIngestionService** → hrp-ingestion module
- ✅ **HRPTransferService** → transfers module  
- ✅ **HRPAccountProcessorService** → hrp-ingestion module
- ✅ **TradingAccountTransferService** → transfers module (legacy support)
- ✅ **PortfolioCalcService** → calculations module
- ✅ **CronjobService** → scheduler module

#### **pms-api** (REST API Server)
- ✅ **DashboardAPIService** → REST controllers
- ✅ **Portfolio queries** → portfolio endpoints
- ✅ **Fee queries** → fees endpoints
- ✅ **Transfer queries** → transfers endpoints
- ✅ **ShareClass queries** → shareclass endpoints

**pms-admin-api** (Admin API Server)
- ✅ **System health monitoring** → health module
- ✅ **Job control and monitoring** → job-control module
- ✅ **Portfolio configuration** → portfolio-mgmt module
- ✅ **Data export/import** → data-export module

#### **Frontend Applications Migration**

**pms-dashboard** (Main Dashboard)
- ✅ **packages/dashboard/** → pms-dashboard app
- ✅ **Shared components** → libs/ui-components/
- ✅ **Frontend utilities** → libs/frontend-utils/
- ✅ **API integration** → connect to pms-api

**pms-admin-portal** (Admin Interface)
- ✅ **New admin frontend** → pms-admin-portal app
- ✅ **Admin UI components** → libs/ui-components/
- ✅ **System management interface** → connect to pms-admin-api

#### **Shared Libraries Migration**

**packages/ → libs/ Migration**
- ✅ **packages/common/** → libs/common/ (with NestJS enhancements)
- ✅ **packages/db/** → libs/database/ (with NestJS module wrappers)
- ✅ **packages/api-client/** → libs/external-apis/ (with NestJS integration)
- ✅ **backend/src/services/** → libs/business-logic/ (core business services)
- ✅ **New libs/api-types/** → shared DTOs and interfaces
- ✅ **Dashboard components** → libs/ui-components/ (React components library)

## Success Criteria

### Technical Success
- ✅ All existing business logic preserved
- ✅ API compatibility maintained for dashboard frontend  
- ✅ Performance equivalent or better than current system
- ✅ All scheduled jobs working correctly
- ✅ Database operations maintain accuracy

### Business Success
- ✅ Zero downtime migration
- ✅ All portfolio calculations accurate
- ✅ Fee calculations correct
- ✅ Data pipeline operational
- ✅ Dashboard functionality preserved

## Conclusion

This migration plan provides a comprehensive roadmap for modernizing the annamite-pms system using NestJS best practices with a clean libs/ organization structure. The gradual migration approach minimizes risk while ensuring all business functionality is preserved and enhanced.

### Key Architecture Principles

1. **Clean Separation**: All shared code lives in `libs/` with clear separation of concerns
2. **Breaking Changes Acceptable**: Since the system is not yet in production, we can optimize for better long-term maintainability
3. **Monorepo Benefits**: Shared libraries enable code reuse across all 5 applications
4. **NestJS Enhancements**: Existing packages gain NestJS patterns (modules, services, dependency injection)
5. **Frontend Integration**: Both dashboard and admin interfaces share common UI components

### Migration Benefits

- **Developer Experience**: Better TypeScript integration, hot reloading, and debugging
- **Scalability**: Independent deployment and scaling of 5 specialized applications
- **Maintainability**: Shared libraries reduce code duplication and improve consistency
- **Testing**: Enhanced testing capabilities with NestJS testing utilities
- **Documentation**: Auto-generated API documentation with OpenAPI/Swagger

The new architecture will provide better maintainability, scalability, and developer experience while maintaining the robust financial calculations and service reliability the system currently provides.