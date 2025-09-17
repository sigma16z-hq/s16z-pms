# Plan & Review Workflow Setup Plan

## Objective
Establish a clear repository workflow describing how developers and agents should coordinate work (planning, approvals, updates) per the requested "Plan & Review" structure.

## High-Level Approach
1. Understand the current contributor guidance to ensure the new workflow complements existing docs.
2. Design a concise workflow section capturing before/after work expectations, planning artifacts, and update cadence.
3. Implement the workflow documentation in a discoverable location (either update `AGENTS.md` or introduce a dedicated workflow doc referenced from contributor guides).
4. Verify references and instructions stay consistent with repository tooling (Vitest mention, plan storage path, etc.).

## Tasks
1. **Review existing guidance**
   - Re-read `AGENTS.md` and any other onboarding docs mentioning process expectations.
   - Reasoning: prevents conflicting instructions and highlights where the workflow info should live.

2. **Outline the Plan & Review workflow**
   - Translate the provided bullet list into structured subsections (Before Starting Work, While Implementing, etc.).
   - Ensure language covers plan file location (`/tasks`), planning requirements, MVP mindset, research expectations, and update cadence.
   - Reasoning: aligns user requirements with concise, actionable documentation.

3. **Decide documentation placement**
   - Evaluate adding a new "Plan & Review Workflow" section within `AGENTS.md` versus creating `WORKFLOW.md` with a reference in `AGENTS.md`.
   - Choose the option that keeps guidelines cohesive without overloading existing sections.
   - Reasoning: maintain clarity and avoid burying critical instructions.

4. **Implement documentation changes**
   - Update the chosen file(s) with the finalized workflow content, using markdown headings consistent with the rest of the guide.
   - Include brief rationale/reminders (e.g., “Ask for plan approval before proceeding”).
   - Ensure references to testing commands remain accurate after Vitest switch.
   - Reasoning: delivers the actionable workflow to contributors.

5. **Self-review and handover notes**
   - Re-read the updated docs for tone, accuracy, and word economy.
   - Summarize changes in the task log (and within this plan file if needed) so future contributors understand what was done and why.
   - Reasoning: supports continuity for subsequent tasks.

## Open Questions / Assumptions
- Assume `AGENTS.md` is the primary contributor guide and acceptable location for workflow instructions unless otherwise directed.
- Assume no automation needs to enforce the workflow; this is purely documentation.

## Execution Notes
- Reviewed `AGENTS.md` to confirm existing structure and identify where a workflow section fits without conflicting messaging.
- Added a "Plan & Review Workflow" section to `AGENTS.md`, covering planning expectations, `/tasks` storage, approval pauses, and ongoing updates during implementation.
- Tightened existing sections in `AGENTS.md` (structure, commands, style, testing, PR, environment) to keep the document within the desired 200–400 word range after adding the new workflow guidance.
- Introduced a "Test-Driven Development Workflow" section and trimmed adjacent guidance so the document remains a single, concise source of execution practices.
