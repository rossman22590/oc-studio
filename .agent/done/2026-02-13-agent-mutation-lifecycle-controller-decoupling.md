# Decouple Agent Mutation Lifecycle Controller From `src/app/page.tsx`

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

The source-of-truth planning guide for this repository is `/Users/georgepickett/openclaw-studio/.agent/PLANS.md`, and this document must be maintained in accordance with that file.

## Purpose / Big Picture

After this change, creating, renaming, deleting, and pending-setup retrying agents should behave exactly as they do today from the user’s perspective, including queueing, lock screens, restart waits, and retry messaging. The improvement is architectural: lifecycle decisions that currently live across many effects and callbacks in `/Users/georgepickett/openclaw-studio/src/app/page.tsx` will move into one explicit controller module that can be tested without React, timers, storage, or gateway networking.

You can verify success by running the new lifecycle controller tests and then confirming existing mutation workflow tests still pass. In the UI, the same mutation actions should still produce the same visible status lines and lock behavior.

## Progress

- [x] (2026-02-13 05:24Z) Identified the highest-impact entanglement as the agent mutation lifecycle flow spanning create, rename, delete, restart-wait, and pending setup retry policy.
- [x] (2026-02-13 05:24Z) Authored Beads milestones and dependencies for this plan: `bd-4fo` -> `bd-2n2` -> `bd-31t`.
- [x] (2026-02-13 05:27Z) Implemented Milestone 1: added `agentMutationLifecycleController` and failing-first unit tests for start guards, phase transitions, post-run intent, auto-retry selection, and timeout intent. [bd-4fo]
- [x] (2026-02-13 05:30Z) Implemented Milestone 2: rewired create/rename/delete start guards, queued block creation, post-run transitions, and pending setup auto-retry selection in `src/app/page.tsx` to consume lifecycle controller intents; added integration parity coverage. [bd-2n2]
- [x] (2026-02-13 05:33Z) Implemented Milestone 3: added typed mutation side-effect commands to lifecycle controller, rewired rename/delete page handlers to execute command sequences, expanded controller integration coverage, and updated architecture docs. [bd-31t]
- [x] (2026-02-13 05:33Z) Final verification completed; final targeted test bundle passed, known baseline typecheck failures were unchanged, and `br sync --flush-only` reported clean export state.

## Surprises & Discoveries

- Observation: `src/app/page.tsx` is still the effective source of truth for mutation lifecycle transitions even after workflow extraction work.
  Evidence: create (`:1726`), rename (`:2278`), delete (`:1456`), pending setup retry (`:765` and `:953`), and restart timeout handling (`:1859`) all coordinate domain decisions and side effects in-page.

- Observation: pure policy modules already exist for adjacent concerns, but page-level composition still duplicates cross-flow guard logic.
  Evidence: `guidedCreateWorkflow.ts`, `configMutationWorkflow.ts`, `pendingSetupLifecycleWorkflow.ts`, and `useConfigMutationQueue.ts` are pure/testable, but gating and transitions are still wired separately in `page.tsx`.

- Observation: this area has high change frequency, increasing regression risk when policy and side effects are edited together.
  Evidence: recent commit history for `src/app/page.tsx` includes multiple lifecycle refactors (`0ea400b`, `c935df1`, `9c4ccdd`, `592a338`, `9d71358`).

- Observation: existing pending setup retry selection helpers were already sufficiently pure and reusable for controller composition.
  Evidence: `selectNextPendingGuidedSetupRetryAgentId` in `src/features/agents/creation/pendingSetupRetry.ts` only consumes plain sets/maps and returns an ID without side effects.

- Observation: mutation post-run branching for rename/delete can be represented directly from workflow `disposition` without the richer `resolveConfigMutationPostRunEffects` shape.
  Evidence: `result.disposition` from `runConfigMutationWorkflow` was sufficient to drive clear vs awaiting-restart behavior through `resolveMutationPostRunIntent`.

- Observation: typed command emission cleanly preserved rename/delete post-run behavior while removing duplicated branching in page handlers.
  Evidence: `buildMutationSideEffectCommands` now emits `reload-agents`, `clear-mutation-block`, `set-mobile-pane`, and `patch-mutation-block`; both rename/delete handlers execute this same command set.

