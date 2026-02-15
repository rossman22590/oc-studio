# Extract Pending Guided Setup Retry/Auto-Retry Orchestration from `src/app/page.tsx`

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository uses `.agent/PLANS.md` as the source of truth for ExecPlan requirements, and this document must be maintained in accordance with it.

## Purpose / Big Picture

Today, the main page module (`src/app/page.tsx`) still owns a reliability-critical workflow: retrying pending guided setups (manual and auto-retry) and persisting pending setups to `window.sessionStorage`. This intertwines workflow policy with infrastructure side effects (gateway calls, browser storage I/O, and React lifecycle timing) in a single module that also renders UI.

After this change, the page keeps only thin wiring. The retry/auto-retry workflow decisions and storage lifecycle logic are moved into operation modules that can be unit tested without rendering React components. You can see this working by running the new unit tests and by confirming the existing test suite still passes (`npm test`) with no user-visible behavior changes.

Non-goals:

1. Changing any user-visible behavior of guided create, pending setup retry, or auto-retry.
2. Changing the semantics of `enqueueConfigMutation` or `useGatewayRestartBlock`.
3. Refactoring the guided create submission flow (`handleCreateAgentSubmit`) in this plan. (That can be a follow-up ExecPlan.)

## Progress

- [x] (2026-02-13) Milestone 1: Extract manual pending setup retry flow into an operation module + unit tests; wire `src/app/page.tsx` to call the operation.
- [x] (2026-02-13) Milestone 2: Extract auto-retry trigger flow into an operation module + unit tests; wire `src/app/page.tsx` to call the operation.
- [x] (2026-02-13) Milestone 3: Extract sessionStorage load/persist lifecycle helpers + unit tests; wire `src/app/page.tsx` to call them; run full verification and update `ARCHITECTURE.md`.

## Surprises & Discoveries

- Observation: (none yet)
  Evidence: (n/a)

## Decision Log

- Decision: Keep this plan narrowly scoped to pending guided setup retry/auto-retry and sessionStorage persistence, leaving guided create submit orchestration for a follow-up.
  Rationale: This is the single most entangled flow remaining in `src/app/page.tsx` that is feasible to extract with low blast radius. Keeping the scope tight reduces regression risk.
  Date/Author: 2026-02-13 / Codex

## Outcomes & Retrospective

- (to be filled in when complete)

## Context and Orientation

In this repository, “guided agent creation” can leave behind a pending setup when setup apply fails or when using a remote gateway. Those pending setups are stored in tab-scoped `window.sessionStorage` and keyed by a normalized “gateway scope” string (see `src/features/agents/creation/pendingSetupStore.ts`).

When a pending guided setup exists for an agent, Studio can:

1. Retry it manually from chat, which calls a retry flow currently implemented in `src/app/page.tsx` as `applyPendingCreateSetupForAgentId`.
2. Retry it automatically after reconnect when the agent exists and conditions are safe, which is computed via `resolvePendingSetupAutoRetryIntent` (`src/features/agents/operations/agentMutationLifecycleController.ts`) and triggered from a `useEffect` in the page.

Key existing helpers used by the page today:

1. `runPendingSetupRetryLifecycle` in `src/features/agents/operations/pendingSetupLifecycleWorkflow.ts` (pure-ish retry lifecycle with error formatting/suppression policy).
2. `runGuidedRetryWorkflow` in `src/features/agents/operations/guidedCreateWorkflow.ts` (wraps apply + remove-pending semantics).
3. `applyPendingGuidedSetupForAgent` in `src/features/agents/creation/recovery.ts` (applies a stored setup via gateway and returns updated pending map).
4. `beginPendingGuidedSetupRetry` / `endPendingGuidedSetupRetry` in `src/features/agents/creation/pendingSetupRetry.ts` (in-flight guard set updates).

The problem is not that these helpers exist; it’s that `src/app/page.tsx` coordinates them alongside browser storage reads/writes and React lifecycle logic in one place.

## Plan of Work

We will introduce small, explicit operation modules that encapsulate the current page-level orchestration, but take all side effects as injected dependencies so they can be unit tested with stubs. Then we will rewire `src/app/page.tsx` to call those modules and delete the now-duplicated inline logic.

The extraction is intentionally conservative: it should preserve all existing behavior and error messaging.

## Concrete Steps

All commands are run from the repository root:

    cd /Users/georgepickett/.codex/worktrees/59fe/openclaw-studio

### Milestone 1: Extract manual pending setup retry operation

Acceptance for this milestone:

1. `src/app/page.tsx` no longer contains the full implementation of `applyPendingCreateSetupForAgentId`; it delegates to an operation.
2. A unit test demonstrates the operation gates retries correctly (busy agent, in-flight guard, missing pending setup) and calls `runPendingSetupRetryLifecycle` with the expected injected deps.

1. Tests to write (must fail before implementation):

   Create `tests/unit/pendingGuidedSetupRetryOperation.test.ts` with:

   - `it("returns false when another retry is busy", ...)` asserting no lifecycle call.
   - `it("returns false and releases in-flight when setup is missing", ...)` asserting in-flight guard cleanup.
   - `it("runs lifecycle and clears busy/in-flight after completion", ...)` asserting `runPendingSetupRetryLifecycle` was invoked and cleanup happened.

