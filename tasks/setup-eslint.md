# ESLint Enablement Plan

## Objective
Install and configure ESLint (with TypeScript support) so `pnpm lint` runs successfully from the repository root, giving agents early static feedback.

## Steps
1. **Assess existing tooling**
   - Confirm lint scripts in `package.json` and check for any legacy configs.
   - Reasoning: ensures new tooling aligns with current commands and avoids duplicates.

2. **Install dependencies and add config**
   - Add dev dependencies: `eslint`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`, `eslint-config-prettier`.
   - Create `.eslintrc.cjs` tuned for Nest + TypeScript, disable noisy rules (`no-explicit-any`, unused vars with underscore) to match current code style.
   - Add `.eslintignore` covering build artifacts (`dist`, `coverage`) if absent.
   - Reasoning: provides a maintainable lint stack that matches the repository's formatters.

3. **Verify lint command**
   - Run `pnpm lint` and address any lint errors (either fix code automatically or tune config sensibly).
   - Capture the result and note follow-ups (e.g., if warnings remain) in this plan for future handoffs.

## Assumptions & Considerations
- Node 22+ and pnpm 9 are available (per repo engines).
- No existing ESLint config conflicts need preservation.
- Prefer non-destructive fixes; if automated fixes touch many files, review before finalising.

## Execution Notes
- Added devDependencies (`eslint@8.57.0`, `@typescript-eslint/*@7.8.0`, `eslint-config-prettier@9.1.0`) at the workspace root.
- Created `.eslintrc.cjs` with TypeScript-focused defaults, disabling `no-explicit-any` and ignoring unused vars prefixed with `_`; added `.eslintignore` (dist, coverage, node_modules, `**/*.d.ts`).
- `pnpm lint` now runs successfully (exit 0); current output surfaces only warnings for unused HRP domain types, which remain for future cleanup if desired.
