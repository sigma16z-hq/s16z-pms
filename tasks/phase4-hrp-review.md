# Phase 4 HRP Account Follow-up Plan

## Objective
Understand the Phase 4 guidance located under `.claude/tasks/phase4`, ensure the HRP account implementation aligns with it, add the missing automated tests, and apply any necessary refactors to keep the code maintainable.

## Research & Context
- Re-read the Phase 4 documentation (overview, service matrices, and account-specific notes) to confirm desired behaviours and data flows.
- Inspect current HRP account modules in `apps/pms-service/src/accounts` and related libs, noting existing test coverage gaps.
- Identify where tests should live (unit vs e2e) and prerequisites (mocks, seed data).

## Planned Tasks
1. **Document Review & Summary**
   - Read all markdown files in `.claude/tasks/phase4`, paying special attention to the `accounts/` subdirectory.
   - Summarize the expectations for HRP account services (sync jobs, classification rules, data sources).
   - Reasoning: ensures implementation work lines up with business requirements.

2. **Code & Test Gap Analysis**
   - Explore HRP account services/controllers to catalog current functionality.
   - Locate existing specs (if any) and determine missing scenarios (e.g., sync handling, error cases, classification logic).
   - Prepare a test outline (unit/e2e) specifying fixtures, mocks, and assertions.
   - Reasoning: targeted testing avoids redundant coverage and keeps focus on the missing pieces.

3. **Implementation & Refactor**
   - Add or refactor code as required to make the system testable (dependency injection, modular helpers, etc.).
   - Implement the planned tests using Vitest (unit) or the e2e harness, prefer deterministic fixtures/mocks over live calls.
   - Ensure structure matches repo conventions (`*.spec.ts` near source, `*.e2e-spec.ts` under test directories).
   - Reasoning: delivers both stability improvements and confidence in behaviour.

4. **Validation & Documentation**
   - Run `pnpm test` (and targeted commands if needed) to verify the new tests.
   - Update any relevant docs or inline comments to reflect new behaviours.
   - Capture changes and outstanding questions in this plan or a task note for future contributors.

## Assumptions
- The HRP account domain already has partial implementation and will not require major architectural rewrites.
- Tests will run locally via Vitest without additional infrastructure beyond existing Docker services.
- No new external dependencies are required.

## Pending Questions / Resolutions
- Edge cases emphasised in Phase 4 docs? → None explicitly called out; cover core behaviours surfaced during review.
- Repository vs mock coverage? → Prefer integration tests that exercise Prisma-backed repositories for baseline correctness. Services should receive comprehensive scenario tests that document data flow, and controllers still deserve small expectations to ensure the API surface behaves as intended.

## Execution Notes
- Reviewed `.claude/tasks/phase4` (overview, service matrix, accounts migration) to confirm required HRP flows and classification rules.
- Added PostgreSQL-backed Vitest specs using Testcontainers at `apps/pms-service/src/accounts/services/hrp-account-processor.service.spec.ts` to cover trading/basic/triparty persistence, malformed-account handling, and multi-share-class transaction behaviour.
- Introduced Testcontainers dependencies and lengthened Vitest timeouts so containers can start reliably; the suite runs via `pnpm test` and documents data flow for future contributors.