## Decision Log

- Decision: keep existing user-visible behavior as a hard compatibility constraint while changing only architecture boundaries.
  Rationale: this flow is already user-facing and frequently modified; behavior drift would obscure whether decoupling succeeded.
  Date/Author: 2026-02-13 / Codex

- Decision: introduce one pure controller module that composes existing workflow policies rather than replacing those workflows.
  Rationale: `guidedCreateWorkflow`, `configMutationWorkflow`, and `pendingSetupLifecycleWorkflow` already carry validated policy slices, so composing them avoids unnecessary rewrites.
  Date/Author: 2026-02-13 / Codex

- Decision: model page integration as intent/command mapping where controller output drives side effects, but page still executes gateway and React state effects.
  Rationale: this keeps I/O ownership in the page adapter while moving decision logic into testable pure contracts.
  Date/Author: 2026-02-13 / Codex

- Decision: implement retry intent selection by composing `shouldAttemptPendingSetupAutoRetry` and `selectNextPendingGuidedSetupRetryAgentId` rather than duplicating gate logic.
  Rationale: this preserves established behavior and avoids introducing a second source of truth for retry gating.
  Date/Author: 2026-02-13 / Codex

- Decision: keep rename/delete start guards status-agnostic (`status: "connected"` literal) to preserve existing queue-first behavior while still centralizing block-conflict checks in controller logic.
  Rationale: previous page behavior allowed these operations to enqueue based on block conflicts rather than immediate disconnected-state rejection.
  Date/Author: 2026-02-13 / Codex

- Decision: express rename/delete post-run side effects as typed command lists (`buildMutationSideEffectCommands`) and execute commands in page adapters.
  Rationale: this creates a stable boundary between policy and I/O without moving gateway/React effects out of page ownership.
  Date/Author: 2026-02-13 / Codex

## Outcomes & Retrospective

Completed.

- Added `src/features/agents/operations/agentMutationLifecycleController.ts` with pure contracts for mutation start guards, block transitions, post-run intents, side-effect command emission, pending auto-retry intent, and timeout intent.
- Rewired `src/app/page.tsx` to consume controller intents for create/rename/delete guards, queued block construction, rename/delete post-run side-effect command execution, and pending setup auto-retry target selection.
- Added controller-focused tests:
  - `tests/unit/agentMutationLifecycleController.test.ts`
  - `tests/unit/agentMutationLifecycleController.integration.test.ts`
- Updated `ARCHITECTURE.md` to document the mutation lifecycle controller boundary and typed post-run command execution path.
- Verification status:
  - `npm run test -- tests/unit/agentMutationLifecycleController.test.ts` passed.
  - `npm run test -- tests/unit/agentMutationLifecycleController.integration.test.ts tests/unit/guidedCreateWorkflow.integration.test.ts tests/unit/configMutationWorkflow.integration.test.ts tests/unit/lifecycleControllerWorkflow.integration.test.ts` passed.
  - `npm run test -- tests/unit/agentMutationLifecycleController.test.ts tests/unit/agentMutationLifecycleController.integration.test.ts tests/unit/guidedCreateWorkflow.integration.test.ts tests/unit/configMutationWorkflow.integration.test.ts tests/unit/lifecycleControllerWorkflow.integration.test.ts` passed.
  - `npm run test -- tests/unit/agentMutationLifecycleController.test.ts tests/unit/agentMutationLifecycleController.integration.test.ts tests/unit/guidedCreateWorkflow.integration.test.ts tests/unit/configMutationWorkflow.integration.test.ts tests/unit/lifecycleControllerWorkflow.integration.test.ts tests/unit/chatSendOperation.test.ts tests/unit/historyLifecycleWorkflow.integration.test.ts` passed.
  - `npm run typecheck` still reports only known baseline failures in `src/features/agents/state/transcript.ts` and `tests/unit/gatewayProxy.test.ts`.

## Context and Orientation

