# Decouple Guided Agent Creation Workflow From `src/app/page.tsx`

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

The source-of-truth planning guide for this repository is `.agent/PLANS.md`, and this document must be maintained in accordance with `.agent/PLANS.md`.

## Purpose / Big Picture

After this change, users will still create agents, see pending guided setup cards when setup fails, and retry or discard pending setup exactly as they do now, but the workflow policy will live in a dedicated operations module instead of being spread across `src/app/page.tsx`. The visible behavior stays stable while the code becomes testable without mounting the full page. You can see it working by running the guided-creation unit tests, then using the Studio UI to create an agent on both local and remote gateway modes and observing the same pending/retry behavior.

## Progress

- [x] (2026-02-13 04:24Z) Identified the highest-impact entanglement and scoped the extraction boundary around guided create + pending setup retry. [bd-1io]
- [x] (2026-02-13 04:25Z) Created Beads milestones and dependencies for this plan (`bd-1io` -> `bd-311` -> `bd-3cv`). [bd-1io]
- [x] (2026-02-13 04:28Z) Implemented Milestone 1: added `guidedCreateWorkflow` module and passing unit tests for local/remote pending semantics. [bd-1io]
- [x] (2026-02-13 04:30Z) Implemented Milestone 2: routed create/retry handlers in `src/app/page.tsx` through workflow module and added integration tests. [bd-311]
- [x] (2026-02-13 04:31Z) Implemented Milestone 3: added regression integration tests and updated architecture boundary documentation. [bd-3cv]
- [x] (2026-02-13 04:32Z) Ran final verification test bundle (22 tests passed) and executed `br sync --flush-only`. [bd-3cv]

## Surprises & Discoveries

- Observation: The repository already has a partially extracted create operation (`createAgentWithOptionalSetup`) that is not used by the main UI path.
  Evidence: `src/features/agents/operations/createAgentOperation.ts` exports `createAgentWithOptionalSetup`, while `src/app/page.tsx` runs a separate inline create/setup/retry flow.

- Observation: The entangled file has very high change frequency, increasing regression risk for any feature touching creation behavior.
  Evidence: `git rev-list --count HEAD -- src/app/page.tsx` returned `156`.

- Observation: Repository-wide `npm run typecheck` currently fails on pre-existing unrelated files.
  Evidence: `tsc --noEmit` reported errors in `src/features/agents/state/transcript.ts` and `tests/unit/gatewayProxy.test.ts` during Milestone 1 verification.

- Observation: Extracting UI completion mapping into workflow helpers reduced message-string duplication and made integration tests deterministic.
  Evidence: `resolveGuidedCreateCompletion` now centralizes pending error message generation consumed by `src/app/page.tsx` and `tests/unit/guidedCreateWorkflow.integration.test.ts`.

## Decision Log

- Decision: Extract workflow orchestration into a dedicated operations module rather than introducing a new global store.
  Rationale: This gives an immediate boundary between policy and infrastructure with minimal UI architecture churn.
  Date/Author: 2026-02-13 / Codex

- Decision: Preserve all current user-visible semantics, including local-vs-remote setup handling and pending setup storage behavior.
  Rationale: The goal is boundary separation and testability, not feature redesign.
  Date/Author: 2026-02-13 / Codex

- Decision: Track milestones with Beads and enforce milestone dependencies.
  Rationale: The repository already uses Beads, and milestone dependencies reduce accidental out-of-order execution.
  Date/Author: 2026-02-13 / Codex

- Decision: Continue milestone verification with targeted tests while treating current typecheck failures as out-of-scope baseline issues.
  Rationale: The failures are in untouched files and block strict typecheck green without unrelated refactoring.
  Date/Author: 2026-02-13 / Codex

- Decision: Keep page-level UI state updates in `src/app/page.tsx` while moving create/retry sequencing policy into workflow functions.
  Rationale: This preserves current UI behavior and minimizes migration risk while still breaking the core entanglement.
  Date/Author: 2026-02-13 / Codex

- Decision: Add architecture doc updates in the existing focused-agent module bullets rather than introducing new top-level sections.
  Rationale: This keeps documentation aligned with the current file’s organization and avoids duplicating module descriptions.
  Date/Author: 2026-02-13 / Codex

## Outcomes & Retrospective

The create/retry sequencing policy is now centralized in `src/features/agents/operations/guidedCreateWorkflow.ts`, and `src/app/page.tsx` consumes that workflow via side-effect adapters. Guided setup user behavior remains unchanged: pending setup is surfaced when setup fails, retry applies to the existing agent, and discard clears pending state. Regression coverage now includes workflow-level and integration-level tests under `tests/unit/guidedCreateWorkflow.test.ts` and `tests/unit/guidedCreateWorkflow.integration.test.ts`.

