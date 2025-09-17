# Repository Guidelines

## Plan & Review Workflow

- **Plan first**: stay in plan mode, map an MVP with rationale and tasks (use the Task tool for research), store it as `/tasks/TASK_NAME.md`, and wait for approval before coding.
- **Work in public**: update the plan tool and file as you progress so completed work, blockers, and scope changes are obvious for handoffs.

## Project Layout

Core Nest code lives in `apps/pms-service/src`. Shared packages sit in `libs/` (`database`, `hrp-client`, `onetoken-client`, `common`). Docker assets are under `docker/`, and build artifacts land in `dist/`.

## Dev Commands

Use Node 22+ with `pnpm@9`. `pnpm install` then `pnpm dev:setup` bootstraps Docker and seeds Prisma. `pnpm start:dev` watches the service; `pnpm build` compiles. Database scripts: `pnpm db:push`, `pnpm db:migrate`, `pnpm db:seed:dev`. Restart backing services via `pnpm docker:down && pnpm docker:up` when environments drift.

## Style Expectations

Stick to TypeScript + Nest idioms: feature folders, PascalCase classes, kebab-case files. Prettier (`pnpm format`) enforces 2-space, single-quote, trailing-comma formatting; ESLint (`pnpm lint`) must pass before review.

## Testing Guidelines

Vitest powers tests. Use `pnpm test` for a full run, `pnpm test:watch` while coding, `pnpm test:cov` for coverage, and `pnpm test:e2e` for flows in `apps/pms-service/test/`. Keep `*.spec.ts` beside sources, reserve `*.e2e-spec.ts`, target ≥80% coverage, and extend Prisma seeds only when scenarios demand it.

## Test-Driven Loop

- **Red**: add a failing spec and prove it with `pnpm test:watch` (or `pnpm test:e2e`).
- **Green**: ship the minimal fix, keep the watcher running, and commit with the spec.
- **Refactor**: clean up, rerun `pnpm test` + `pnpm lint`, confirm coverage stays above target.

## Static Verification Phase

Run quick gates before PRs:

- `pnpm lint` and `pnpm exec prettier --check "apps/**/*.ts" "libs/**/*.ts"`.
- `pnpm exec tsc --noEmit` (or `pnpm build`) for type and compile errors.
- `pnpm vitest run --changed` or `pnpm test` to verify touched specs.
  Stop and fix on any failure.

## Environment Setup

Copy `.env.local.example` to `.env.local`, fill HRP/OneToken credentials. Docker exposes Postgres on `5433` and Redis on `6380`; change only on conflicts. Use `pnpm dev:reset` to rebuild containers and `pnpm db:generate` after schema updates.