In this repository, a “mutation lifecycle” is the complete flow for create, rename, and delete operations, including queue gating, lock-screen phase transitions, restart waiting, timeout handling, and pending guided setup retry. A “pending guided setup” is a stored per-agent setup payload that must be retried after partial create success. A “controller” in this plan means a pure TypeScript module that receives plain data and returns explicit decisions; it does not call gateway methods, React hooks, timers, `window`, or storage APIs.

Relevant files today:

- `/Users/georgepickett/openclaw-studio/src/app/page.tsx`: orchestrates mutation blocks, queue calls, pending setup retry effects, and user-visible lock status.
- `/Users/georgepickett/openclaw-studio/src/features/agents/operations/guidedCreateWorkflow.ts`: pure create/retry workflow outcomes.
- `/Users/georgepickett/openclaw-studio/src/features/agents/operations/configMutationWorkflow.ts`: pure rename/delete mutation disposition and status helpers.
- `/Users/georgepickett/openclaw-studio/src/features/agents/operations/pendingSetupLifecycleWorkflow.ts`: pure auto-retry and retry error policy helpers.
- `/Users/georgepickett/openclaw-studio/src/features/agents/operations/useConfigMutationQueue.ts`: queue execution primitive.
- `/Users/georgepickett/openclaw-studio/tests/unit/guidedCreateWorkflow.integration.test.ts`: existing guided create behavior anchors.
- `/Users/georgepickett/openclaw-studio/tests/unit/configMutationWorkflow.integration.test.ts`: existing mutation disposition anchors.
- `/Users/georgepickett/openclaw-studio/tests/unit/lifecycleControllerWorkflow.integration.test.ts`: existing pending setup retry policy anchors.
- `/Users/georgepickett/openclaw-studio/ARCHITECTURE.md`: architecture boundary documentation that must reflect the new controller.

Known baseline caveat: repository-wide `npm run typecheck` currently reports pre-existing failures in `/Users/georgepickett/openclaw-studio/src/features/agents/state/transcript.ts` and `/Users/georgepickett/openclaw-studio/tests/unit/gatewayProxy.test.ts`. Those baseline failures are acceptable if unchanged.

## Milestones

### Milestone 1: Model mutation lifecycle as pure transitions

Create `/Users/georgepickett/openclaw-studio/src/features/agents/operations/agentMutationLifecycleController.ts` with explicit contracts for start guards, mutation block phase transitions, pending setup auto-retry intent selection, and timeout intent resolution. End state: lifecycle decisions are unit-testable without React, gateway calls, or storage.

### Milestone 2: Rewire page mutation handlers through controller intents

Refactor `/Users/georgepickett/openclaw-studio/src/app/page.tsx` so create/rename/delete handlers and pending setup auto-retry effect call controller helpers for decisions, while preserving existing side effects and UI updates. End state: page executes commands, controller owns branching decisions.

### Milestone 3: Consolidate mutation command boundary and document architecture

Introduce a narrow mutation command boundary in page adapters (for example, typed command handlers for reload, block patch/clear, and error surfacing), update regression tests, and refresh `/Users/georgepickett/openclaw-studio/ARCHITECTURE.md` to describe the controller boundary.

## Plan of Work

Begin by adding a pure controller module under `src/features/agents/operations/` that does not import React or browser APIs. Its inputs should be plain data snapshots from page state, and its outputs should be explicit intents describing what the page should do next. Keep behavior consistent by reusing existing workflow helpers where appropriate rather than duplicating policy.

Next, update `src/app/page.tsx` in small slices. First, replace create/rename/delete start guards with controller guard output. Then route post-mutation block transitions through controller results instead of inline branching. Finally, route pending setup auto-retry target selection through controller intent output while preserving existing retry runner and side effects.

After rewiring, add or update integration tests to prove behavior parity and then refresh architecture documentation so the new boundary is explicit for future contributors.

## Concrete Steps

Work from `/Users/georgepickett/openclaw-studio`.

1. Claim Milestone 1 and write failing tests first.

    br ready --json
    br update bd-4fo --claim --json
    npm run test -- tests/unit/agentMutationLifecycleController.test.ts