Remaining gap: repository-wide `npm run typecheck` is still red due to pre-existing unrelated errors outside this change scope.

## Context and Orientation

Today, the guided create flow is primarily embedded in `src/app/page.tsx`, especially around `handleCreateAgentSubmit`, pending setup persistence, auto-retry effects, and manual retry/discard callbacks. In this repository, “guided setup” means writing agent files, exec approval policy, and agent overrides after `agents.create`. A “pending guided setup” means creation succeeded but setup did not fully apply; the setup payload is persisted in session storage and surfaced in chat as a retry/discard card.

Key modules and their current responsibilities are:

- `src/app/page.tsx`: UI composition plus orchestration for create/delete/rename, pending setup persistence, auto retry, and many gateway side effects.
- `src/features/agents/operations/createAgentOperation.ts`: low-level primitives for applying setup (`applyGuidedAgentSetup`) and optional create+setup helpers.
- `src/features/agents/creation/recovery.ts`: utility functions for inserting/removing pending setup entries and applying pending setup for a known agent.
- `src/features/agents/creation/pendingSetupStore.ts`: session storage serialization/deserialization for pending setups.
- `tests/unit/createAgentOperation.test.ts`, `tests/unit/guidedSetupRecovery.test.ts`, `tests/unit/pendingGuidedSetupRetry.test.ts`: existing behavior tests for operation primitives and retry coordination.

The target boundary is: page components handle presentation and dispatch, workflow modules decide create/retry policy, and infrastructure adapters perform gateway and storage side effects.

## Milestones

### Milestone 1: Extract a dedicated guided creation workflow module

This milestone creates a new operations module that owns creation-policy sequencing and returns explicit outcomes the page can consume. The result should be deterministic tests for local and remote behavior, including setup failure fallback to pending state. No page wiring changes are required yet beyond any safe exports needed for the new module.

### Milestone 2: Replace inline page orchestration with workflow adapters

This milestone migrates `src/app/page.tsx` from inline policy logic to the workflow module while preserving all user-visible behavior. The page remains the place where UI state is updated, but decision logic for “what happens next” is delegated to workflow outputs. Completion means the create/retry branches in `page.tsx` are materially thinner and focus on view-state updates.

### Milestone 3: Add regression coverage for integration seams and document architecture

This milestone hardens tests for key edge behavior after integration (pending setup card state, retry concurrency guard, remote/local split) and updates `ARCHITECTURE.md` so future contributors understand the new boundary. Completion means reviewers can verify both behavior and architecture alignment from tests and docs alone.

## Plan of Work

First, add `src/features/agents/operations/guidedCreateWorkflow.ts` with a dependency-injected API that accepts infrastructure callbacks (`createAgent`, `applySetup`, `upsertPending`, `removePending`) and returns structured outcomes (`applied`, `pending`, `error`) without touching React state directly. Keep low-level gateway calls in existing modules (`createAgentOperation.ts`, `agentConfig.ts`, `recovery.ts`) and compose them through explicit dependencies.

Next, update `src/app/page.tsx` so `handleCreateAgentSubmit` and `applyPendingCreateSetupForAgentId` call the new workflow functions. Keep page-local concerns in place (modal open/close, selected agent, error banners), but remove duplicated local-vs-remote branching and duplicated pending setup mutation logic from inline blocks. Preserve existing retry guards (`pendingSetupAutoRetryInFlightRef`, busy agent checks) while routing the actual setup attempt through workflow results.

Finally, expand tests to cover the new workflow contract and integrated handlers, then update `ARCHITECTURE.md` to describe the boundary as “workflow policy in operations module, side effects in adapters, rendering in page.”

## Concrete Steps

1. From `/Users/georgepickett/openclaw-studio`, claim Milestone 1 and create failing tests first.

    br ready --json
    br update bd-1io --claim --json
    npm run test -- tests/unit/guidedCreateWorkflow.test.ts

    Expected before implementation: Vitest reports missing module or failing assertions in the new test file.

2. Implement Milestone 1 module and make tests pass.

    npm run test -- tests/unit/guidedCreateWorkflow.test.ts
    npm run typecheck
    git add src/features/agents/operations/guidedCreateWorkflow.ts tests/unit/guidedCreateWorkflow.test.ts
    git commit -m "Milestone 1: Extract guided agent creation workflow core"
    br close bd-1io --reason "Tests pass, committed" --json