2. Implementation:

   - Create `src/features/agents/operations/pendingGuidedSetupRetryOperation.ts` exporting:
     - `applyPendingGuidedSetupRetryViaStudio(params): Promise<boolean>`
   - Update `src/app/page.tsx` to replace the body of `applyPendingCreateSetupForAgentId` with a call to the operation, passing:
     - current `retryPendingSetupBusyAgentId`
     - `pendingCreateSetupsByAgentIdRef.current` lookup
     - `pendingSetupAutoRetryInFlightRef.current` guard set
     - injected `executeRetry` that preserves existing behavior (calls `runGuidedRetryWorkflow` + `applyPendingGuidedSetupForAgent` + remove pending).

3. Verification:

   - Run `npm test -- tests/unit/pendingGuidedSetupRetryOperation.test.ts` and confirm it fails before implementation and passes after.
   - Run `npm test`.

4. Commit:

   - Commit with message `Milestone 1: Extract pending guided setup retry operation`.

### Milestone 2: Extract pending setup auto-retry trigger operation

Acceptance for this milestone:

1. `src/app/page.tsx` no longer computes and executes the auto-retry intent inline; it delegates to an operation.
2. A unit test demonstrates that the operation:
   - skips when the intent is not `retry`
   - marks attempted agent ids when it does retry
   - calls the injected retry function with the selected agent id

1. Tests to write (must fail before implementation):

   Create `tests/unit/pendingGuidedSetupAutoRetryOperation.test.ts` with:

   - `it("skips when intent is not retry", ...)`
   - `it("marks attempted and triggers retry", ...)`

2. Implementation:

   - Create `src/features/agents/operations/pendingGuidedSetupAutoRetryOperation.ts` exporting:
     - `runPendingGuidedSetupAutoRetryViaStudio(params): Promise<boolean>`
   - Implement it using `resolvePendingSetupAutoRetryIntent` from `src/features/agents/operations/agentMutationLifecycleController.ts`, but move the side-effect wiring (mark attempted + call retry) into this operation.
   - Update `src/app/page.tsx` auto-retry `useEffect` to call this operation, injecting the existing attempted/in-flight sets and the existing `applyPendingCreateSetupForAgentId` as the retry function.

3. Verification:

   - Run `npm test -- tests/unit/pendingGuidedSetupAutoRetryOperation.test.ts` and confirm it fails before implementation and passes after.
   - Run `npm test`.

4. Commit:

   - Commit with message `Milestone 2: Extract pending guided setup auto-retry operation`.

### Milestone 3: Extract sessionStorage lifecycle helpers + full verification + docs

Acceptance for this milestone:

1. `src/app/page.tsx` no longer directly calls `loadPendingGuidedSetupsFromStorage` and `persistPendingGuidedSetupsToStorage`; it delegates through new lifecycle helpers.
2. `npm test` and `npm run typecheck` pass.
3. `ARCHITECTURE.md` is updated to reflect the new operation boundaries.

1. Tests to write (must fail before implementation):

   Create `tests/unit/pendingGuidedSetupSessionStorageLifecycle.test.ts` with:

   - `it("loads pending setups for a scope and returns the scope marker", ...)`
   - `it("does not persist when loaded scope mismatches", ...)`

2. Implementation:

   - Create `src/features/agents/creation/pendingGuidedSetupSessionStorageLifecycle.ts` exporting small helper functions:
     - `loadPendingGuidedSetupsForScope(...)`
     - `persistPendingGuidedSetupsForScopeWhenLoaded(...)`
   - Update the `useEffect` blocks in `src/app/page.tsx` that load/persist pending setups to call these helpers.

3. Verification:

   - Run `npm test`
   - Run `npm run typecheck`

4. Documentation:

   - Update `ARCHITECTURE.md`:
     - Mention the new pending guided setup retry and auto-retry operation modules in the Focused agent UI operations list.
     - If needed, add a short design decision bullet (or extend an existing one) describing why these workflows are extracted from the page.

5. Commit:

   - Commit with message `Milestone 3: Pending guided setup lifecycle extraction + docs`.

## Validation and Acceptance

Acceptance is met when all of the following are true:

1. `npm test` passes.
2. `npm run typecheck` passes.
3. `src/app/page.tsx` delegates:
   - manual pending guided setup retry
   - pending setup auto-retry trigger
   - pending setup sessionStorage load/persist
4. New unit tests pass:
   - `tests/unit/pendingGuidedSetupRetryOperation.test.ts`
   - `tests/unit/pendingGuidedSetupAutoRetryOperation.test.ts`
   - `tests/unit/pendingGuidedSetupSessionStorageLifecycle.test.ts`
5. No user-visible behavior changes are introduced (verified by keeping existing tests passing and preserving existing error strings).

## Idempotence and Recovery

This plan is safe to re-run.

If a milestone introduces regressions:

1. Revert only the last milestone commit.
2. Re-run `npm test` and `npm run typecheck`.
3. Re-apply the milestone in smaller steps (extract module without wiring, wire call sites, then delete old code).

## Artifacts and Notes

- (to be filled in during implementation)

## Interfaces and Dependencies

No new third-party dependencies should be introduced.

New module interfaces (final names and paths):

1. `src/features/agents/operations/pendingGuidedSetupRetryOperation.ts`
   - `applyPendingGuidedSetupRetryViaStudio(...) => Promise<boolean>`
2. `src/features/agents/operations/pendingGuidedSetupAutoRetryOperation.ts`
   - `runPendingGuidedSetupAutoRetryViaStudio(...) => Promise<boolean>`
3. `src/features/agents/creation/pendingGuidedSetupSessionStorageLifecycle.ts`
   - `loadPendingGuidedSetupsForScope(...)`
   - `persistPendingGuidedSetupsForScopeWhenLoaded(...)`
