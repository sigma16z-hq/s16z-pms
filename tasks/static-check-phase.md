# Static Verification Phase Plan

## Objective
Introduce a post-implementation phase that helps AI agents and developers run static and automated validations immediately after submitting code changes, catching issues early and confirming they are on the correct path.

## High-Level Approach
1. Review existing guidance in `AGENTS.md` to determine the best place to document a static checking phase and understand referenced tooling (linting, formatting, tests).
2. Design a concise but prescriptive checklist for the new phase, aligning it with available commands (e.g., `pnpm lint`, `pnpm build`, `tsc --noEmit`, `pnpm test --runInBand` if useful) and clarifying intent.
3. Update `AGENTS.md` to include the new phase and ensure related sections (testing, workflow) reference it consistently.
4. Capture implementation notes in this plan file for future contributors.

## Tasks
1. **Analyze current guidance**
   - Revisit `AGENTS.md` to see where the static phase naturally fits (likely after TDD workflow and before PR guidance).
   - Reasoning: ensures the addition complements current instructions and avoids duplication.

2. **Design the static verification phase**
   - Draft a short checklist covering linting (`pnpm lint`), formatting (`pnpm format --check`), type-checking (`pnpm exec tsc --noEmit`), and build validation (`pnpm build`).
   - Consider optional extra checks such as `pnpm test --runInBand` or targeted Vitest runs (`pnpm vitest run --changed`).
   - Reasoning: gives agents actionable steps that align with existing scripts and available tooling.

3. **Integrate into documentation**
   - Update `AGENTS.md` with a new section describing the static checking phase, including when to run each command and how to interpret failures.
   - Adjust surrounding text if necessary to keep the guide concise and coherent.
   - Reasoning: ensures contributors follow a consistent process.

4. **Self-review & handover notes**
   - Proofread the updated docs for clarity and length targets.
   - Append execution notes here summarizing the changes for future maintainers.
   - Reasoning: maintains continuity for future iterations.

## Assumptions / Open Questions
- Assume static validation uses existing tooling; no new dependencies will be introduced.
- Assume the phase sits between finishing implementation and opening a PR.
- Assume `pnpm exec` is acceptable for invoking TypeScript CLI when needed.

## Execution Notes
- Positioned the static verification phase between the TDD loop and PR rules in `AGENTS.md` so the guide remains linear.
- Recommended `pnpm lint`, Prettier check via `pnpm exec`, TypeScript `--noEmit`, optional `pnpm build`, and targeted Vitest runs as the default gates.
- Rewrote `AGENTS.md` for concision while incorporating Plan & Review, TDD, and the new static check stage within the 200–400 word window.