3. Claim Milestone 2, write integration-focused failing tests around page-level handler behavior or extracted adapter behavior, then wire `src/app/page.tsx` to the workflow module.

    br update bd-311 --claim --json
    npm run test -- tests/unit/guidedCreateWorkflow.integration.test.ts
    npm run test -- tests/unit/guidedSetupRecovery.test.ts tests/unit/pendingGuidedSetupRetry.test.ts

    After implementation:

    npm run test -- tests/unit/guidedCreateWorkflow.integration.test.ts tests/unit/guidedSetupRecovery.test.ts tests/unit/pendingGuidedSetupRetry.test.ts
    npm run typecheck
    git add src/app/page.tsx src/features/agents/operations/guidedCreateWorkflow.ts tests/unit/guidedCreateWorkflow.integration.test.ts
    git commit -m "Milestone 2: Route Studio create/retry flow through workflow adapters"
    br close bd-311 --reason "Tests pass, committed" --json

4. Claim Milestone 3, add regression coverage and update architecture docs.

    br update bd-3cv --claim --json
    npm run test -- tests/unit/guidedCreateWorkflow.test.ts tests/unit/guidedCreateWorkflow.integration.test.ts tests/unit/createAgentOperation.test.ts tests/unit/guidedSetupRecovery.test.ts
    npm run typecheck
    git add ARCHITECTURE.md tests/unit/guidedCreateWorkflow.integration.test.ts tests/unit/guidedCreateWorkflow.test.ts
    git commit -m "Milestone 3: Harden guided-creation regressions and document architecture boundary"
    br close bd-3cv --reason "Tests pass, committed" --json

5. Final verification and Beads flush.

    npm run test -- tests/unit/createAgentOperation.test.ts tests/unit/guidedSetupRecovery.test.ts tests/unit/pendingGuidedSetupRetry.test.ts tests/unit/guidedCreateWorkflow.test.ts tests/unit/guidedCreateWorkflow.integration.test.ts
    npm run typecheck
    br sync --flush-only

## Validation and Acceptance

Milestone 1 verification workflow:

1. Tests to write first in `tests/unit/guidedCreateWorkflow.test.ts`:
   `it("returns applied outcome for local gateway when setup succeeds")` must assert that pending setup mutations are not requested and the returned status is `applied`.
   `it("returns pending outcome for local gateway when setup fails")` must assert that setup error is surfaced and `upsertPending` is requested for the created agent.
   `it("returns pending outcome for remote gateway and keeps created agent id")` must assert that remote behavior marks setup pending and does not require immediate setup success.
   `it("rejects empty agent name before any side effect")` must assert that no dependencies are called for invalid input.
2. Implementation: add `guidedCreateWorkflow.ts` with explicit input/output types and dependency injection.
3. Verification: run `npm run test -- tests/unit/guidedCreateWorkflow.test.ts` and `npm run typecheck`; all tests pass.
4. Commit: `Milestone 1: Extract guided agent creation workflow core`.

Milestone 2 verification workflow:

1. Tests to write first in `tests/unit/guidedCreateWorkflow.integration.test.ts`:
   `it("maps workflow pending outcome to pending setup map update and user error banner")` must assert page-adapter callbacks receive the same user-facing message format currently used.
   `it("maps workflow applied outcome to modal close and reload path")` must assert success path triggers reload and clears pending entry.
   `it("manual retry path uses workflow retry outcome and clears busy state")` must assert busy state cleanup happens for both success and failure.
2. Implementation: replace duplicated inline branching in `handleCreateAgentSubmit` and `applyPendingCreateSetupForAgentId` with workflow calls and thin adapter glue.
3. Verification: run `npm run test -- tests/unit/guidedCreateWorkflow.integration.test.ts tests/unit/guidedSetupRecovery.test.ts tests/unit/pendingGuidedSetupRetry.test.ts`.
4. Commit: `Milestone 2: Route Studio create/retry flow through workflow adapters`.

Milestone 3 verification workflow:

1. Tests to write first:
   extend `tests/unit/guidedCreateWorkflow.integration.test.ts` with `it("preserves pending setup entry ordering and replacement semantics across retries")` and `it("does not schedule duplicate retry when in-flight guard is set")`.
   ensure `tests/unit/createAgentOperation.test.ts` still passes to confirm low-level apply behavior unchanged.