Expected pre-implementation signal: Vitest reports missing file or missing exports.

2. Implement Milestone 1 controller contracts and pass tests.

    npm run test -- tests/unit/agentMutationLifecycleController.test.ts
    git add src/features/agents/operations/agentMutationLifecycleController.ts tests/unit/agentMutationLifecycleController.test.ts
    git commit -m "Milestone 1: Model agent mutation lifecycle transitions"
    br close bd-4fo --reason "Tests pass, committed" --json

3. Claim Milestone 2 and add failing integration tests for page adapter parity.

    br update bd-2n2 --claim --json
    npm run test -- tests/unit/agentMutationLifecycleController.integration.test.ts

4. Rewire page handlers and verify Milestone 2.

    npm run test -- tests/unit/agentMutationLifecycleController.integration.test.ts tests/unit/guidedCreateWorkflow.integration.test.ts tests/unit/configMutationWorkflow.integration.test.ts tests/unit/lifecycleControllerWorkflow.integration.test.ts
    git add src/app/page.tsx src/features/agents/operations/agentMutationLifecycleController.ts tests/unit/agentMutationLifecycleController.integration.test.ts
    git commit -m "Milestone 2: Route page mutation handlers through lifecycle controller"
    br close bd-2n2 --reason "Tests pass, committed" --json

5. Claim Milestone 3 and add failing boundary regression tests.

    br update bd-31t --claim --json
    npm run test -- tests/unit/agentMutationLifecycleController.integration.test.ts

6. Implement command-boundary consolidation, docs update, and verify Milestone 3.

    npm run test -- tests/unit/agentMutationLifecycleController.test.ts tests/unit/agentMutationLifecycleController.integration.test.ts tests/unit/guidedCreateWorkflow.integration.test.ts tests/unit/configMutationWorkflow.integration.test.ts tests/unit/lifecycleControllerWorkflow.integration.test.ts
    npm run typecheck
    git add src/app/page.tsx src/features/agents/operations/agentMutationLifecycleController.ts tests/unit/agentMutationLifecycleController.test.ts tests/unit/agentMutationLifecycleController.integration.test.ts ARCHITECTURE.md
    git commit -m "Milestone 3: Consolidate mutation lifecycle boundary and docs"
    br close bd-31t --reason "Tests pass, committed" --json

7. Final verification and Beads flush.

    npm run test -- tests/unit/agentMutationLifecycleController.test.ts tests/unit/agentMutationLifecycleController.integration.test.ts tests/unit/guidedCreateWorkflow.integration.test.ts tests/unit/configMutationWorkflow.integration.test.ts tests/unit/lifecycleControllerWorkflow.integration.test.ts tests/unit/chatSendOperation.test.ts tests/unit/historyLifecycleWorkflow.integration.test.ts
    npm run typecheck
    br sync --flush-only

## Validation and Acceptance

Milestone 1 verification workflow:

1. Tests to write first in `tests/unit/agentMutationLifecycleController.test.ts`:
   `it("blocks mutation starts when another mutation block is active")` must assert deny reasons for active create/rename/delete blocks and disconnected status.
   `it("builds deterministic queued and mutating block transitions")` must assert create/rename/delete block shape parity with existing page expectations.
   `it("resolves post-mutation block outcomes for completed vs awaiting-restart")` must assert clear vs awaiting-restart patch behavior.
   `it("selects pending setup auto-retry target only when all gates pass")` must assert parity with current gate semantics.
   `it("returns timeout intent when mutation block exceeds max wait")` must assert timeout signaling for restart/create lock flows.
2. Implementation: add `agentMutationLifecycleController.ts` with pure transition helpers and explicit output unions.
3. Verification: run `npm run test -- tests/unit/agentMutationLifecycleController.test.ts`.
4. Commit: `Milestone 1: Model agent mutation lifecycle transitions`.

Milestone 2 verification workflow:

1. Tests to write first in `tests/unit/agentMutationLifecycleController.integration.test.ts`:
   `it("page create handler maps controller decisions to guided create flow side effects")` must assert unchanged create success/pending behavior.
   `it("page rename and delete handlers share lifecycle guard + post-run transitions")` must assert unchanged clear/awaiting-restart behavior.
   `it("page pending setup auto-retry effect only runs for controller retry intents")` must assert no retry side effect for skip intents.
2. Implementation: rewire handler branching in `src/app/page.tsx` to call controller helpers and keep all I/O in page.
3. Verification: run `npm run test -- tests/unit/agentMutationLifecycleController.integration.test.ts tests/unit/guidedCreateWorkflow.integration.test.ts tests/unit/configMutationWorkflow.integration.test.ts tests/unit/lifecycleControllerWorkflow.integration.test.ts`.
4. Commit: `Milestone 2: Route page mutation handlers through lifecycle controller`.

Milestone 3 verification workflow:

1. Tests to write first by extending `tests/unit/agentMutationLifecycleController.integration.test.ts`:
   `it("uses typed mutation commands for lifecycle side effects instead of inline branching")` must assert command-driven parity for block patching, reload, and error surfacing.
   `it("preserves lock-status text behavior across queued, mutating, and awaiting-restart phases")` must assert no UI status regression.
2. Implementation: introduce typed mutation command boundary in page adapter, update `ARCHITECTURE.md` with new boundary, and keep behavior unchanged.
3. Verification: run milestone test bundle and `npm run typecheck`; known baseline failures in `src/features/agents/state/transcript.ts` and `tests/unit/gatewayProxy.test.ts` are acceptable if unchanged.
4. Commit: `Milestone 3: Consolidate mutation lifecycle boundary and docs`.

Behavioral acceptance for the full plan:

- Create, rename, and delete flows still queue when runs are active, show the same lock-screen phases, and recover from restart wait exactly as before.
- Pending guided setup auto-retry still runs once per eligible agent and suppresses disconnect-like noise on auto paths.
- Manual retry still surfaces actionable error messages.
- Lifecycle decision logic for these flows is no longer primarily encoded as inline branching in `src/app/page.tsx`.

## Idempotence and Recovery

All milestones are additive and safe to rerun. Test commands and `br` status updates are idempotent. If a rewiring step breaks behavior, reset to the previous milestone commit and re-apply in smaller slices: first start guards, then post-run transitions, then pending-retry intent routing. Keep gateway side effects in `page.tsx` until all targeted tests pass.

Do not close a milestone Bead until its test bundle passes and the milestone commit exists. If `npm run typecheck` shows only the known baseline failures, continue; if new failures appear in touched files, treat that as a blocker and resolve before closing the milestone.

## Artifacts and Notes

Expected failing-first signal for Milestone 1:

    npm run test -- tests/unit/agentMutationLifecycleController.test.ts
    No test files found, exiting with code 1

Expected passing signal after Milestone 1:

    npm run test -- tests/unit/agentMutationLifecycleController.test.ts
    ✓ blocks mutation starts when another mutation block is active
    ✓ builds deterministic queued and mutating block transitions
    ✓ resolves post-mutation block outcomes for completed vs awaiting-restart
    ✓ selects pending setup auto-retry target only when all gates pass
    ✓ returns timeout intent when mutation block exceeds max wait

Expected final bundle signal:

    npm run test -- tests/unit/agentMutationLifecycleController.test.ts tests/unit/agentMutationLifecycleController.integration.test.ts tests/unit/guidedCreateWorkflow.integration.test.ts tests/unit/configMutationWorkflow.integration.test.ts tests/unit/lifecycleControllerWorkflow.integration.test.ts tests/unit/chatSendOperation.test.ts tests/unit/historyLifecycleWorkflow.integration.test.ts
    Test Files  ... passed
    Tests       ... passed

Known typecheck baseline note (unless independently fixed during implementation):

    npm run typecheck
    src/features/agents/state/transcript.ts ... TS18047
    tests/unit/gatewayProxy.test.ts ... TS7016/TS7006

## Interfaces and Dependencies

Add `/Users/georgepickett/openclaw-studio/src/features/agents/operations/agentMutationLifecycleController.ts` with explicit pure contracts.

