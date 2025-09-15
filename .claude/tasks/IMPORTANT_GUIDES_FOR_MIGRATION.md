### Purpose

Migrate the old full of self implement framework project to use a modern better and well maintained framework to help us to do the project better.

From: /root/workspace/annimate-pms
To: /root/workspace/s16z-pms

#### Key Requirements

Understand the business logic - Don't just copy code, understand and refactor it properly
Use NestJS patterns - Follow NestJS best practices for everything
Well-organized structure - Clean separation of concerns
Industry standards - Use well-maintained packages, no custom framework code

### Which one is important and which are not?

#### Important:

You should keep this part's business logic like a human, understand and refactor them in a better way for maintaining them.

1. The client we have done for integrate 3rd party, that part we need to maintain.
2. Calculation logic we have done in the backend packages.
3. Database Design is also important

Overall it's api-client, backend, and database, i want you to take care of these things, you can draft a plan to migrate those files specially. And currently we only integrate with 1token and hrp, and then based on the data to do some calculation, that's all, don't make things complicated.

#### Unimportant:

You have the right to not migrating them to the new project.

1. The tools that related to the IOC framework.
2. Toosl related to the scheduler job.
3. Anything not important.

### Things we want to refactor

1. IOC implementation, we want use the nestjs way to do that
2. Scheduler job changed also to use nestjs way to do
3. Logging also replaced to use nestjs/common - logger
4. Better manager the project in a well organized structure
5. Logging tools

Basically, if we rely on anything, we should search and find the best practice in nestjs and using that.

Change the old project's self implementation to use a better well-known in the industry implementation way to do that.

### Framework Replacements (Required)

Current Self-Implementation Replace With NestJS Way
Custom IoC Container @nestjs/core (Dependency Injection)
Custom Scheduler @nestjs/schedule
Custom Logger @nestjs/common Logger
Config Management @nestjs/config
Custom Validation class-validator + class-transformer

_Principle: Search and use NestJS best practices for any framework needs. No more self-implementation._

### Migration Strategy

We can do this one layer by layer.

1. Database part
2. 3rd party data source integration
3. Scheduler job to fetch those data and do the calculation
4. Api layer for the Frontend

### Expected NestJS Structure

```
annamite-pms-nestjs/
├── apps/                          # 🚀 DEPLOYABLE APPLICATIONS
│   │
│   ├── pms-service-fetch/            # Background data processing service (In the future)
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── hrp/ # HRP data fetching
│   │   │   │   ├── onetoken/      # 1Token data fetching
│   │   │   │   ├── calculations/  # Portfolio calculations
│   │   │   │   ├── transfers/     # Transfer processing
│   │   │   │   └── scheduler/     # Cron job orchestration
│   │   │   ├── main.ts           # Background service bootstrap
│   │   │   └── app.module.ts     # Root module
│   │   ├── Dockerfile
│   │   └── package.json
│   │
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
│
├── nest-cli.json                # NestJS multi-app configuration
├── package.json                 # Root package.json with workspace deps
└── tsconfig.json               # Root TypeScript config
```