2. Implementation: finalize edge handling and update `ARCHITECTURE.md` boundary text in the focused agent UI section.
3. Verification: run the targeted test bundle plus `npm run typecheck` and optionally `npm run lint` if touched code introduces lint-sensitive patterns.
4. Commit: `Milestone 3: Harden guided-creation regressions and document architecture boundary`.

Behavioral acceptance for the full plan:

- Creating an agent on local gateway still attempts immediate setup; if setup fails, the pending setup card appears for that agent with Retry and Discard actions.
- Creating an agent on remote gateway still retains pending setup semantics and allows retry later.
- Retrying pending setup still applies files/approvals/overrides for the existing agent and does not create a duplicate agent.
- The creation policy is no longer embedded as a long inline branch in `src/app/page.tsx`; page code primarily maps workflow results to UI state.

## Idempotence and Recovery

The workflow extraction is additive and can be repeated safely. Re-running tests is safe and required after each milestone. If a milestone fails mid-way, keep the branch, restore test pass state before proceeding, and do not close the corresponding Beads issue until tests pass and commit exists.

If workflow integration causes behavior drift, rollback to the previous milestone commit and re-apply the milestone with smaller slices (first create path only, then retry path). Do not delete pending setup session storage keys manually unless debugging corrupted local state; normal retry/discard flows should manage persistence.

## Artifacts and Notes

Expected transcript snippets during successful implementation:

    npm run test -- tests/unit/guidedCreateWorkflow.test.ts
    ✓ returns applied outcome for local gateway when setup succeeds
    ✓ returns pending outcome for local gateway when setup fails
    ✓ returns pending outcome for remote gateway and keeps created agent id
    ✓ rejects empty agent name before any side effect

    npm run typecheck
    (no output, exit code 0)

Expected architectural diff themes:

- `src/app/page.tsx` loses duplicated local/remote setup branching and direct pending-map mutation branches.
- `src/features/agents/operations/guidedCreateWorkflow.ts` becomes the single place for creation-policy sequencing.
- `ARCHITECTURE.md` explicitly names the workflow module as the boundary between policy and side-effect adapters.

## Interfaces and Dependencies

Add `src/features/agents/operations/guidedCreateWorkflow.ts` with stable exports used by page-level adapters.

The module should define these interfaces and signatures (names can vary slightly only if all tests and call sites stay aligned):

- `type GuidedCreateWorkflowDeps = { createAgent: (name: string) => Promise<{ id: string }>; applySetup: (agentId: string, setup: AgentGuidedSetup) => Promise<void>; upsertPending: (agentId: string, setup: AgentGuidedSetup) => void; removePending: (agentId: string) => void; }`
- `type GuidedCreateWorkflowInput = { name: string; setup: AgentGuidedSetup; isLocalGateway: boolean; }`
- `type GuidedCreateWorkflowResult = { agentId: string; setupStatus: "applied" | "pending"; setupErrorMessage: string | null; }`
- `async function runGuidedCreateWorkflow(input: GuidedCreateWorkflowInput, deps: GuidedCreateWorkflowDeps): Promise<GuidedCreateWorkflowResult>`

For retry path, either in same file or a sibling module:

- `type GuidedRetryDeps = { applyPendingSetup: (agentId: string) => Promise<{ applied: boolean }>; removePending: (agentId: string) => void; }`
- `async function runGuidedRetryWorkflow(agentId: string, deps: GuidedRetryDeps): Promise<{ applied: boolean }>`

Dependencies to reuse, not duplicate:

- `applyGuidedAgentSetup` from `src/features/agents/operations/createAgentOperation.ts`
- `applyPendingGuidedSetupForAgent`, `upsertPendingGuidedSetup`, `removePendingGuidedSetup` from `src/features/agents/creation/recovery.ts`
- existing retry guards from `src/features/agents/creation/pendingSetupRetry.ts`

Maintain existing error-message style for user-facing consistency.

Revision Note (2026-02-13 04:25Z, Codex): Initial plan authored from the entanglement analysis and converted into milestone-driven implementation guidance with Beads issue linkage.
Revision Note (2026-02-13 04:28Z, Codex): Marked Milestone 1 complete and recorded baseline typecheck failures plus scoped verification decision.
Revision Note (2026-02-13 04:30Z, Codex): Marked Milestone 2 complete after wiring page handlers to workflow adapters and adding integration tests.
Revision Note (2026-02-13 04:31Z, Codex): Marked Milestone 3 complete with regression tests and architecture boundary updates.
Revision Note (2026-02-13 04:32Z, Codex): Recorded final verification results and Beads flush completion.