Required contracts:

- `type MutationKind = "create-agent" | "rename-agent" | "delete-agent"`
- `type MutationBlockPhase = "queued" | "mutating" | "awaiting-restart"`
- `type MutationBlockState = { kind: MutationKind; agentId: string; agentName: string; phase: MutationBlockPhase; startedAt: number; sawDisconnect: boolean }`
- `type MutationStartGuardResult = { kind: "allow" } | { kind: "deny"; reason: "not-connected" | "create-block-active" | "rename-block-active" | "delete-block-active" }`
- `function resolveMutationStartGuard(params: { status: "connected" | "connecting" | "disconnected"; hasCreateBlock: boolean; hasRenameBlock: boolean; hasDeleteBlock: boolean }): MutationStartGuardResult`
- `function buildQueuedMutationBlock(params: { kind: MutationKind; agentId: string; agentName: string; startedAt: number }): MutationBlockState`
- `function buildMutatingMutationBlock(block: MutationBlockState): MutationBlockState`
- `type MutationPostRunIntent = { kind: "clear" } | { kind: "awaiting-restart"; patch: { phase: "awaiting-restart"; sawDisconnect: boolean } }`
- `function resolveMutationPostRunIntent(params: { disposition: "completed" | "awaiting-restart" }): MutationPostRunIntent`
- `type PendingSetupAutoRetryIntent = { kind: "skip"; reason: "not-connected" | "agents-not-loaded" | "scope-mismatch" | "create-block-active" | "retry-busy" | "no-eligible-agent" } | { kind: "retry"; agentId: string }`
- `function resolvePendingSetupAutoRetryIntent(params: { status: "connected" | "connecting" | "disconnected"; agentsLoadedOnce: boolean; loadedScopeMatches: boolean; hasActiveCreateBlock: boolean; retryBusyAgentId: string | null; pendingSetupsByAgentId: Record<string, unknown>; knownAgentIds: Set<string>; attemptedAgentIds: Set<string>; inFlightAgentIds: Set<string> }): PendingSetupAutoRetryIntent`
- `type MutationTimeoutIntent = { kind: "none" } | { kind: "timeout"; reason: "create-timeout" | "rename-timeout" | "delete-timeout" }`
- `function resolveMutationTimeoutIntent(params: { block: MutationBlockState | null; nowMs: number; maxWaitMs: number }): MutationTimeoutIntent`

Reuse, do not duplicate:

- `runGuidedCreateWorkflow` and `resolveGuidedCreateCompletion` in `/Users/georgepickett/openclaw-studio/src/features/agents/operations/guidedCreateWorkflow.ts`
- `runConfigMutationWorkflow` and `resolveConfigMutationPostRunEffects` in `/Users/georgepickett/openclaw-studio/src/features/agents/operations/configMutationWorkflow.ts`
- `runPendingSetupRetryLifecycle` plus current retry gate helpers in `/Users/georgepickett/openclaw-studio/src/features/agents/operations/pendingSetupLifecycleWorkflow.ts` and `/Users/georgepickett/openclaw-studio/src/features/agents/creation/pendingSetupRetry.ts`
- queue execution in `/Users/georgepickett/openclaw-studio/src/features/agents/operations/useConfigMutationQueue.ts`

Maintain existing user-facing mutation behavior unless failing-first tests explicitly codify a corrected behavior.

Revision Note (2026-02-13 05:24Z, Codex): Created this ExecPlan from the identified mutation lifecycle entanglement and added Beads milestones (`bd-4fo`, `bd-2n2`, `bd-31t`) with dependencies to support implementation sequencing.
Revision Note (2026-02-13 05:27Z, Codex): Completed Milestone 1 with a new pure mutation lifecycle controller module and passing failing-first unit coverage.
Revision Note (2026-02-13 05:30Z, Codex): Completed Milestone 2 with page-level mutation/retry rewiring through controller intents and integration parity tests.
Revision Note (2026-02-13 05:33Z, Codex): Completed Milestone 3 with typed mutation side-effect command boundary, architecture updates, final verification, and Beads flush.
